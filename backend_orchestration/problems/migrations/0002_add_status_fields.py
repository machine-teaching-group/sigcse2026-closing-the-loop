from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('problems', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='programexecution',
            name='is_success',
            field=models.BooleanField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='programexecution',
            name='error_message',
            field=models.TextField(blank=True, null=True),
        ),
    ]
