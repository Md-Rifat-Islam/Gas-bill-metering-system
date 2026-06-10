from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
import logging

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is not None:
        # Flatten DRF error dicts into a single 'detail' message for the frontend
        errors = response.data
        if isinstance(errors, dict):
            messages = []
            for field, value in errors.items():
                if isinstance(value, list):
                    messages.append(f"{field}: {value[0]}")
                else:
                    messages.append(str(value))
            response.data = {'detail': ' | '.join(messages), 'errors': errors}
        elif isinstance(errors, list):
            response.data = {'detail': errors[0] if errors else 'Error', 'errors': errors}
    else:
        logger.exception("Unhandled exception: %s", exc)
        response = Response(
            {'detail': 'An unexpected error occurred. Please try again.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return response
