import logging
import requests
from django.conf import settings

logger = logging.getLogger(__name__)


def send_sms(mobile: str, message: str) -> bool:
    """
    Send SMS via configured gateway.
    Replace body with your provider's API call.
    """
    api_key = getattr(settings, 'SMS_API_KEY', '')
    if not api_key:
        logger.warning("SMS_API_KEY not set — skipping SMS to %s: %s", mobile, message)
        return False
    try:
        # Example: BulkSMS BD / SSL Wireless / Twilio — swap in your provider
        response = requests.post(
            'https://bulksmsbd.net/api/smsapi',
            data={
                'api_key': api_key,
                'type':    'text',
                'number':  mobile,
                'senderid': getattr(settings, 'SMS_SENDER_ID', 'GasBill'),
                'message': message,
            },
            timeout=10,
        )
        response.raise_for_status()
        logger.info("SMS sent to %s", mobile)
        return True
    except Exception as exc:
        logger.error("SMS failed to %s: %s", mobile, exc)
        return False


def format_taka(amount) -> str:
    return f"৳{float(amount):,.2f}"
