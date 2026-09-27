from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0036_document_kind_slide'),
    ]

    operations = [
        migrations.AlterField(
            model_name='document',
            name='kind',
            field=models.CharField(choices=[('doc', 'Document'), ('sheet', 'Spreadsheet'), ('slide', 'Slides'), ('note', 'Note'), ('folder', 'Folder')], default='doc', max_length=10, verbose_name='kind'),
        ),
    ]
