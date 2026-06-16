from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed
from .models import CustomerUser


class CustomerJWTAuthentication(JWTAuthentication):
    """
    JWT authentication for the Customer Portal.

    Tokens issued to customers carry custom claims:
      - user_type   = 'customer'
      - customer_id = CustomerUser.id
      - mobile      = CustomerUser.mobile

    This class loads a CustomerUser instead of StaffUser, and rejects
    staff-issued tokens (which lack the 'user_type' claim).
    """

    def get_user(self, validated_token):
        if validated_token.get('user_type') != 'customer':
            raise AuthenticationFailed('This token is not valid for the customer portal.', code='wrong_user_type')

        customer_id = validated_token.get('customer_id')
        if customer_id is None:
            raise AuthenticationFailed('Token missing customer_id claim.', code='no_customer_id')

        try:
            customer = CustomerUser.objects.get(id=customer_id)
        except CustomerUser.DoesNotExist:
            raise AuthenticationFailed('Customer account not found.', code='customer_not_found')

        if not customer.is_active:
            raise AuthenticationFailed('This account has been deactivated.', code='customer_inactive')

        return customer