import uuid

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import F, Q
from django.utils import timezone


class UserProfile(models.Model):
    class Role(models.TextChoices):
        STUDENT = "student", "Student"
        FACULTY = "faculty", "Faculty"
        ADMIN = "admin", "Administrator"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile"
    )
    role = models.CharField(max_length=16, choices=Role.choices)
    display_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=40, blank=True)
    department = models.CharField(max_length=150, blank=True)
    card_identifier = models.CharField(
        max_length=120, unique=True, null=True, blank=True
    )
    dark_mode = models.BooleanField(default=True)
    signup_method = models.CharField(max_length=16, default="admin")
    google_subject = models.CharField(max_length=255, blank=True, null=True, unique=True)
    is_archived = models.BooleanField(default=False)
    archived_was_active = models.BooleanField(default=True)

    def __str__(self) -> str:
        return f"{self.display_name} ({self.user.username})"


class Event(models.Model):
    class Audience(models.TextChoices):
        ALL = "all", "Students and faculty"
        STUDENT = "student", "Students"
        FACULTY = "faculty", "Faculty"

    class Status(models.TextChoices):
        PUBLISHED = "published", "Published"
        CANCELLED = "cancelled", "Cancelled"

    class AttendanceMethod(models.TextChoices):
        QR = "qr", "QR code"
        BARCODE = "barcode", "Barcode"
        RFID = "rfid", "RFID or ID card"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    venue = models.CharField(max_length=180)
    audience = models.CharField(
        max_length=16, choices=Audience.choices, default=Audience.ALL
    )
    organizer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="organized_events",
    )
    supervisors = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name="supervised_events"
    )
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.PUBLISHED
    )
    registration_required = models.BooleanField(default=False)
    registration_deadline = models.DateTimeField(null=True, blank=True)
    check_in_opens_at = models.DateTimeField()
    check_in_closes_at = models.DateTimeField()
    late_cutoff = models.DateTimeField()
    attendance_method = models.CharField(
        max_length=16, choices=AttendanceMethod.choices
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("starts_at", "name")
        constraints = [
            models.CheckConstraint(
                condition=Q(ends_at__gt=F("starts_at")),
                name="event_ends_after_start",
            ),
            models.CheckConstraint(
                condition=Q(check_in_closes_at__gt=F("check_in_opens_at")),
                name="event_check_in_window_valid",
            ),
        ]

    @property
    def effective_status(self) -> str:
        if self.status == self.Status.CANCELLED:
            return "cancelled"
        now = timezone.now()
        if now < self.starts_at:
            return "upcoming"
        if now <= self.ends_at:
            return "ongoing"
        return "completed"

    def is_check_in_open(self, at=None) -> bool:
        current = at or timezone.now()
        return (
            self.status == self.Status.PUBLISHED
            and self.check_in_opens_at <= current <= self.check_in_closes_at
        )

    def is_supervisor(self, user) -> bool:
        return bool(
            user
            and user.is_authenticated
            and user.profile.role == UserProfile.Role.FACULTY
            and (
                self.organizer_id == user.id
                or self.supervisors.filter(id=user.id).exists()
            )
        )

    def allows(self, user) -> bool:
        if not user.is_authenticated:
            return False
        role = user.profile.role
        return role in (UserProfile.Role.STUDENT, UserProfile.Role.FACULTY) and (
            self.audience == self.Audience.ALL or self.audience == role
        )

    def __str__(self) -> str:
        return self.name


class EventRegistration(models.Model):
    class Status(models.TextChoices):
        REGISTERED = "registered", "Registered"
        CANCELLED = "cancelled", "Cancelled"

    event = models.ForeignKey(
        Event, on_delete=models.CASCADE, related_name="registrations"
    )
    attendee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="event_registrations",
    )
    status = models.CharField(max_length=16, choices=Status.choices)
    registered_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("event", "attendee"), name="unique_event_registration"
            )
        ]


class EventAttendance(models.Model):
    class Status(models.TextChoices):
        PRESENT = "present", "Present"
        LATE = "late", "Late"
        ABSENT = "absent", "Absent"

    event = models.ForeignKey(
        Event, on_delete=models.CASCADE, related_name="attendance"
    )
    attendee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="event_attendance",
    )
    status = models.CharField(max_length=12, choices=Status.choices)
    method = models.CharField(max_length=16, choices=Event.AttendanceMethod.choices)
    recorded_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ("-recorded_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("event", "attendee"), name="unique_event_attendance"
            )
        ]


class EventFeedback(models.Model):
    event = models.ForeignKey(
        Event, on_delete=models.CASCADE, related_name="feedback"
    )
    attendee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="event_feedback",
    )
    rating = models.PositiveSmallIntegerField(
        validators=(MinValueValidator(1), MaxValueValidator(5))
    )
    comments = models.TextField(max_length=2000, blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("event", "attendee"), name="unique_event_feedback"
            )
        ]


class EventCertificate(models.Model):
    event = models.ForeignKey(
        Event, on_delete=models.CASCADE, related_name="certificates"
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="event_certificates",
    )
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="issued_event_certificates",
    )
    reference = models.CharField(max_length=80, unique=True)
    message = models.CharField(max_length=240, blank=True)
    issued_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("event", "student"), name="unique_event_certificate"
            )
        ]


class AttendanceCode(models.Model):
    event = models.ForeignKey(
        Event, on_delete=models.CASCADE, related_name="attendance_codes"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_attendance_codes",
    )
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)


class AppSettings(models.Model):
    google_auth_enabled = models.BooleanField(default=False)
    guest_signup_enabled = models.BooleanField(default=True)
    email_notifications_enabled = models.BooleanField(default=True)
    qr_checkin_enabled = models.BooleanField(default=True)
    barcode_checkin_enabled = models.BooleanField(default=True)
    rfid_checkin_enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "app settings"

    @classmethod
    def load(cls):
        settings_row, _ = cls.objects.get_or_create(pk=1)
        return settings_row


class AccountRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    class Method(models.TextChoices):
        MANUAL = "manual", "Manual"
        GOOGLE = "google", "Google"

    email = models.EmailField()
    full_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=40, blank=True)
    password_hash = models.CharField(max_length=128, blank=True)
    signup_method = models.CharField(max_length=16, choices=Method.choices)
    google_subject = models.CharField(max_length=255, blank=True)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.PENDING
    )
    assigned_role = models.CharField(
        max_length=16, choices=UserProfile.Role.choices, blank=True
    )
    department = models.CharField(max_length=150, blank=True)
    submitted_payload = models.JSONField(default=dict, blank=True)
    created_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="account_requests",
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reviewed_account_requests",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("email",),
                condition=models.Q(status="pending"),
                name="unique_pending_account_email",
            )
        ]


class AuditLog(models.Model):
    action = models.CharField(max_length=80)
    actor_username = models.CharField(max_length=150, blank=True)
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)


class Announcement(models.Model):
    class Audience(models.TextChoices):
        ALL = "all", "Students and faculty"
        STUDENT = "student", "Students"
        FACULTY = "faculty", "Faculty"

    title = models.CharField(max_length=180)
    body = models.TextField()
    audience = models.CharField(
        max_length=16, choices=Audience.choices, default=Audience.ALL
    )
    event = models.ForeignKey(
        Event, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="announcements",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="posted_announcements",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)


class AnnouncementRead(models.Model):
    announcement = models.ForeignKey(
        Announcement, on_delete=models.CASCADE, related_name="reads"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name="announcement_reads",
    )
    read_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("announcement", "user"), name="unique_announcement_read"
            )
        ]


