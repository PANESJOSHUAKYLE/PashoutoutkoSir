from django.contrib.auth import authenticate, get_user_model, login, logout
from django.core.cache import cache
from django.db.models import Q
from django.middleware.csrf import get_token
from django.views.decorators.csrf import csrf_protect
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .account_services import password_matches_request, record_audit
from .models import AccountRequest, UserProfile
from .serializers import AuthUserSerializer, ProfileUpdateSerializer

User = get_user_model()


@api_view(["GET"])
@permission_classes([AllowAny])
def csrf(request):
    return Response({"csrfToken": get_token(request)})


@api_view(["POST"])
@permission_classes([AllowAny])
@csrf_protect
def login_view(request):
    identifier = str(request.data.get("identifier", "")).strip()
    password = str(request.data.get("password", ""))
    portal = str(request.data.get("portal", "guest")).strip().lower()
    if portal not in ("guest", "admin"):
        portal = "guest"
    if not 3 <= len(identifier) <= 150:
        return Response({"detail": "Enter a valid ID, username, or email."}, status=400)
    cache_key = f"event-login:{request.META.get('REMOTE_ADDR', '')}:{identifier.casefold()}"
    if cache.get(f"{cache_key}:locked"):
        return Response(
            {"detail": "Too many failed attempts. Try again in 30 seconds."},
            status=429,
        )

    pending = AccountRequest.objects.filter(
        Q(email__iexact=identifier), status=AccountRequest.Status.PENDING
    ).first()
    if pending and password_matches_request(pending, password):
        record_audit(
            "login_blocked_pending",
            {"identifier": identifier, "portal": portal},
            actor=identifier,
        )
        return Response(
            {
                "detail": "Your account was submitted and is waiting for administrator approval. You cannot sign in yet."
            },
            status=403,
        )

    user = (
        User.objects.filter(Q(username__iexact=identifier) | Q(email__iexact=identifier))
        .order_by("id")
        .first()
    )
    authenticated = authenticate(
        request, username=user.username if user else identifier, password=password
    )
    if not authenticated or not hasattr(authenticated, "profile"):
        failures = cache.get(cache_key, 0) + 1
        cache.set(cache_key, failures, 60)
        if failures >= 5:
            cache.set(f"{cache_key}:locked", True, 30)
        record_audit(
            "login_failed",
            {"identifier": identifier, "portal": portal},
            actor=identifier,
        )
        return Response(
            {"detail": "The ID/username or password is incorrect."}, status=400
        )

    role = authenticated.profile.role
    if portal == "admin" and role != UserProfile.Role.ADMIN:
        return Response(
            {"detail": "This is the administrator portal. Guests should use Log in as Guest."},
            status=403,
        )
    if portal == "guest" and role == UserProfile.Role.ADMIN:
        return Response(
            {"detail": "Administrators must use Admin Log in."},
            status=403,
        )

    cache.delete(cache_key)
    cache.delete(f"{cache_key}:locked")
    request.session.cycle_key()
    login(request, authenticated)
    record_audit(
        "login_success",
        {"identifier": identifier, "portal": portal, "role": role},
        actor=authenticated.username,
    )
    return Response(AuthUserSerializer(authenticated).data)


@api_view(["POST"])
@permission_classes([AllowAny])
@csrf_protect
def logout_view(request):
    logout(request)
    return Response(status=204)


@api_view(["GET"])
def me(request):
    return Response(AuthUserSerializer(request.user).data)


@api_view(["GET", "PATCH"])
def profile(request):
    if request.method == "GET":
        return Response(AuthUserSerializer(request.user).data)
    serializer = ProfileUpdateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    values = serializer.validated_data
    request.user.email = values.get("email", request.user.email).strip()
    request.user.save(update_fields=["email"])
    user_profile = request.user.profile
    user_profile.display_name = values["name"]
    user_profile.phone = values.get("phone", user_profile.phone).strip()
    update_fields = ["display_name", "phone"]
    if "dark_mode" in values:
        user_profile.dark_mode = values["dark_mode"]
        update_fields.append("dark_mode")
    user_profile.save(update_fields=update_fields)
    record_audit(
        "profile_updated",
        {
            "name": user_profile.display_name,
            "email": request.user.email,
            "phone": user_profile.phone,
            "dark_mode": user_profile.dark_mode,
        },
        actor=request.user.username,
    )
    return Response(AuthUserSerializer(request.user).data)
