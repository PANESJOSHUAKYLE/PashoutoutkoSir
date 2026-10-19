from datetime import datetime, timezone

from django.conf import settings
from django.contrib.auth import get_user_model
from pymongo import ASCENDING, MongoClient

from events.models import (
    AccountRequest,
    AppSettings,
    AttendanceCode,
    AuditLog,
    Event,
    EventAttendance,
    EventCertificate,
    EventFeedback,
    EventRegistration,
)

User = get_user_model()


def _iso(value):
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def get_database(timeout_ms=5000):
    client = MongoClient(settings.MONGODB_URI, serverSelectionTimeoutMS=timeout_ms)
    client.admin.command("ping")
    return client, client[settings.MONGODB_DB]


def append_audit_to_mongodb(log):
    client, db = get_database(timeout_ms=400)
    try:
        db["audit_logs"].insert_one(
            {
                "action": log.action,
                "actor_username": log.actor_username,
                "payload": log.payload,
                "created_at": _iso(log.created_at),
            }
        )
    finally:
        client.close()


def sync_app_data_to_mongodb():
    client, db = get_database()
    try:
        users = []
        for user in User.objects.select_related("profile").order_by("username"):
            profile = getattr(user, "profile", None)
            users.append(
                {
                    "_id": user.username,
                    "username": user.username,
                    "email": user.email,
                    "is_active": user.is_active,
                    "is_staff": user.is_staff,
                    "is_superuser": user.is_superuser,
                    "date_joined": _iso(user.date_joined),
                    "role": profile.role if profile else None,
                    "display_name": profile.display_name if profile else user.get_username(),
                    "phone": profile.phone if profile else "",
                    "department": profile.department if profile else "",
                    # A sparse unique index permits many documents without this
                    # field, but treats repeated explicit nulls as duplicates.
                    **(
                        {"card_identifier": profile.card_identifier}
                        if profile and profile.card_identifier
                        else {}
                    ),
                    "dark_mode": profile.dark_mode if profile else True,
                    "signup_method": profile.signup_method if profile else "admin",
                    "is_archived": profile.is_archived if profile else False,
                }
            )

        events = []
        for event in Event.objects.prefetch_related("supervisors").select_related(
            "organizer"
        ):
            events.append(
                {
                    "_id": str(event.id),
                    "name": event.name,
                    "description": event.description,
                    "starts_at": _iso(event.starts_at),
                    "ends_at": _iso(event.ends_at),
                    "venue": event.venue,
                    "audience": event.audience,
                    "organizer_username": event.organizer.username,
                    "supervisor_usernames": list(
                        event.supervisors.values_list("username", flat=True)
                    ),
                    "status": event.status,
                    "effective_status": event.effective_status,
                    "registration_required": event.registration_required,
                    "registration_deadline": _iso(event.registration_deadline),
                    "check_in_opens_at": _iso(event.check_in_opens_at),
                    "check_in_closes_at": _iso(event.check_in_closes_at),
                    "late_cutoff": _iso(event.late_cutoff),
                    "attendance_method": event.attendance_method,
                    "created_at": _iso(event.created_at),
                }
            )

        registrations = [
            {
                "_id": f"{row.event_id}:{row.attendee.username}",
                "event_id": str(row.event_id),
                "event_name": row.event.name,
                "attendee_username": row.attendee.username,
                "status": row.status,
                "registered_at": _iso(row.registered_at),
            }
            for row in EventRegistration.objects.select_related("event", "attendee")
        ]

        attendance = [
            {
                "_id": f"{row.event_id}:{row.attendee.username}",
                "event_id": str(row.event_id),
                "event_name": row.event.name,
                "attendee_username": row.attendee.username,
                "status": row.status,
                "method": row.method,
                "recorded_at": _iso(row.recorded_at),
            }
            for row in EventAttendance.objects.select_related("event", "attendee")
        ]

        feedback = [
            {
                "_id": f"{row.event_id}:{row.attendee.username}",
                "event_id": str(row.event_id),
                "event_name": row.event.name,
                "attendee_username": row.attendee.username,
                "rating": row.rating,
                "comments": row.comments,
                "submitted_at": _iso(row.submitted_at),
            }
            for row in EventFeedback.objects.select_related("event", "attendee")
        ]

        certificates = [
            {
                "_id": row.reference,
                "event_id": str(row.event_id),
                "event_name": row.event.name,
                "student_username": row.student.username,
                "issued_by_username": row.issued_by.username,
                "reference": row.reference,
                "message": row.message,
                "issued_at": _iso(row.issued_at),
            }
            for row in EventCertificate.objects.select_related(
                "event", "student", "issued_by"
            )
        ]

        codes = [
            {
                "_id": row.token_hash,
                "event_id": str(row.event_id),
                "event_name": row.event.name,
                "created_by_username": row.created_by.username,
                "expires_at": _iso(row.expires_at),
                "active": row.active,
                "created_at": _iso(row.created_at),
            }
            for row in AttendanceCode.objects.select_related("event", "created_by")
        ]

        settings_row = AppSettings.load()
        app_settings = [
            {
                "_id": "app",
                "google_auth_enabled": settings_row.google_auth_enabled,
                "guest_signup_enabled": settings_row.guest_signup_enabled,
                "email_notifications_enabled": settings_row.email_notifications_enabled,
                "qr_checkin_enabled": settings_row.qr_checkin_enabled,
                "barcode_checkin_enabled": settings_row.barcode_checkin_enabled,
                "rfid_checkin_enabled": settings_row.rfid_checkin_enabled,
                "updated_at": _iso(settings_row.updated_at),
            }
        ]
        account_requests = [
            {
                "_id": row.id,
                "email": row.email,
                "full_name": row.full_name,
                "phone": row.phone,
                "signup_method": row.signup_method,
                "status": row.status,
                "assigned_role": row.assigned_role,
                "department": row.department,
                "submitted_payload": row.submitted_payload,
                "created_at": _iso(row.created_at),
                "reviewed_at": _iso(row.reviewed_at),
            }
            # Pending requests stay in Django's private approval queue. Only
            # approved requests are mirrored; rejected or pending applicants
            # never appear as MongoDB account documents.
            for row in AccountRequest.objects.filter(
                status=AccountRequest.Status.APPROVED
            )
        ]
        audit_logs = [
            {
                "_id": row.id,
                "action": row.action,
                "actor_username": row.actor_username,
                "payload": row.payload,
                "created_at": _iso(row.created_at),
            }
            for row in AuditLog.objects.all()[:500]
        ]

        collections = {
            "users": users,
            "events": events,
            "event_registrations": registrations,
            "event_attendance": attendance,
            "event_feedback": feedback,
            "event_certificates": certificates,
            "attendance_codes": codes,
            "app_settings": app_settings,
            "account_requests": account_requests,
            "audit_logs": audit_logs,
        }

        for name, documents in collections.items():
            collection = db[name]
            collection.delete_many({})
            if documents:
                collection.insert_many(documents)

        db["users"].create_index([("username", ASCENDING)], unique=True)
        db["users"].create_index(
            [("card_identifier", ASCENDING)], unique=True, sparse=True
        )
        db["events"].create_index([("starts_at", ASCENDING), ("name", ASCENDING)])
        db["event_registrations"].create_index(
            [("event_id", ASCENDING), ("attendee_username", ASCENDING)], unique=True
        )
        db["event_attendance"].create_index(
            [("event_id", ASCENDING), ("attendee_username", ASCENDING)], unique=True
        )
        db["event_feedback"].create_index(
            [("event_id", ASCENDING), ("attendee_username", ASCENDING)], unique=True
        )
        db["event_certificates"].create_index(
            [("event_id", ASCENDING), ("student_username", ASCENDING)], unique=True
        )

        return {name: len(docs) for name, docs in collections.items()}
    finally:
        client.close()
