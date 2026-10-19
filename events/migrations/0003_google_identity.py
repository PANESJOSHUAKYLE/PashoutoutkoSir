from django.db import migrations, models


def keep_google_sign_in_off(apps, schema_editor):
    apps.get_model("events", "AppSettings").objects.all().update(
        google_auth_enabled=False
    )


class Migration(migrations.Migration):
    dependencies = [("events", "0002_accounts_settings_audit")]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="google_subject",
            field=models.CharField(blank=True, max_length=255, null=True, unique=True),
        ),
        migrations.AlterField(
            model_name="appsettings",
            name="google_auth_enabled",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(keep_google_sign_in_off, migrations.RunPython.noop),
    ]
