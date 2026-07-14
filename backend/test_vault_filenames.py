import main


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
