from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import main
import models


def make_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    models.Base.metadata.create_all(bind=engine)
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)()


def add_vault_doc(
    db,
    title,
    *,
    owner="Dennis Palen Sotto",
    category="Passport",
    expiry_date="2025-06-01",
    workspace="Company",
):
    doc = models.Item(
        type="vault_file",
        title=title,
        subtitle=f"{category} • {owner} • Processed today",
        expiry_date=expiry_date,
        workspace=workspace,
        image_url=f"/static/{title.replace(' ', '_')}",
        body=main.dump_item_body(
            {
                "owner": owner,
                "category": category,
                "expiry_date": expiry_date,
                "summary": f"{category} for {owner}",
                "index_text": f"Owner: {owner}\nCategory: {category}",
            }
        ),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def test_document_is_expired_parses_iso_dates():
    assert main.document_is_expired("2025-06-01")
    assert not main.document_is_expired("2027-06-01")
    assert not main.document_is_expired("None")


def test_find_newer_replacement_document_matches_owner_and_category():
    db = make_session()
    expired = add_vault_doc(db, "Dennis Passport old.pdf", expiry_date="2025-06-01")
    replacement = add_vault_doc(db, "Dennis Passport renewed.pdf", expiry_date="2027-06-01")
    add_vault_doc(db, "Aimee Passport.pdf", owner="Aimee June Alolor", expiry_date="2027-06-01")

    found = main.find_newer_replacement_document(expired, db)

    assert found.id == replacement.id


def test_expired_lifecycle_archives_and_sends_once_when_no_replacement(monkeypatch):
    db = make_session()
    expired = add_vault_doc(db, "Dennis Passport old.pdf", expiry_date="2025-06-01")
    sent = []

    def fake_send(to_email, item, expiry_date, owner, category):
        sent.append((to_email, item.id, expiry_date, owner, category))
        return True, "sent"

    monkeypatch.setattr(main, "send_expired_document_email", fake_send)

    first = main.handle_expired_document_lifecycle(expired, db)
    db.refresh(expired)
    second = main.handle_expired_document_lifecycle(expired, db)

    body = main.parse_item_body(expired)
    assert first["archived"] is True
    assert first["notified"] is True
    assert second["notified"] is False
    assert expired.workspace == "Archive"
    assert body["archived"] is True
    assert body["archive_reason"] == "expired"
    assert body["previous_workspace"] == "Company"
    assert body["expired_notified_at"]
    assert sent == [("sottodennis@gmail.com", expired.id, "2025-06-01", "Dennis Palen Sotto", "Passport")]


def test_expired_lifecycle_archives_without_email_when_replacement_exists(monkeypatch):
    db = make_session()
    expired = add_vault_doc(db, "Dennis Passport old.pdf", expiry_date="2025-06-01")
    replacement = add_vault_doc(db, "Dennis Passport renewed.pdf", expiry_date="2027-06-01")
    sent = []

    monkeypatch.setattr(
        main,
        "send_expired_document_email",
        lambda *args, **kwargs: sent.append(args) or (True, "sent"),
    )

    result = main.handle_expired_document_lifecycle(expired, db)
    db.refresh(expired)
    body = main.parse_item_body(expired)

    assert result["archived"] is True
    assert result["notified"] is False
    assert result["replacement_id"] == replacement.id
    assert expired.workspace == "Archive"
    assert body["replacement_item_id"] == replacement.id
    assert "expired_notified_at" not in body
    assert sent == []


def test_daily_expiration_scan_runs_expired_lifecycle_for_vault_docs(monkeypatch):
    db = make_session()
    expired = add_vault_doc(db, "Dennis Passport old.pdf", expiry_date="2025-06-01")
    called = []

    def fake_lifecycle(item, session):
        called.append((item.id, session is db))
        return {"expired": True, "archived": True, "notified": True, "replacement_id": None}

    monkeypatch.setattr(main, "handle_expired_document_lifecycle", fake_lifecycle)

    main.check_expirations_and_notify(db)

    assert called == [(expired.id, True)]
