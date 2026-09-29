import logging

logger = logging.getLogger(__name__)


def send_sms(mobile: str, message: str) -> bool:
    """
    Send a single SMS through the bdbulksms.com gateway (used e.g. for OTP).
    Returns True only if the provider accepted it. Never raises.

    Bill / reminder / notice SMS do NOT use this — they go through
    apps.messaging (queued, logged, de-duplicated).
    """
    try:
        from apps.messaging.services import SMSClient, normalize_mobile
        number = normalize_mobile(mobile)
        if not number:
            logger.warning("send_sms: invalid mobile %r", mobile)
            return False
        ok, detail, _raw = SMSClient().send(number, message)
        if not ok:
            logger.error("SMS to %s rejected: %s", number, detail)
        return ok
    except Exception as exc:
        logger.error("SMS failed to %s: %s", mobile, exc)
        return False


def format_taka(amount) -> str:
    return f"৳{float(amount):,.2f}"