from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import main
import models


def make_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    models.Base.metadata.create_all(bind=engine)
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)()


def add_vault_doc(db, title, owner="Aimee June Alolor"):
    doc = models.Item(
        type="vault_file",
        title=title,
        subtitle=f"ID • {owner} • Processed today",
        body=main.dump_item_body({"owner": owner, "index_text": f"Owner: {owner}"}),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def latest_pending_token(db):
    row = (
        db.query(models.AssistantAudit)
        .filter(models.AssistantAudit.status == "pending")
        .order_by(models.AssistantAudit.id.desc())
        .first()
    )
    assert row is not None
    return row.confirmation_token


def test_bulk_vault_email_chain_uses_document_ids_for_duplicate_titles(monkeypatch):
    db = make_session()
    first = add_vault_doc(db, "United Arab Emirates Resident Identity Card.pdf")
    second = add_vault_doc(db, "United Arab Emirates Resident Identity Card.pdf")

    sent_titles = []

    def fake_send_document_email(to_email, item):
        sent_titles.append(item.title)
        return True, "sent"

    monkeypatch.setattr(main, "send_document_email", fake_send_document_email)

    plan = {
        "steps": [
            {
                "tool": "send_vault_document_email",
                "arguments": {"to": "sottodennis@gmail.com", "query": first.title, "document_id": first.id},
            },
            {
                "tool": "send_vault_document_email",
                "arguments": {"to": "sottodennis@gmail.com", "query": second.title, "document_id": second.id},
            },
        ]
    }

    first_approval = main.execute_assistant_plan(plan, "send all to sottodennis@gmail.com", db)
    assert "Please use a more specific document name" not in first_approval["reply"]

    first_token = latest_pending_token(db)
    second_approval = main.handle_generic_email_request(f"confirm {first_token}", [], db)

    assert sent_titles == [first.title]
    assert "Please use a more specific document name" not in second_approval["reply"]
    assert "Confirm send vault document" in second_approval["reply"]


def test_send_all_filters_duplicate_titles_by_recent_owner_context():
    db = make_session()
    add_vault_doc(db, "United Arab Emirates Resident Identity Card.pdf", "Dennis Palen Sotto")
    aimee_id = add_vault_doc(db, "United Arab Emirates Resident Identity Card.pdf", "Aimee June Alminza Alolor")
    aimee_passport = add_vault_doc(db, "Passport.jpeg", "Aimee June Alminza Alolor")

    history = [
        {"role": "user", "content": "aimee docs"},
        {
            "role": "assistant",
            "content": (
                "Aimee June Alminza Alolor has several documents processed today, including "
                "United Arab Emirates Resident Identity Card.pdf and Passport.jpeg."
            ),
        },
    ]

    response = main.handle_document_email_request("send all to sottodennis@gmail.com", history, db)

    assert response is not None
    assert "Please use a more specific document name" not in response["reply"]
    pending = db.query(models.AssistantAudit).filter(models.AssistantAudit.status == "pending").first()
    assert pending is not None
    assert pending.target_id in {aimee_id.id, aimee_passport.id}
