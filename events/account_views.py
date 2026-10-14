from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from django.views.decorators.csrf import csrf_protect
from django.contrib.auth import get_user_model

from .account_services import (
    approve_account_request,
    record_audit,
    reject_account_request,
    settings_payload,
)
from .models import AccountRequest, AppSettings, UserProfile
from .serializers import AuthUserSerializer

User = get_user_model()


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
    if request.data.get("google_auth_enabled") is True:
        return Response(
            {"detail": "Google sign-in is unavailable until identity verification is configured."},
            status=400,
        )
    fields = (
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
    return Response(
        {"detail": "Google sign-in is unavailable until identity verification is configured."},
        status=501,
    )


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
            row, role=role, department=department, reviewer=request.user
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
    )
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
    profile = user.profile
    if "name" in request.data:
        profile.display_name = str(request.data.get("name") or "").strip() or profile.display_name
    if "email" in request.data:
        user.email = str(request.data.get("email") or "").strip()
        user.save(update_fields=["email"])
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
        },
        actor=request.user.username,
    )
    try:
        from .mongodb import sync_app_data_to_mongodb

        sync_app_data_to_mongodb()
    except Exception:
        pass
    return Response(AuthUserSerializer(user).data)
