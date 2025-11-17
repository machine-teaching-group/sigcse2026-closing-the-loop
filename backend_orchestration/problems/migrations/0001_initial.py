from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='ProgramExecution',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('student_id', models.CharField(blank=True, db_index=True, max_length=255, null=True)),
                ('problem_id', models.CharField(db_index=True, max_length=255)),
                ('program', models.TextField()),
                ('correctness', models.BooleanField(blank=True, null=True)),
                ('output', models.TextField(blank=True, null=True)),
                ('elapsed_time', models.FloatField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='programexecution',
            index=models.Index(fields=['student_id', 'problem_id'], name='problems_pr_student__idx'),
        ),
    ]
