"""
bKash Tokenized Checkout V2 (Non-Beta) API client.

Based on:
PGW Tokenized Payment V2 (Non-Beta)
API Specification - V1.2

Responsibilities:
- Grant bKash application token
- Refresh bKash application token
- Create Tokenized Checkout payment
- Execute payment after successful callback
- Query payment status

Payment/business orchestration remains in services.py.

NOTE ON FIELD CASING: bKash's public v1.2.0-beta docs and every
third-party client use `paymentID` / `trxID` (capital ID) consistently.
This file targets a different "V2 Non-Beta" spec that may use different
casing -- unconfirmed against the actual Postman collection / PDF as of
this writing. `_field()` below checks both casings defensively so a
guessed-wrong casing doesn't silently break the integration; once you've
confirmed the real key names from bKash's docs, this can be simplified
back to a single `.get()`.
"""

import logging
from datetime import timedelta

import requests
from django.conf import settings
from django.utils import timezone


logger = logging.getLogger("bkash")


class BkashError(Exception):
    """Raised when a bKash API request fails."""

    pass


def _field(data, *keys):
    for key in keys:
        if data.get(key):
            return data.get(key)
    return None


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

def _base_url():
    """
    Return the configured bKash V2 API base URL.

    Expected:
        https://tokenized.sandbox.bka.sh/v2

    Do not include a trailing slash.
    """
    return settings.BKASH_BASE_URL.rstrip("/")


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def _auth_headers():
    """
    Headers required by the bKash Grant Token / Refresh Token APIs.

    According to the V2 specification:
        username -> merchant username
        password -> merchant password
    """
    return {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "username": settings.BKASH_USERNAME,
        "password": settings.BKASH_PASSWORD,
    }


def _payment_headers(id_token):
    """
    Headers required by authenticated payment APIs.

    V2 specification requires:
        Authorization -> generated id_token
        X-App-Key     -> merchant application key
    """
    return {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": id_token,
        "X-App-Key": settings.BKASH_APP_KEY,
    }


def _parse_response(response):
    """
    Safely parse a bKash JSON response.

    bKash normally returns JSON, but this prevents JSON decoding errors
    from hiding the actual HTTP/API failure.
    """
    try:
        return response.json()
    except ValueError:
        logger.error(
            "bKash returned non-JSON response. HTTP %s: %s",
            response.status_code,
            response.text[:500],
        )
        raise BkashError(
            "Invalid response received from bKash. Please try again shortly."
        )


# ---------------------------------------------------------------------------
# Grant Token
# ---------------------------------------------------------------------------

def _grant_token():
    """
    Generate a new bKash application authorization token.

    V2 endpoint:
        POST /tokenized-checkout/auth/grant-token

    Headers:
        username
        password

    Body:
        app_key
        app_secret
    """
    from .models import BkashToken

    url = f"{_base_url()}/tokenized-checkout/auth/grant-token"

    payload = {
        "app_key": settings.BKASH_APP_KEY,
        "app_secret": settings.BKASH_APP_SECRET,
    }

    try:
        response = requests.post(
            url,
            json=payload,
            headers=_auth_headers(),
            timeout=30,
        )
    except requests.RequestException as exc:
        logger.exception("bKash grant token request failed: %s", exc)
        raise BkashError(
            "Could not connect to bKash. Please try again shortly."
        ) from exc

    data = _parse_response(response)

    if response.status_code >= 400:
        logger.error(
            "bKash grant token HTTP %s: %s",
            response.status_code,
            data,
        )
        raise BkashError(
            data.get("errorMessageEn")
            or data.get("message")
            or "Could not authenticate with bKash. Please try again shortly."
        )

    if "id_token" not in data:
        logger.error("bKash grant token failed: %s", data)

        raise BkashError(
            data.get("errorMessageEn")
            or data.get("message")
            or "Could not authenticate with bKash. Please try again shortly."
        )

    expires_in = int(data.get("expires_in", 3600))

    token_obj = BkashToken.get_solo()

    token_obj.id_token = data["id_token"]
    token_obj.refresh_token = data.get("refresh_token", "")

    # Refresh slightly before actual expiration.
    token_obj.expires_at = (
        timezone.now()
        + timedelta(seconds=max(expires_in - 60, 60))
    )

    token_obj.save(
        update_fields=[
            "id_token",
            "refresh_token",
            "expires_at",
            "updated_at",
        ]
    )

    logger.info("bKash grant token generated successfully.")

    return token_obj.id_token


# ---------------------------------------------------------------------------
# Refresh Token
# ---------------------------------------------------------------------------

