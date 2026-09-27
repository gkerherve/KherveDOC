from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0037_document_kind_note'),
    ]

    operations = [
        migrations.AlterField(
            model_name='document',
            name='kind',
            field=models.CharField(choices=[('doc', 'Document'), ('sheet', 'Spreadsheet'), ('slide', 'Slides'), ('note', 'Note'), ('chat', 'Chat'), ('meet', 'Meeting'), ('folder', 'Folder')], default='doc', max_length=10, verbose_name='kind'),
        ),
    ]
