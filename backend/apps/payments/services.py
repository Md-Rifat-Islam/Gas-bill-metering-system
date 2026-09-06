"""
Shared bKash checkout logic, used by both the staff-facing initiate
endpoint (apps.payments.views.BkashInitiateView) and the customer portal's
initiate endpoint (apps.portal.views.PortalPaymentInitiateView), so both
entry points create transactions and finalize payments identically.
"""
import logging
import uuid
from decimal import Decimal

from django.conf import settings
from django.db import transaction as db_transaction
from django.utils import timezone

from apps.audit.utils import log_action
from . import bkash_client
from .bkash_client import BkashError
from .models import Payment, PaymentTransaction

logger = logging.getLogger('bkash')


def _field(data, *keys):
    """
    bKash's public docs and every third-party client use `paymentID` /
    `trxID` (capital ID) consistently -- but this account may be on a
    different "V2" spec bKash sent by email that we can't independently
    verify. Rather than betting on one casing and silently storing None
    if we guessed wrong, try every casing we've seen and log if none hit,
    so a mismatch shows up in the logs instead of vanishing.
    """
    for key in keys:
        if data.get(key):
            return data.get(key)
    logger.warning('bKash response missing expected field %s: %s', keys, data)
    return None


def initiate_bkash_checkout(bill, *, source, initiated_by_customer=None, initiated_by_staff=None):
    """
    Creates a bKash Tokenized Checkout payment and a matching pending
    PaymentTransaction row. Returns the transaction -- read
    `txn.raw_response['bkashURL']` for the URL to redirect the browser to.
    Raises BkashError on failure; callers should surface str(exc) to the
    user and let them fall back to the manual payment-channels flow.
    """
    amount = bill.due_amount
    if amount <= 0:
        raise BkashError('This bill has no due amount.')

    invoice_ref = f"{bill.bill_number}-{uuid.uuid4().hex[:6].upper()}"
    callback_url = f"{settings.BACKEND_URL}/api/v1/payments/bkash/callback/"

    data = bkash_client.create_payment(amount, invoice_ref, callback_url)
    payment_id = _field(data, 'paymentID', 'paymentId')

    if not payment_id:
        # We got a 2xx / statusCode-success response but couldn't find a
        # payment id under any casing we know -- treat this as a failure
        # rather than silently creating an unmatchable transaction (one
        # the callback could never look up later).
        raise BkashError('bKash did not return a payment reference. Please try again.')

    txn = PaymentTransaction.objects.create(
        bill=bill,
        gateway_name='bKash',
        gateway_transaction_id=invoice_ref,
        bkash_payment_id=payment_id,
        amount=amount,
        status=PaymentTransaction.STATUS_PENDING,
        raw_response=data,
        source=source,
        initiated_by_customer=initiated_by_customer,
        initiated_by_staff=initiated_by_staff,
    )
    return txn


def complete_bkash_transaction(txn):
    """
    Called from the callback view once bKash reports the customer
    completed checkout. Executes the payment server-side (never trusts the
    redirect's query string alone), then creates the actual Payment record
    and applies it to the bill -- exactly like the existing manual/portal
    flows do, just auto-approved instead of going through the review queue.

    Idempotent: if this transaction already has a linked Payment (e.g. the
    customer's browser re-hit the callback URL via back-button), it just
    returns the existing one instead of double-crediting the bill.
    """
    if txn.payment_id:
        return txn.payment, True

    result = bkash_client.execute_payment(txn.bkash_payment_id)
    txn.raw_response = {**(txn.raw_response or {}), 'execute': result}

    if result.get('transactionStatus') != 'Completed' or result.get('statusCode') not in ('0000', None):
        # NOTE: some V2-style responses may omit statusCode on success and
        # rely on HTTP status + transactionStatus alone -- adjust this
        # condition once you've confirmed the real shape from bKash's docs.
        txn.status = PaymentTransaction.STATUS_FAILED
        txn.save(update_fields=['status', 'raw_response'])
        logger.warning('bKash execute did not complete for txn %s: %s', txn.id, result)
        raise BkashError(result.get('statusMessage') or result.get('message') or 'Payment was not completed.')

    # bKash already confirmed the amount server-side; still cross-check
    # against what we asked for, in case of a config/version mismatch.
    if Decimal(str(result.get('amount', '0'))) != Decimal(str(txn.amount)):
        txn.status = PaymentTransaction.STATUS_FAILED
        txn.save(update_fields=['status', 'raw_response'])
        raise BkashError('Amount mismatch on bKash confirmation.')

    trx_id = _field(result, 'trxID', 'trxId') or txn.gateway_transaction_id

    with db_transaction.atomic():
        payment = Payment.objects.create(
            bill=txn.bill,
            paid_amount=txn.amount,
            payment_method=Payment.METHOD_BKASH,
            transaction_id=trx_id,
            payment_date=timezone.now().date(),
            source=(
                Payment.SOURCE_CUSTOMER if txn.source == PaymentTransaction.SOURCE_CUSTOMER
                else Payment.SOURCE_STAFF
            ),
            status=Payment.STATUS_APPROVED,
            submitted_by_customer=txn.initiated_by_customer,
            received_by=txn.initiated_by_staff,
            reviewed_by=txn.initiated_by_staff,
            reviewed_at=timezone.now() if txn.initiated_by_staff else None,
            notes='Auto-recorded via bKash checkout.',
        )
        payment.bill.apply_payment(payment.paid_amount)

        txn.status = PaymentTransaction.STATUS_SUCCESS
        txn.gateway_transaction_id = trx_id
        txn.payment = payment
        txn.save(update_fields=['status', 'gateway_transaction_id', 'payment', 'raw_response'])

        # Mirrors the existing convention: customer-initiated actions log
        # with user=None and the customer's identity folded into the data
        # dict instead (see PortalPaymentSubmitSerializer.create).
        log_action(txn.initiated_by_staff, 'payments', payment.id, 'CREATE', None, {
            'bill_id': payment.bill.id,
            'amount': str(payment.paid_amount),
            'method': 'bKash',
            'status': payment.status,
            'gateway': 'bkash_checkout',
            'trx_id': trx_id,
            'customer_id': txn.initiated_by_customer_id,
        })

    return payment, False