def _refresh_token():
    """
    Refresh an existing bKash application token.

    V2 endpoint:
        POST /tokenized-checkout/auth/refresh-token

    Body:
        app_key
        app_secret
        refresh_token
    """
    from .models import BkashToken

    token_obj = BkashToken.get_solo()

    if not token_obj.refresh_token:
        logger.info(
            "No bKash refresh token available; requesting new grant token."
        )
        return _grant_token()

    url = f"{_base_url()}/tokenized-checkout/auth/refresh-token"

    payload = {
        "app_key": settings.BKASH_APP_KEY,
        "app_secret": settings.BKASH_APP_SECRET,
        "refresh_token": token_obj.refresh_token,
    }

    try:
        response = requests.post(
            url,
            json=payload,
            headers=_auth_headers(),
            timeout=30,
        )
    except requests.RequestException as exc:
        logger.exception("bKash refresh token request failed: %s", exc)

        # If refresh cannot be performed because of a connection problem,
        # don't silently issue another grant request.
        raise BkashError(
            "Could not connect to bKash. Please try again shortly."
        ) from exc

    data = _parse_response(response)

    if response.status_code >= 400:
        logger.warning(
            "bKash refresh token failed HTTP %s: %s",
            response.status_code,
            data,
        )

        # Refresh token may have expired/been invalidated.
        # Fall back to grant token.
        return _grant_token()

    if "id_token" not in data:
        logger.warning(
            "bKash refresh token returned unexpected response: %s",
            data,
        )

        return _grant_token()

    expires_in = int(data.get("expires_in", 3600))

    token_obj.id_token = data["id_token"]
    token_obj.refresh_token = data.get(
        "refresh_token",
        token_obj.refresh_token,
    )

    token_obj.expires_at = (
        timezone.now()
        + timedelta(seconds=max(expires_in - 60, 60))
    )

    token_obj.save(
        update_fields=[
            "id_token",
            "refresh_token",
            "expires_at",
            "updated_at",
        ]
    )

    logger.info("bKash token refreshed successfully.")

    return token_obj.id_token


# ---------------------------------------------------------------------------
# Valid Token
# ---------------------------------------------------------------------------

def get_valid_token():
    """
    Return a valid bKash authorization token.

    Strategy:
    1. Use existing non-expired token.
    2. Try refresh token when available.
    3. Fall back to grant token.
    """
    from .models import BkashToken

    token_obj = BkashToken.get_solo()

    if (
        token_obj.id_token
        and token_obj.expires_at
        and token_obj.expires_at > timezone.now()
    ):
        return token_obj.id_token

    if token_obj.refresh_token:
        try:
            return _refresh_token()
        except BkashError:
            logger.warning(
                "bKash token refresh failed; requesting a new grant token."
            )

    return _grant_token()


# ---------------------------------------------------------------------------
# Create Payment
# ---------------------------------------------------------------------------

def create_payment(amount, invoice_number, callback_url):
    """
    Create a Tokenized Checkout payment.

    V2 endpoint:
        POST /tokenized-checkout/payment/create

    Returns bKash response containing (field casing per bKash's public
    v1.2.0-beta docs; unconfirmed for this V2 spec -- see _field() below):
        paymentID / paymentId
        bkashURL
        callbackURL
        transactionStatus
        merchantInvoiceNumber
        etc.
    """

    id_token = get_valid_token()

    url = f"{_base_url()}/tokenized-checkout/payment/create"

    payload = {
        "payerReference": invoice_number[:20],
        "callbackURL": callback_url,
        "amount": str(amount),
        "currency": "BDT",
        "intent": "sale",
        "merchantInvoiceNumber": invoice_number,
    }

    try:
        response = requests.post(
            url,
            json=payload,
            headers=_payment_headers(id_token),
            timeout=30,
        )
    except requests.RequestException as exc:
        logger.exception("bKash create payment request failed: %s", exc)

        raise BkashError(
            "Could not connect to bKash. Please try again shortly."
        ) from exc

    data = _parse_response(response)

    # Token could have expired on bKash even though our local token
    # still appears valid. Retry once with a newly generated token.
    if response.status_code in (401, 403):
        logger.warning(
            "bKash create payment authorization failed; "
            "requesting a new token."
        )

        id_token = _grant_token()

        try:
            response = requests.post(
                url,
                json=payload,
                headers=_payment_headers(id_token),
                timeout=30,
            )
        except requests.RequestException as exc:
            logger.exception(
                "bKash create payment retry failed: %s",
                exc,
            )

            raise BkashError(
                "Could not connect to bKash. Please try again shortly."
            ) from exc

        data = _parse_response(response)

    if response.status_code >= 400:
        logger.error(
            "bKash create payment HTTP %s: %s",
            response.status_code,
            data,
        )

        raise BkashError(
            data.get("errorMessageEn")
            or data.get("message")
            or "Could not start bKash payment."
        )

    # THE FIX: was `if not data.get("paymentId")` -- a single, unconfirmed
    # casing. bKash's public docs and every third-party client use
    # `paymentID` (capital ID). Checking both means a successful Create
    # Payment response is never mistaken for a failure just because we
    # guessed the wrong casing for this account's spec.
    if not _field(data, "paymentID", "paymentId"):
        logger.error(
            "bKash create payment returned unexpected response: %s",
            data,
        )

        raise BkashError(
            data.get("errorMessageEn")
            or data.get("message")
            or "Could not start bKash payment."
        )

    logger.info(
        "bKash payment created successfully. paymentId=%s",
        _field(data, "paymentID", "paymentId"),
    )

    return data


