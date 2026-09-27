from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0035_document_kind_folder'),
    ]

    operations = [
        migrations.AlterField(
            model_name='document',
            name='kind',
            field=models.CharField(choices=[('doc', 'Document'), ('sheet', 'Spreadsheet'), ('slide', 'Slides'), ('folder', 'Folder')], default='doc', max_length=10, verbose_name='kind'),
        ),
    ]
