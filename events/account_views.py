import logging
import secrets

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from django.views.decorators.csrf import csrf_protect
from django.conf import settings
from django.contrib.auth import get_user_model, login as auth_login

from .account_services import (
    approve_account_request,
    create_account_request,
    record_audit,
    reject_account_request,
    settings_payload,
)
from .models import AccountRequest, AppSettings, UserProfile
from .serializers import AuthUserSerializer

User = get_user_model()
logger = logging.getLogger(__name__)


def _admin(request):
    return (
        request.user.is_authenticated
        and hasattr(request.user, "profile")
        and request.user.profile.role == UserProfile.Role.ADMIN
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def public_settings(request):
    return Response(settings_payload())


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
@csrf_protect
def app_settings(request):
    if request.method == "GET":
        return Response(settings_payload())
    if not _admin(request):
        return Response({"detail": "Only administrators can change integrations."}, status=403)
    row = AppSettings.load()
    if request.data.get("google_auth_enabled") is True and not settings.GOOGLE_CLIENT_ID:
        return Response(
            {"detail": "Set GOOGLE_CLIENT_ID on the server before enabling Google sign-in."},
            status=400,
        )
    fields = (
        "google_auth_enabled",
        "guest_signup_enabled",
        "qr_checkin_enabled",
        "barcode_checkin_enabled",
        "rfid_checkin_enabled",
    )
    payload = {}
    for field in fields:
        if field in request.data:
            value = request.data[field]
            if not isinstance(value, bool):
                return Response({field: "Expected a boolean value."}, status=400)
            setattr(row, field, value)
            payload[field] = value
    row.save()
    record_audit("app_settings_updated", payload, actor=request.user.username)
    try:
        from .mongodb import sync_app_data_to_mongodb

        sync_app_data_to_mongodb()
    except Exception:
        pass
    return Response(settings_payload())


@api_view(["POST"])
@permission_classes([AllowAny])
@csrf_protect
def signup_view(request):
    try:
        create_account_request(
            email=str(request.data.get("email", "")),
            full_name=str(request.data.get("name", "")),
            phone=str(request.data.get("phone", "")),
            password=str(request.data.get("password", "")),
            method=AccountRequest.Method.MANUAL,
        )
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)
    return Response(
        {
            "status": "pending",
            "message": "Your account was recorded and is waiting for administrator approval. You cannot log in until a role is assigned.",
        },
        status=201,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
@csrf_protect
def google_auth_view(request):
    settings_row = AppSettings.load()
    if not settings_row.google_auth_enabled or not settings.GOOGLE_CLIENT_ID:
        return Response({"detail": "Google sign-in is not enabled by the administrator."}, status=403)
    credential = str(request.data.get("credential", ""))
    intent = str(request.data.get("intent", "login")).strip().lower()
    if not credential or intent not in ("login", "signup"):
        return Response({"detail": "A Google credential and valid sign-in action are required."}, status=400)
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token

        identity = id_token.verify_oauth2_token(
            credential, google_requests.Request(), settings.GOOGLE_CLIENT_ID
        )
    except ImportError:
        logger.exception("Google authentication dependency is not installed.")
        return Response({"detail": "Google sign-in is not installed on the server."}, status=503)
    except ValueError:
        return Response({"detail": "Google could not verify this sign-in. Please try again."}, status=400)

    subject = str(identity.get("sub", ""))
    email = str(identity.get("email", "")).strip().lower()
    if not subject or not email or identity.get("email_verified") is not True:
        return Response({"detail": "Use a Google account with a verified email address."}, status=400)

    if intent == "signup":
        try:
            create_account_request(
                email=email,
                full_name=str(identity.get("name") or email.split("@", 1)[0]),
                phone="",
                password="",
                method=AccountRequest.Method.GOOGLE,
                google_subject=subject,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response({
            "status": "pending",
            "message": "Your Google account request was submitted and is waiting for administrator approval.",
        }, status=201)

    user = User.objects.select_related("profile").filter(profile__google_subject=subject).first()
    if not user:
        user = User.objects.select_related("profile").filter(email__iexact=email).first()
    if not user or not hasattr(user, "profile"):
        pending = AccountRequest.objects.filter(email__iexact=email, status=AccountRequest.Status.PENDING).exists()
        message = "Your account is waiting for administrator approval." if pending else "No approved account uses this Google email. Sign up first or contact an administrator."
        return Response({"detail": message}, status=403)
    if not user.is_active:
        return Response({"detail": "This account is inactive. Contact an administrator."}, status=403)
    if user.profile.role == UserProfile.Role.ADMIN:
        return Response({"detail": "Administrators must use the administrator login."}, status=403)
    if user.profile.google_subject and user.profile.google_subject != subject:
        return Response({"detail": "This account is linked to a different Google account."}, status=403)
    if not user.profile.google_subject:
        user.profile.google_subject = subject
        user.profile.save(update_fields=["google_subject"])
    request.session.cycle_key()
    auth_login(request, user)
    record_audit("google_login_success", {"email": email, "role": user.profile.role}, actor=user.username)
    return Response(AuthUserSerializer(user).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def account_request_list(request):
    if not _admin(request):
        return Response({"detail": "Administrator access required."}, status=403)
    rows = AccountRequest.objects.all()[:200]
    return Response(
        [
            {
                "id": row.id,
                "email": row.email,
                "name": row.full_name,
                "phone": row.phone,
                "signup_method": row.signup_method,
                "status": row.status,
                "assigned_role": row.assigned_role,
                "department": row.department,
                "submitted_payload": row.submitted_payload,
                "created_at": row.created_at,
            }
            for row in rows
        ]
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@csrf_protect
def account_request_approve(request, request_id):
    if not _admin(request):
        return Response({"detail": "Administrator access required."}, status=403)
    row = AccountRequest.objects.filter(pk=request_id).first()
    if not row:
        return Response({"detail": "Account request not found."}, status=404)
    role = str(request.data.get("role", "")).strip().lower()
    department = str(request.data.get("department", "")).strip()
    try:
        user = approve_account_request(
            row,
            role=role,
            department=department,
            reviewer=request.user,
            full_name=request.data.get("name") if "name" in request.data else None,
            email=request.data.get("email") if "email" in request.data else None,
            phone=request.data.get("phone") if "phone" in request.data else None,
        )
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)
    return Response(
        {
            "status": "approved",
            "username": user.username,
            "role": user.profile.role,
            "email": user.email,
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@csrf_protect
def account_request_reject(request, request_id):
    if not _admin(request):
        return Response({"detail": "Administrator access required."}, status=403)
    row = AccountRequest.objects.filter(pk=request_id).first()
    if not row:
        return Response({"detail": "Account request not found."}, status=404)
    try:
        reject_account_request(row, request.user)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)
    return Response({"status": "rejected"})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def guest_user_list(request):
    if not _admin(request):
        return Response({"detail": "Administrator access required."}, status=403)
    users = User.objects.select_related("profile").exclude(
        profile__role=UserProfile.Role.ADMIN
    ).filter(profile__is_archived=False)
    return Response([AuthUserSerializer(user).data for user in users])


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def archived_guest_user_list(request):
    if not _admin(request):
        return Response({"detail": "Administrator access required."}, status=403)
    users = User.objects.select_related("profile").exclude(
        profile__role=UserProfile.Role.ADMIN
    ).filter(profile__is_archived=True)
    return Response([AuthUserSerializer(user).data for user in users])


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
@csrf_protect
def guest_user_update(request, username):
    if not _admin(request):
        return Response({"detail": "Administrator access required."}, status=403)
    user = User.objects.filter(username__iexact=username).select_related("profile").first()
    if not user or user.profile.role == UserProfile.Role.ADMIN:
        return Response({"detail": "Guest account not found."}, status=404)
    if "is_active" in request.data and not isinstance(request.data["is_active"], bool):
        return Response({"is_active": "Expected a boolean value."}, status=400)
    profile = user.profile
    if "name" in request.data:
        profile.display_name = str(request.data.get("name") or "").strip() or profile.display_name
    if "email" in request.data:
        user.email = str(request.data.get("email") or "").strip()
    if "is_active" in request.data:
        user.is_active = request.data["is_active"]
    user_fields = [field for field in ("email", "is_active") if field in request.data]
    if user_fields:
        user.save(update_fields=user_fields)
    if "phone" in request.data:
        profile.phone = str(request.data.get("phone") or "").strip()
    if "department" in request.data:
        profile.department = str(request.data.get("department") or "").strip()
    if "role" in request.data:
        role = str(request.data.get("role") or "").strip().lower()
        if role not in (UserProfile.Role.STUDENT, UserProfile.Role.FACULTY):
            return Response({"detail": "Guest accounts can only be Student or Faculty."}, status=400)
        profile.role = role
    profile.save()
    record_audit(
        "guest_account_edited",
        {
            "username": user.username,
            "name": profile.display_name,
            "email": user.email,
            "phone": profile.phone,
            "department": profile.department,
            "role": profile.role,
            "is_active": user.is_active,
        },
        actor=request.user.username,
    )
    try:
        from .mongodb import sync_app_data_to_mongodb

        sync_app_data_to_mongodb()
    except Exception:
        logger.exception("Failed to sync an updated guest account to MongoDB.")
    return Response(AuthUserSerializer(user).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@csrf_protect
def guest_user_archive(request, username, action):
    if not _admin(request):
        return Response({"detail": "Administrator access required."}, status=403)
    user = User.objects.select_related("profile").filter(username__iexact=username).first()
    if not user or user.profile.role == UserProfile.Role.ADMIN:
        return Response({"detail": "Guest account not found."}, status=404)
    profile = user.profile
    if action == "archive":
        if not profile.is_archived:
            profile.archived_was_active = user.is_active
            profile.is_archived = True
            profile.save(update_fields=["is_archived", "archived_was_active"])
            user.is_active = False
            user.save(update_fields=["is_active"])
            record_audit("guest_account_archived", {"username": user.username, "email": user.email}, actor=request.user.username)
    elif action == "restore":
        if profile.is_archived:
            profile.is_archived = False
            was_active = profile.archived_was_active
            profile.save(update_fields=["is_archived"])
            user.is_active = was_active
            user.save(update_fields=["is_active"])
            record_audit("guest_account_restored", {"username": user.username, "email": user.email}, actor=request.user.username)
    else:
        return Response({"detail": "Unknown archive action."}, status=400)
    try:
        from .mongodb import sync_app_data_to_mongodb

        sync_app_data_to_mongodb()
    except Exception:
        logger.exception("Failed to sync account archive state to MongoDB.")
    return Response(AuthUserSerializer(user).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@csrf_protect
def guest_user_password_reset(request, username):
    if not _admin(request):
        return Response({"detail": "Administrator access required."}, status=403)
    user = User.objects.filter(username__iexact=username).select_related("profile").first()
    if not user or user.profile.role == UserProfile.Role.ADMIN:
        return Response({"detail": "Guest account not found."}, status=404)

    temporary_password = secrets.token_urlsafe(18)
    user.set_password(temporary_password)
    user.save(update_fields=["password"])
    record_audit(
        "guest_account_password_reset",
        {"username": user.username},
        actor=request.user.username,
    )
    return Response({"temporary_password": temporary_password})
