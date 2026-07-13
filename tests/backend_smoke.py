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
    token = draft.json()["reply"].split("confirm ", 1)[1].split("`", 1)[0]
    assert sent == []

    wrong_confirm = chat(
        "confirm wrong-token",
        [
            {"role": "user", "content": "send email to test@example.com subject Hello body This is a test"},
            {"role": "assistant", "content": draft.json()["reply"]},
        ],
    )
    assert wrong_confirm.status_code == 200
    assert "could not find a pending email" in wrong_confirm.json()["reply"]
    assert sent == []

    confirm = chat(
        f"confirm {token}",
        [
            {"role": "user", "content": "send email to test@example.com subject Hello body This is a test"},
            {"role": "assistant", "content": draft.json()["reply"]},
        ],
    )
    assert confirm.status_code == 200
    assert confirm.json()["reply"] == "Sent email to test@example.com."
    assert sent == [{"to": "test@example.com", "subject": "Hello", "body": "This is a test"}]

    audit_rows = client.get("/api/assistant/audit").json()
    assert any(row["action"] == "send_email" and row["status"] == "completed" for row in audit_rows)


def test_assistant_audits_actions_and_stops_ambiguous_task_updates():
    created = chat("create task audit payroll")
    assert created.status_code == 200

    audit_rows = client.get("/api/assistant/audit").json()
    assert any(row["action"] == "create_task" and row["status"] == "completed" for row in audit_rows)

    first = client.post(
        "/items",
        json={"type": "task", "title": "audit duplicate", "subtitle": "Task • No due date", "workspace": "Personal"},
    )
    second = client.post(
        "/items",
        json={"type": "task", "title": "audit duplicate again", "subtitle": "Task • No due date", "workspace": "Personal"},
    )
    assert first.status_code == 200
    assert second.status_code == 200

    ambiguous = chat("mark audit duplicate done")
    assert ambiguous.status_code == 200
    assert "multiple matching tasks" in ambiguous.json()["reply"]

    tasks = client.get("/items/type/task", params={"workspace": "Personal"}).json()
    duplicate_tasks = [item for item in tasks if item["title"].startswith("audit duplicate")]
    assert all('"status": "done"' not in (item.get("body") or "") for item in duplicate_tasks)


def test_assistant_exposes_approved_tool_registry_and_quick_task():
    tools = client.get("/api/assistant/tools")
    assert tools.status_code == 200
    tool_names = {tool["name"] for tool in tools.json()}
    assert {"create_task", "create_reminder", "send_email", "rename_vault_document"}.issubset(tool_names)
    send_email = next(tool for tool in tools.json() if tool["name"] == "send_email")
    assert send_email["risk_level"] == 3
    assert send_email["requires_confirmation"] is True

    created = chat("task: review phase three tools")
    assert created.status_code == 200
    assert "Created task" in created.json()["reply"]

    tasks = client.get("/items/type/task", params={"workspace": "Personal"}).json()
    assert any(item["title"] == "review phase three tools" for item in tasks)


def test_assistant_llm_planner_can_create_task(monkeypatch):
    async def fake_plan(message, history):
        return {
            "tool": "create_task",
            "arguments": {"title": "review natural language planner", "due": "", "priority": "high"},
            "confidence": 0.92,
        }

    monkeypatch.setattr(main, "plan_assistant_tool_with_llm", fake_plan, raising=False)

    created = chat("please remember that the natural language planner needs review")
    assert created.status_code == 200
    assert "Created task" in created.json()["reply"]

    tasks = client.get("/items/type/task", params={"workspace": "Personal"}).json()
    assert any(item["title"] == "review natural language planner" for item in tasks)

    audit_rows = client.get("/api/assistant/audit").json()
    assert any(row["action"] == "create_task" and row["status"] == "completed" for row in audit_rows)