# ---------------------------------------------------------------------------
# Execute Payment
# ---------------------------------------------------------------------------

def execute_payment(payment_id):
    """
    Execute a Tokenized Checkout payment after successful customer callback.

    V2 endpoint:
        POST /tokenized-checkout/payment/execute

    Body:
        {
            "paymentID": "..."   (see casing note at top of file)
        }

    Successful payment should return:
        transactionStatus = "Completed"
    """

    id_token = get_valid_token()

    url = f"{_base_url()}/tokenized-checkout/payment/execute"

    # THE FIX: sending both casings in the request body is harmless (bKash
    # ignores keys it doesn't recognize) and guarantees we hit whichever
    # key their V2 endpoint actually expects, instead of guessing one.
    payload = {
        "paymentID": payment_id,
        "paymentId": payment_id,
    }

    try:
        response = requests.post(
            url,
            json=payload,
            headers=_payment_headers(id_token),
            timeout=30,
        )
    except requests.RequestException as exc:
        logger.exception(
            "bKash execute payment request failed: %s",
            exc,
        )

        raise BkashError(
            "Could not connect to bKash. Please try again shortly."
        ) from exc

    data = _parse_response(response)

    # Retry once if the application token has expired.
    if response.status_code in (401, 403):
        logger.warning(
            "bKash execute payment authorization failed; "
            "requesting a new token."
        )

        id_token = _grant_token()

        try:
            response = requests.post(
                url,
                json=payload,
                headers=_payment_headers(id_token),
                timeout=30,
            )
        except requests.RequestException as exc:
            logger.exception(
                "bKash execute payment retry failed: %s",
                exc,
            )

            raise BkashError(
                "Could not connect to bKash. Please try again shortly."
            ) from exc

        data = _parse_response(response)

    if response.status_code >= 400:
        logger.error(
            "bKash execute payment HTTP %s: %s",
            response.status_code,
            data,
        )

        raise BkashError(
            data.get("errorMessageEn")
            or data.get("message")
            or "Could not complete bKash payment."
        )

    logger.info(
        "bKash payment executed. paymentId=%s status=%s",
        payment_id,
        data.get("transactionStatus"),
    )

    return data


# ---------------------------------------------------------------------------
# Query Payment
# ---------------------------------------------------------------------------

def query_payment(payment_id):
    """
    Query the current status/details of a bKash payment.

    V2 endpoint:
        POST /tokenized-checkout/query/payment

    Body:
        {
            "paymentID": "..."   (see casing note at top of file)
        }
    """

    id_token = get_valid_token()

    url = f"{_base_url()}/tokenized-checkout/query/payment"

    payload = {
        "paymentID": payment_id,
        "paymentId": payment_id,
    }

    try:
        response = requests.post(
            url,
            json=payload,
            headers=_payment_headers(id_token),
            timeout=30,
        )
    except requests.RequestException as exc:
        logger.exception(
            "bKash query payment request failed: %s",
            exc,
        )

        raise BkashError(
            "Could not connect to bKash. Please try again shortly."
        ) from exc

    data = _parse_response(response)

    # Retry once if token authorization failed.
    if response.status_code in (401, 403):
        logger.warning(
            "bKash query payment authorization failed; "
            "requesting a new token."
        )

        id_token = _grant_token()

        try:
            response = requests.post(
                url,
                json=payload,
                headers=_payment_headers(id_token),
                timeout=30,
            )
        except requests.RequestException as exc:
            logger.exception(
                "bKash query payment retry failed: %s",
                exc,
            )

            raise BkashError(
                "Could not connect to bKash. Please try again shortly."
            ) from exc

        data = _parse_response(response)

    if response.status_code >= 400:
        logger.error(
            "bKash query payment HTTP %s: %s",
            response.status_code,
            data,
        )

        raise BkashError(
            data.get("errorMessageEn")
            or data.get("message")
            or "Could not query bKash payment status."
        )

    logger.info(
        "bKash payment queried. paymentId=%s status=%s",
        payment_id,
        data.get("transactionStatus"),
    )

    return data