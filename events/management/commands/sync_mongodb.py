from django.core.management.base import BaseCommand, CommandError

from events.mongodb import sync_app_data_to_mongodb


class Command(BaseCommand):
    help = "Copy this app's users, events, and attendance records into MongoDB for Compass."

    def handle(self, *args, **options):
        try:
            counts = sync_app_data_to_mongodb()
        except Exception as exc:
            raise CommandError(f"Could not sync to MongoDB: {exc}") from exc

        self.stdout.write(self.style.SUCCESS("MongoDB database cot_event_attendance is ready."))
        for name, count in counts.items():
            self.stdout.write(f"  {name}: {count} document(s)")
        self.stdout.write("Compass URI: mongodb://127.0.0.1:27017")
        self.stdout.write("Database: cot_event_attendance")
