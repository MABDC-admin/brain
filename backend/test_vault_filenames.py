import main
import zipfile
from io import BytesIO


def test_normalized_vault_display_title_prefixes_owner_and_preserves_extension():
    title = main.normalized_vault_display_title(
        "Passport",
        "original-upload.jpeg",
        "Aimee June Alminza Alolor",
    )

    assert title == "Aimee June Alminza Alolor - Passport.jpeg"


def test_normalized_vault_display_title_does_not_duplicate_owner():
    title = main.normalized_vault_display_title(
        "Aimee June Alminza Alolor Passport.jpeg",
        "passport.jpeg",
        "Aimee June Alminza Alolor",
    )

    assert title == "Aimee June Alminza Alolor Passport.jpeg"


def test_normalized_vault_display_title_removes_unsafe_filename_characters():
    title = main.normalized_vault_display_title(
        "Employment/Contract: Full*Work",
        "contract.pdf",
        "Aimee June Alminza Alolor",
    )

    assert title == "Aimee June Alminza Alolor - Employment Contract Full Work.pdf"


def test_extract_office_text_reads_docx_xml():
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(
            "word/document.xml",
            """
            <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
              <w:body><w:p><w:r><w:t>Aimee employment agreement</w:t></w:r></w:p></w:body>
            </w:document>
            """,
        )

    text = main.extract_office_text(buffer.getvalue(), "agreement.docx")

    assert "Aimee employment agreement" in text