def test_assistant_llm_planner_keeps_email_behind_confirmation(monkeypatch):
    sent = []

    async def fake_plan(message, history):
        return {
            "tool": "send_email",
            "arguments": {"to": "planner@example.com", "subject": "Planner", "body": "Planner body"},
            "confidence": 0.93,
        }

    def fake_send(to_email, subject, body):
        sent.append({"to": to_email, "subject": subject, "body": body})
        return True, "sent"

    monkeypatch.setattr(main, "plan_assistant_tool_with_llm", fake_plan, raising=False)
    monkeypatch.setattr(main, "send_generic_email", fake_send, raising=False)

    draft = chat("tell the planner contact about the update")
    assert draft.status_code == 200
    assert "Confirm send email to planner@example.com" in draft.json()["reply"]
    assert sent == []

    token = draft.json()["reply"].split("confirm ", 1)[1].split("`", 1)[0]
    confirm = chat(f"confirm {token}")
    assert confirm.status_code == 200
    assert confirm.json()["reply"] == "Sent email to planner@example.com."
    assert sent == [{"to": "planner@example.com", "subject": "Planner", "body": "Planner body"}]


def test_assistant_llm_planner_rejects_unapproved_tool(monkeypatch):
    async def fake_plan(message, history):
        return {"tool": "run_shell", "arguments": {"command": "rm -rf /"}, "confidence": 0.99}

    monkeypatch.setattr(main, "plan_assistant_tool_with_llm", fake_plan, raising=False)

    response = chat("please do something unsafe")
    assert response.status_code == 200
    assert "No API key" in response.json()["reply"]

    audit_rows = client.get("/api/assistant/audit").json()
    assert not any(row["action"] == "run_shell" for row in audit_rows)


def test_assistant_multi_step_plan_runs_safe_steps_in_order(monkeypatch):
    async def fake_plan(message, history):
        return {
            "steps": [
                {"tool": "create_task", "arguments": {"title": "collect emirates id", "due": "", "priority": ""}},
                {"tool": "create_reminder", "arguments": {"title": "follow up emirates id", "date": "2026-08-01", "time": "09:00"}},
            ],
            "confidence": 0.91,
        }

    monkeypatch.setattr(main, "plan_assistant_tool_with_llm", fake_plan, raising=False)

    response = chat("create a task to collect emirates id and remind me on 2026-08-01 at 09:00")
    assert response.status_code == 200
    reply = response.json()["reply"]
    assert "Created task: collect emirates id." in reply
    assert "Created reminder: follow up emirates id." in reply

    tasks = client.get("/items/type/task", params={"workspace": "Personal"}).json()
    reminders = client.get("/items/type/reminder", params={"workspace": "Personal"}).json()
    assert any(item["title"] == "collect emirates id" for item in tasks)
    assert any(item["title"] == "follow up emirates id" for item in reminders)


def test_assistant_multi_step_plan_pauses_at_confirmation(monkeypatch):
    sent = []

    async def fake_plan(message, history):
        return {
            "steps": [
                {"tool": "create_task", "arguments": {"title": "prepare payroll note", "due": "", "priority": ""}},
                {"tool": "send_email", "arguments": {"to": "manager@example.com", "subject": "Payroll", "body": "Payroll note is ready."}},
                {"tool": "create_note", "arguments": {"title": "after email", "body": "should not run until confirmation phase exists"}},
            ],
            "confidence": 0.94,
        }

    def fake_send(to_email, subject, body):
        sent.append({"to": to_email, "subject": subject, "body": body})
        return True, "sent"

    monkeypatch.setattr(main, "plan_assistant_tool_with_llm", fake_plan, raising=False)
    monkeypatch.setattr(main, "send_generic_email", fake_send, raising=False)

    response = chat("prepare payroll note then email the manager")
    assert response.status_code == 200
    reply = response.json()["reply"]
    assert "Created task: prepare payroll note." in reply
    assert "Confirm send email to manager@example.com" in reply
    assert "after email" not in reply
    assert sent == []

    tasks = client.get("/items/type/task", params={"workspace": "Personal"}).json()
    notes = client.get("/items/type/note", params={"workspace": "Personal"}).json()
    assert any(item["title"] == "prepare payroll note" for item in tasks)
    assert not any(item["title"] == "after email" for item in notes)
