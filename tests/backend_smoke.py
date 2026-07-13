from pathlib import Path
import os
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
temp_db.close()
os.environ["SQLALCHEMY_DATABASE_URL"] = f"sqlite:///{temp_db.name}"
os.environ["CLEAR_DATA_TOKEN"] = "smoke-test-token"
os.environ["VAULT_DELETE_PHRASE"] = "smoke-delete-phrase"

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

import models
import main
from deps import get_db


engine = create_engine(os.environ["SQLALCHEMY_DATABASE_URL"], connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
models.Base.metadata.create_all(bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


main.app.dependency_overrides[get_db] = override_get_db
client = TestClient(main.app)


def test_items_crud_smoke():
    created = client.post(
        "/items",
        json={
            "type": "note",
            "title": "Smoke note",
            "subtitle": "Note - Test",
            "workspace": "Smoke",
        },
    )
    assert created.status_code == 200
    item_id = created.json()["id"]

    listed = client.get("/items", params={"workspace": "Smoke"})
    assert listed.status_code == 200
    assert any(item["id"] == item_id for item in listed.json())

    patched = client.patch(
        f"/items/{item_id}",
        json={
            "type": "note",
            "title": "Smoke note updated",
            "subtitle": "Note - Test",
            "workspace": "Smoke",
        },
    )
    assert patched.status_code == 200
    assert patched.json()["title"] == "Smoke note updated"

    deleted = client.delete(f"/items/{item_id}")
    assert deleted.status_code == 200


def test_clear_all_requires_token_and_scopes_workspace():
    forbidden = client.delete("/api/items/clear-all", params={"workspace": "Smoke"})
    assert forbidden.status_code == 403

    created = client.post(
        "/items",
        json={
            "type": "note",
            "title": "Clear scoped",
            "subtitle": "Note - Test",
            "workspace": "Smoke",
        },
    )
    assert created.status_code == 200

    cleared = client.delete(
        "/api/items/clear-all",
        params={"workspace": "Smoke"},
        headers={"X-Clear-Data-Token": "smoke-test-token"},
    )
    assert cleared.status_code == 200
    assert cleared.json()["deleted_count"] == 1


def chat(message: str, history: list[dict] | None = None):
    return client.post("/api/chat", json={"message": message, "history": history or []})


def test_assistant_creates_task_note_expense_and_reminder():
    task = chat("create task call HR tomorrow")
    assert task.status_code == 200
    assert "Created task" in task.json()["reply"]

    note = chat("create note Passport renewal: check employee passport list")
    assert note.status_code == 200
    assert "Created note" in note.json()["reply"]

    expense = chat("create expense 42.50 AED lunch")
    assert expense.status_code == 200
    assert "Created expense" in expense.json()["reply"]

    reminder = chat("remind me to renew labour card tomorrow at 09:30")
    assert reminder.status_code == 200
    assert "Created reminder" in reminder.json()["reply"]

    tasks = client.get("/items/type/task", params={"workspace": "Personal"}).json()
    assert any(item["title"] == "call HR" for item in tasks)

    notes = client.get("/items/type/note", params={"workspace": "Personal"}).json()
    assert any(item["title"] == "Passport renewal" and "employee passport" in item["body"] for item in notes)

    expenses = client.get("/items/type/expense", params={"workspace": "Personal"}).json()
    assert any("42.50 AED lunch" == item["title"] for item in expenses)

    reminders = client.get("/items/type/reminder", params={"workspace": "Personal"}).json()
    assert any(item["title"] == "renew labour card" and "09:30" in item["body"] for item in reminders)


def test_assistant_marks_task_done_and_open():
    created = client.post(
        "/items",
        json={
            "type": "task",
            "title": "submit visa renewal",
            "subtitle": "Task • No due date",
            "workspace": "Personal",
            "body": '{"subtasks":[],"priority":"","due":""}',
        },
    )
    assert created.status_code == 200
    task_id = created.json()["id"]

    done = chat("mark submit visa renewal done")
    assert done.status_code == 200
    assert "Marked task done" in done.json()["reply"]
    task = client.get("/items/type/task", params={"workspace": "Personal"}).json()
    task = next(item for item in task if item["id"] == task_id)
    assert '"status": "done"' in task["body"]

    open_again = chat("mark submit visa renewal open")
    assert open_again.status_code == 200
    assert "Marked task open" in open_again.json()["reply"]
    task = client.get("/items/type/task", params={"workspace": "Personal"}).json()
    task = next(item for item in task if item["id"] == task_id)
    assert '"status": "open"' in task["body"]


def test_assistant_generic_email_requires_confirmation(monkeypatch):
    sent = []

    def fake_send(to_email, subject, body):
        sent.append({"to": to_email, "subject": subject, "body": body})
        return True, "sent"

    monkeypatch.setattr(main, "send_generic_email", fake_send, raising=False)

    draft = chat("send email to test@example.com subject Hello body This is a test")
    assert draft.status_code == 200
    assert "Confirm send" in draft.json()["reply"]
    assert sent == []

    confirm = chat(
        "confirm",
        [
            {"role": "user", "content": "send email to test@example.com subject Hello body This is a test"},
            {"role": "assistant", "content": draft.json()["reply"]},
        ],
    )
    assert confirm.status_code == 200
    assert confirm.json()["reply"] == "Sent email to test@example.com."
    assert sent == [{"to": "test@example.com", "subject": "Hello", "body": "This is a test"}]
