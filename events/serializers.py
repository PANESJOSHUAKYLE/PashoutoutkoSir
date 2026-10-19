from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import serializers

from .models import Announcement, AppSettings, Event, EventRegistration, UserProfile

User = get_user_model()


class AuthUserSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="username")
    name = serializers.CharField(source="profile.display_name")
    role = serializers.CharField(source="profile.role")
    phone = serializers.CharField(source="profile.phone", allow_blank=True)
    department = serializers.CharField(source="profile.department", allow_blank=True)
    dark_mode = serializers.BooleanField(source="profile.dark_mode")
    signup_method = serializers.CharField(source="profile.signup_method")
    is_archived = serializers.BooleanField(source="profile.is_archived")

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "is_active",
            "name",
            "role",
            "phone",
            "department",
            "dark_mode",
            "signup_method",
            "is_archived",
        )
        read_only_fields = fields


class ProfileUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150)
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(max_length=40, required=False, allow_blank=True)
    dark_mode = serializers.BooleanField(required=False)

    def validate(self, attrs):
        protected = {"role", "username", "id", "department", "card_identifier"}
        supplied = protected.intersection(self.initial_data)
        if supplied:
            raise serializers.ValidationError(
                "Role, ID, department, and card assignments are administrator-managed."
            )
        attrs["name"] = attrs["name"].strip()
        if not attrs["name"]:
            raise serializers.ValidationError({"name": "Name is required."})
        return attrs


class AdminEventPublishSerializer(serializers.ModelSerializer):
    class Meta:
        model = Event
        fields = (
            "name",
            "description",
            "starts_at",
            "ends_at",
            "venue",
            "audience",
            "registration_required",
            "registration_deadline",
            "check_in_opens_at",
            "check_in_closes_at",
            "late_cutoff",
            "attendance_method",
        )

    def validate(self, attrs):
        starts_at = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        ends_at = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        check_in_opens_at = attrs.get(
            "check_in_opens_at", getattr(self.instance, "check_in_opens_at", None)
        )
        check_in_closes_at = attrs.get(
            "check_in_closes_at", getattr(self.instance, "check_in_closes_at", None)
        )
        if starts_at and ends_at and ends_at <= starts_at:
            raise serializers.ValidationError({"ends_at": "Event end must be after its start."})
        if check_in_opens_at and check_in_closes_at and check_in_closes_at <= check_in_opens_at:
            raise serializers.ValidationError(
                {"check_in_closes_at": "Check-in must close after it opens."}
            )
        return attrs


class AnnouncementSerializer(serializers.ModelSerializer):
    event_id = serializers.UUIDField(source="event.id", read_only=True, allow_null=True)
    event_name = serializers.CharField(source="event.name", read_only=True, allow_null=True)
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = ("id", "title", "body", "audience", "event_id", "event_name", "created_at", "is_read")

    def get_is_read(self, announcement):
        user = self.context["request"].user
        return announcement.reads.filter(user=user).exists()


class AdminAnnouncementCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Announcement
        fields = ("title", "body", "audience")

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("A title is required.")
        return value

    def validate_body(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Announcement text is required.")
        return value


class EventContextSerializer(serializers.ModelSerializer):
    name = serializers.CharField(read_only=True)
    start_time = serializers.DateTimeField(source="starts_at", read_only=True)
    end_time = serializers.DateTimeField(source="ends_at", read_only=True)
    organizer_name = serializers.CharField(
        source="organizer.profile.display_name", read_only=True
    )
    status = serializers.SerializerMethodField()
    registration_status = serializers.SerializerMethodField()
    attendance_status = serializers.SerializerMethodField()
    feedback_submitted = serializers.SerializerMethodField()
    certificate_id = serializers.SerializerMethodField()
    can_register = serializers.SerializerMethodField()
    can_check_in = serializers.SerializerMethodField()
    is_organizer = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = (
            "id",
            "name",
            "description",
            "starts_at",
            "ends_at",
            "start_time",
            "end_time",
            "venue",
            "audience",
            "organizer_name",
            "status",
            "registration_required",
            "registration_deadline",
            "registration_status",
            "can_register",
            "attendance_status",
            "can_check_in",
            "feedback_submitted",
            "certificate_id",
            "check_in_opens_at",
            "check_in_closes_at",
            "late_cutoff",
            "attendance_method",
            "is_organizer",
        )

    def get_status(self, event):
        return event.effective_status

    def _registration(self, event):
        return event.registrations.filter(
            attendee=self.context["request"].user,
            status=EventRegistration.Status.REGISTERED,
        ).first()

    def _attendance(self, event):
        return event.attendance.filter(attendee=self.context["request"].user).first()

    def get_registration_status(self, event):
        if self._registration(event):
            return "registered"
        if event.registration_required:
            return "required"
        return "not_required"

    def get_attendance_status(self, event):
        record = self._attendance(event)
        return record.status if record else None

    def get_feedback_submitted(self, event):
        return event.feedback.filter(attendee=self.context["request"].user).exists()

    def get_certificate_id(self, event):
        user = self.context["request"].user
        if user.profile.role != UserProfile.Role.STUDENT:
            return None
        certificate = event.certificates.filter(student=user).first()
        return str(certificate.id) if certificate else None

    def get_can_register(self, event):
        user = self.context["request"].user
        now = timezone.now()
        return bool(
            user.profile.role == UserProfile.Role.STUDENT
            and event.registration_required
            and event.effective_status == "upcoming"
            and (not event.registration_deadline or now <= event.registration_deadline)
            and not self._registration(event)
        )

    def get_can_check_in(self, event):
        user = self.context["request"].user
        app_settings = self.context.get("app_settings")
        if app_settings is None:
            app_settings = AppSettings.load()
            self.context["app_settings"] = app_settings
        method_enabled = {
            Event.AttendanceMethod.QR: app_settings.qr_checkin_enabled,
            Event.AttendanceMethod.BARCODE: app_settings.barcode_checkin_enabled,
            Event.AttendanceMethod.RFID: app_settings.rfid_checkin_enabled,
        }
        registration_ok = (
            not event.registration_required
            or user.profile.role != UserProfile.Role.STUDENT
            or self._registration(event) is not None
        )
        return bool(
            event.allows(user)
            and method_enabled[event.attendance_method]
            and event.is_check_in_open()
            and registration_ok
            and not self._attendance(event)
        )

    def get_is_organizer(self, event):
        return event.is_supervisor(self.context["request"].user)
