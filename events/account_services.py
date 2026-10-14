import re

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password, make_password
from django.utils import timezone

from .models import AccountRequest, AppSettings, AuditLog, UserProfile
from .mongodb import append_audit_to_mongodb, sync_app_data_to_mongodb

User = get_user_model()


def record_audit(action, payload=None, actor=""):
    safe = dict(payload or {})
    safe.pop("password", None)
    log = AuditLog.objects.create(action=action, actor_username=actor or "", payload=safe)
    try:
        append_audit_to_mongodb(log)
    except Exception:
        pass


def settings_payload():
    row = AppSettings.load()
    return {
        "google_auth_enabled": False,
        "guest_signup_enabled": row.guest_signup_enabled,
        "email_notifications_enabled": False,
        "qr_checkin_enabled": row.qr_checkin_enabled,
        "barcode_checkin_enabled": row.barcode_checkin_enabled,
        "rfid_checkin_enabled": row.rfid_checkin_enabled,
    }


def next_username(role):
    prefix = "STU" if role == UserProfile.Role.STUDENT else "FAC"
    existing = User.objects.filter(username__istartswith=prefix).values_list(
        "username", flat=True
    )
    numbers = []
    for username in existing:
        suffix = username[len(prefix) :]
        if suffix.isdigit():
            numbers.append(int(suffix))
    return f"{prefix}{max(numbers, default=0) + 1:03d}"


def create_account_request(*, email, full_name, phone, password, method, extra=None):
    settings_row = AppSettings.load()
    email = email.strip().lower()
    full_name = full_name.strip()
    phone = (phone or "").strip()
    if not settings_row.guest_signup_enabled:
        raise ValueError("Guest sign-up is turned off. Contact an administrator.")
    if method == AccountRequest.Method.GOOGLE and not settings_row.google_auth_enabled:
        raise ValueError("Google sign-in is turned off. Use manual sign-up.")
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise ValueError("Enter a valid email address.")
    if len(full_name) < 2:
        raise ValueError("Enter your full name.")
    if User.objects.filter(email__iexact=email).exists():
        raise ValueError("An approved account already uses this email. Log in instead.")
    pending = AccountRequest.objects.filter(
        email__iexact=email, status=AccountRequest.Status.PENDING
    ).first()
    if pending:
        raise ValueError(
            "This email is already waiting for administrator approval."
        )
    if method == AccountRequest.Method.MANUAL:
        if not password or len(password) < 8:
            raise ValueError("Create a password with at least 8 characters.")
        password_hash = make_password(password)
    else:
        password_hash = make_password(password) if password else ""

    payload = {
        "email": email,
        "full_name": full_name,
        "phone": phone,
        "signup_method": method,
        **(extra or {}),
    }
    request_row = AccountRequest.objects.create(
        email=email,
        full_name=full_name,
        phone=phone,
        password_hash=password_hash,
        signup_method=method,
        submitted_payload=payload,
    )
    record_audit("account_request_submitted", payload, actor=email)
    try:
        sync_app_data_to_mongodb()
    except Exception:
        pass
    return request_row


def approve_account_request(request_row, *, role, department, reviewer):
    if request_row.status != AccountRequest.Status.PENDING:
        raise ValueError("This request has already been reviewed.")
    if role not in (UserProfile.Role.STUDENT, UserProfile.Role.FACULTY):
        raise ValueError("Choose Student or Faculty before approving this account.")
    username = next_username(role)
    user = User(username=username, email=request_row.email, is_active=True)
    if request_row.password_hash:
        user.password = request_row.password_hash
    else:
        user.set_unusable_password()
    user.save()
    UserProfile.objects.create(
        user=user,
        role=role,
        display_name=request_row.full_name,
        phone=request_row.phone,
        department=department.strip() or "College of Technologies",
        signup_method=request_row.signup_method,
        card_identifier=None,
    )
    request_row.status = AccountRequest.Status.APPROVED
    request_row.assigned_role = role
    request_row.department = department.strip()
    request_row.created_user = user
    request_row.reviewed_by = reviewer
    request_row.reviewed_at = timezone.now()
    request_row.save()
    record_audit(
        "account_request_approved",
        {
            "email": request_row.email,
            "username": username,
            "role": role,
            "department": department,
        },
        actor=reviewer.username,
    )
    try:
        sync_app_data_to_mongodb()
    except Exception:
        pass
    return user


def reject_account_request(request_row, reviewer):
    if request_row.status != AccountRequest.Status.PENDING:
        raise ValueError("This request has already been reviewed.")
    request_row.status = AccountRequest.Status.REJECTED
    request_row.reviewed_by = reviewer
    request_row.reviewed_at = timezone.now()
    request_row.save(update_fields=["status", "reviewed_by", "reviewed_at"])
    record_audit(
        "account_request_rejected",
        {"email": request_row.email},
        actor=reviewer.username,
    )
    try:
        sync_app_data_to_mongodb()
    except Exception:
        pass


def password_matches_request(request_row, password):
    if not request_row.password_hash:
        return False
    return check_password(password, request_row.password_hash)
