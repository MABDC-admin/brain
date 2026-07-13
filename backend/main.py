from contextlib import asynccontextmanager
from datetime import datetime, timedelta
import html
import json
import logging
import os
import re
import secrets
import uuid

from fastapi import FastAPI, Depends, UploadFile, File, HTTPException, Request, Form, Query
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from typing import List, Optional
import httpx
import base64
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

import fitz
from dotenv import load_dotenv

load_dotenv()
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "https://brain.mabdc.com").rstrip("/")
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "https://brain.mabdc.com,http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

logger = logging.getLogger("commandbrain")

import models, schemas
from database import SessionLocal, engine
from deps import get_db
from routers.items import router as items_router

models.Base.metadata.create_all(bind=engine)

scheduler = BackgroundScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not scheduler.running:
        scheduler.start()
    try:
        yield
    finally:
        if scheduler.running:
            scheduler.shutdown()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("uploads", exist_ok=True)
app.mount("/static", StaticFiles(directory="uploads"), name="static")
app.include_router(items_router)


def model_data(model: BaseModel, *, exclude_unset: bool = False) -> dict:
    if hasattr(model, "model_dump"):
        return model.model_dump(exclude_unset=exclude_unset)
    return model.dict(exclude_unset=exclude_unset)


def uploaded_file_url(filename: str) -> str:
    return f"{PUBLIC_BASE_URL}/static/{filename}"


EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
SEND_WORD_RE = re.compile(r"\b(send|email|mail|forward)\b", re.IGNORECASE)
DELETE_WORD_RE = re.compile(r"\b(delete|remove|trash)\b", re.IGNORECASE)
DOCUMENT_WORD_RE = re.compile(r"\b(vault|document|doc|file|pdf|contract|scan)\b", re.IGNORECASE)
RENAME_RE = re.compile(r"\brename\b.*?\bto\s+(.+)$", re.IGNORECASE)
CREATE_TASK_RE = re.compile(r"\b(?:create|add|new)\s+task\s+(.+)$", re.IGNORECASE)
QUICK_TASK_RE = re.compile(r"^\s*(?:task|todo):\s*(.+)$", re.IGNORECASE)
CREATE_NOTE_RE = re.compile(r"\b(?:create|add|new)\s+note\s+(.+)$", re.IGNORECASE)
CREATE_EXPENSE_RE = re.compile(r"\b(?:create|add|new)\s+expense\s+(.+)$", re.IGNORECASE)
REMINDER_RE = re.compile(r"\b(?:remind me to|create reminder to|add reminder to|schedule)\s+(.+)$", re.IGNORECASE)
MARK_DONE_RE = re.compile(r"\b(?:mark|set|complete)\s+(.+?)\s+(?:as\s+)?(?:done|complete|completed)$", re.IGNORECASE)
MARK_OPEN_RE = re.compile(r"\b(?:mark|set|unmark|reopen)\s+(.+?)\s+(?:as\s+)?(?:open|undone|not done|pending)$", re.IGNORECASE)
GENERIC_EMAIL_RE = re.compile(
    r"\b(?:send|email|mail)\s+(?:email\s+)?(?:to\s+)?(?P<email>[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\s+subject\s+(?P<subject>.+?)\s+body\s+(?P<body>.+)$",
    re.IGNORECASE,
)
VAULT_DELETE_PHRASE = os.getenv("VAULT_DELETE_PHRASE")

ASSISTANT_TOOLS = [
    {
        "name": "create_task",
        "description": "Create a task in the current personal workspace.",
        "risk_level": 1,
        "requires_confirmation": False,
        "parameters": {"title": "string", "due": "YYYY-MM-DD optional", "priority": "string optional"},
    },
    {
        "name": "mark_task_done",
        "description": "Mark one unambiguous task as done.",
        "risk_level": 2,
        "requires_confirmation": False,
        "parameters": {"query": "string"},
    },
    {
        "name": "mark_task_open",
        "description": "Mark one unambiguous task as open.",
        "risk_level": 2,
        "requires_confirmation": False,
        "parameters": {"query": "string"},
    },
    {
        "name": "create_reminder",
        "description": "Create a dated or timed reminder.",
        "risk_level": 1,
        "requires_confirmation": False,
        "parameters": {"title": "string", "date": "YYYY-MM-DD optional", "time": "HH:MM optional"},
    },
    {
        "name": "create_note",
        "description": "Create a note with title and body.",
        "risk_level": 1,
        "requires_confirmation": False,
        "parameters": {"title": "string", "body": "string"},
    },
    {
        "name": "create_expense",
        "description": "Create an expense record.",
        "risk_level": 1,
        "requires_confirmation": False,
        "parameters": {"amount": "number", "currency": "string", "item": "string"},
    },
    {
        "name": "rename_vault_document",
        "description": "Rename a vault document while preserving file extension.",
        "risk_level": 2,
        "requires_confirmation": False,
        "parameters": {"query": "string", "new_title": "string"},
    },
    {
        "name": "delete_vault_document",
        "description": "Delete a vault document after the security phrase is provided.",
        "risk_level": 3,
        "requires_confirmation": True,
        "parameters": {"query": "string", "security_phrase": "string"},
    },
    {
        "name": "send_email",
        "description": "Send a generic email after token confirmation.",
        "risk_level": 3,
        "requires_confirmation": True,
        "parameters": {"to": "email", "subject": "string", "body": "string"},
    },
    {
        "name": "send_vault_document_email",
        "description": "Send a vault document link by email.",
        "risk_level": 3,
        "requires_confirmation": False,
        "parameters": {"query": "string", "to": "email"},
    },
]
ASSISTANT_TOOL_NAMES = {tool["name"] for tool in ASSISTANT_TOOLS}
ASSISTANT_TOOL_RISK = {tool["name"]: tool["risk_level"] for tool in ASSISTANT_TOOLS}


def normalize_search_text(value: str) -> str:
    normalized = (value or "").lower().replace("labuor", "labour")
    return re.sub(r"[^a-z0-9]+", " ", normalized).strip()


def find_best_vault_document(query: str, db: Session) -> Optional[models.Item]:
    query_tokens = set(normalize_search_text(query).split())
    docs = db.query(models.Item).filter(models.Item.type == "vault_file", models.Item.image_url.is_not(None)).all()
    best_doc = None
    best_score = 0
    for doc in docs:
        haystack = normalize_search_text(" ".join([doc.title or "", doc.subtitle or "", doc.body or "", doc.workspace or ""]))
        score = sum(1 for token in query_tokens if len(token) > 2 and token in haystack)
        if score > best_score:
            best_doc = doc
            best_score = score
    return best_doc if best_score > 0 else None


def find_vault_document_by_title(title: str, db: Session) -> Optional[models.Item]:
    return (
        db.query(models.Item)
        .filter(models.Item.type == "vault_file", models.Item.title == title)
        .first()
    )


def preserve_file_extension(old_title: str, new_title: str) -> str:
    old_ext = os.path.splitext(old_title or "")[1]
    if old_ext and not os.path.splitext(new_title)[1]:
        return f"{new_title.strip()}{old_ext}"
    return new_title.strip()


def parse_item_body(item: models.Item) -> dict:
    try:
        parsed = json.loads(item.body or "{}")
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def dump_item_body(body: dict) -> str:
    return json.dumps(body, ensure_ascii=False)


def parse_due_date(text: str) -> str:
    value = normalize_search_text(text)
    today = datetime.now().date()
    if "tomorrow" in value:
        return (today + timedelta(days=1)).isoformat()
    if "today" in value:
        return today.isoformat()
    match = re.search(r"\b(20\d{2}-\d{2}-\d{2})\b", text or "")
    return match.group(1) if match else ""


def parse_time(text: str) -> str:
    match = re.search(r"\b([01]?\d|2[0-3]):([0-5]\d)\b", text or "")
    if match:
        return f"{int(match.group(1)):02d}:{match.group(2)}"
    am_pm = re.search(r"\b(1[0-2]|0?[1-9])\s*(am|pm)\b", text or "", re.IGNORECASE)
    if not am_pm:
        return ""
    hour = int(am_pm.group(1))
    if am_pm.group(2).lower() == "pm" and hour != 12:
        hour += 12
    if am_pm.group(2).lower() == "am" and hour == 12:
        hour = 0
    return f"{hour:02d}:00"


def clean_action_title(text: str) -> str:
    cleaned = re.sub(r"\b(today|tomorrow)\b", "", text or "", flags=re.IGNORECASE)
    cleaned = re.sub(r"\b(?:at|on)\s+(20\d{2}-\d{2}-\d{2}|[01]?\d|2[0-3]):?[0-5]?\d?\s*(?:am|pm)?\b", "", cleaned, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", cleaned).strip(" .")


def find_best_item(item_type: str, query: str, db: Session) -> Optional[models.Item]:
    query_tokens = {token for token in normalize_search_text(query).split() if len(token) > 1}
    if not query_tokens:
        return None
    items = db.query(models.Item).filter(models.Item.type == item_type).all()
    best_item = None
    best_score = 0
    for item in items:
        haystack = normalize_search_text(" ".join([item.title or "", item.subtitle or "", item.body or "", item.workspace or ""]))
        score = sum(1 for token in query_tokens if token in haystack)
        if score > best_score:
            best_item = item
            best_score = score
    return best_item if best_score > 0 else None


def find_ranked_items(item_type: str, query: str, db: Session) -> list[tuple[models.Item, int]]:
    query_tokens = {token for token in normalize_search_text(query).split() if len(token) > 1}
    if not query_tokens:
        return []
    ranked = []
    for item in db.query(models.Item).filter(models.Item.type == item_type).all():
        haystack = normalize_search_text(" ".join([item.title or "", item.subtitle or "", item.body or "", item.workspace or ""]))
        score = sum(1 for token in query_tokens if token in haystack)
        if score > 0:
            ranked.append((item, score))
    return sorted(ranked, key=lambda pair: pair[1], reverse=True)


def find_unique_best_item(item_type: str, query: str, db: Session) -> tuple[Optional[models.Item], list[models.Item]]:
    ranked = find_ranked_items(item_type, query, db)
    if not ranked:
        return None, []
    best_score = ranked[0][1]
    best = [item for item, score in ranked if score == best_score]
    if len(best) > 1:
        return None, best
    return best[0], []


def create_action_item(db: Session, *, item_type: str, title: str, subtitle: str, body: str = "", workspace: str = "Personal") -> models.Item:
    item = models.Item(type=item_type, title=title, subtitle=subtitle, body=body, workspace=workspace)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def audit_action(
    db: Session,
    *,
    action: str,
    risk_level: int,
    status: str,
    summary: str,
    request_text: str = "",
    target_type: str | None = None,
    target_id: int | None = None,
    payload: dict | None = None,
    confirmation_token: str | None = None,
) -> models.AssistantAudit:
    row = models.AssistantAudit(
        action=action,
        risk_level=risk_level,
        status=status,
        target_type=target_type,
        target_id=target_id,
        summary=summary,
        request_text=request_text,
        payload=json.dumps(payload or {}, ensure_ascii=False),
        confirmation_token=confirmation_token,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def audit_to_dict(row: models.AssistantAudit) -> dict:
    return {
        "id": row.id,
        "action": row.action,
        "risk_level": row.risk_level,
        "status": row.status,
        "target_type": row.target_type,
        "target_id": row.target_id,
        "summary": row.summary,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def parse_json_object(text: str) -> Optional[dict]:
    clean = (text or "").strip()
    if clean.startswith("```"):
        clean = "\n".join(line for line in clean.splitlines() if not line.strip().startswith("```")).strip()
    try:
        parsed = json.loads(clean)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        start = clean.find("{")
        end = clean.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None
        try:
            parsed = json.loads(clean[start : end + 1])
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            return None


async def plan_assistant_tool_with_llm(message: str, history: list) -> Optional[dict]:
    if not OPENROUTER_API_KEY:
        return None

    tool_prompt = json.dumps(ASSISTANT_TOOLS, ensure_ascii=False)
    recent_history = []
    for entry in history[-6:]:
        if isinstance(entry, dict) and entry.get("role") in {"user", "assistant"}:
            recent_history.append({"role": entry["role"], "content": str(entry.get("content", ""))[:1000]})

    messages_payload = [
        {
            "role": "system",
            "content": (
                "You classify Command Brain user requests into exactly one approved tool. "
                "Return only JSON with keys: tool, arguments, steps, confidence. "
                "Use tool='none' when the request is not a direct app action. "
                "For one action, use tool and arguments. For multiple actions, use steps as an ordered list of "
                '{"tool":"approved_tool_name","arguments":{...}} objects. '
                "When the user uses 'and', 'then', commas, or asks for two outcomes such as create plus remind, "
                "return steps and include every requested outcome in order. Do not collapse a compound request into one tool. "
                "If the user asks to remember, track, add, create, schedule, mark, rename, delete, or email something, "
                "choose the closest approved tool instead of saying you cannot do it. "
                "Examples: 'remember I need to review payroll tomorrow' -> create_task; "
                "'create task review payroll and remind me tomorrow' -> steps with create_task then create_reminder; "
                "'create a task to review agent chain and remind me to follow up tomorrow at 09:00' -> steps with create_task then create_reminder; "
                "'make a note that passport is renewed' -> create_note; "
                "'mark visa renewal done' -> mark_task_done; "
                "'rename labour contract to Dennis Labour contract' -> rename_vault_document; "
                "'send hello to dennis@example.com' -> send_email. "
                "Never invent tools or parameters. Approved tools: "
                f"{tool_prompt}"
            ),
        },
        *recent_history,
        {"role": "user", "content": message},
    ]
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"},
                json={"model": "openai/gpt-4o-mini", "messages": messages_payload, "temperature": 0},
                timeout=20.0,
            )
    except Exception as exc:
        logger.warning("Assistant tool planner failed: %s", exc)
        return None
    if resp.status_code != 200:
        logger.warning("Assistant tool planner API failed: %s %s", resp.status_code, resp.text)
        return None

    planned = parse_json_object(resp.json().get("choices", [{}])[0].get("message", {}).get("content", ""))
    if not planned:
        return None
    tool_name = str(planned.get("tool") or "none").strip()
    confidence = planned.get("confidence", 0)
    try:
        confidence = float(confidence)
    except (TypeError, ValueError):
        confidence = 0
    steps = planned.get("steps") if isinstance(planned.get("steps"), list) else []
    valid_steps = []
    for step in steps[:5]:
        if not isinstance(step, dict):
            continue
        step_tool = str(step.get("tool") or "").strip()
        if step_tool not in ASSISTANT_TOOL_NAMES:
            logger.warning("Rejected unapproved assistant plan step: %s", step_tool)
            continue
        step_arguments = step.get("arguments") if isinstance(step.get("arguments"), dict) else {}
        valid_steps.append({"tool": step_tool, "arguments": step_arguments})
    if valid_steps and confidence >= 0.65:
        return {"steps": valid_steps, "confidence": confidence}

    if tool_name == "none" or tool_name not in ASSISTANT_TOOL_NAMES or confidence < 0.65:
        return None
    arguments = planned.get("arguments") if isinstance(planned.get("arguments"), dict) else {}
    return {"tool": tool_name, "arguments": arguments, "confidence": confidence}


def execute_assistant_tool(tool_name: str, arguments: dict, request_text: str, db: Session, *, source: str = "llm") -> Optional[dict]:
    if tool_name not in ASSISTANT_TOOL_NAMES:
        logger.warning("Rejected unapproved assistant tool: %s", tool_name)
        return None

    arguments = arguments if isinstance(arguments, dict) else {}
    payload = {"source": source, "arguments": arguments}
    risk_level = ASSISTANT_TOOL_RISK.get(tool_name, 0)

    if tool_name == "create_task":
        raw_title = str(arguments.get("title") or "").strip()
        if not raw_title:
            return {"reply": "Tell me the task title."}
        due = str(arguments.get("due") or parse_due_date(raw_title) or "").strip()
        priority = str(arguments.get("priority") or "").strip()
        title = clean_action_title(raw_title)
        subtitle = f"Task • Due {due}" if due else "Task • No due date"
        body = dump_item_body({"subtasks": [], "priority": priority, "due": due, "status": "open"})
        item = create_action_item(db, item_type="task", title=title, subtitle=subtitle, body=body)
        audit_action(db, action=tool_name, risk_level=risk_level, status="completed", target_type="task", target_id=item.id, summary=f"Created task {item.title}", request_text=request_text, payload=payload)
        return {"reply": f"Created task: {item.title}."}

    if tool_name == "create_note":
        title = str(arguments.get("title") or "").strip()
        body = str(arguments.get("body") or title).strip()
        if not title:
            return {"reply": "Tell me the note title."}
        item = create_action_item(db, item_type="note", title=title, subtitle="Note • Today", body=body)
        audit_action(db, action=tool_name, risk_level=risk_level, status="completed", target_type="note", target_id=item.id, summary=f"Created note {item.title}", request_text=request_text, payload=payload)
        return {"reply": f"Created note: {item.title}."}

    if tool_name == "create_expense":
        amount = arguments.get("amount")
        try:
            amount_text = f"{float(amount):.2f}"
        except (TypeError, ValueError):
            return {"reply": "Tell me the expense amount."}
        currency = str(arguments.get("currency") or "AED").upper().strip()
        item_name = str(arguments.get("item") or "Expense").strip()
        title = f"{amount_text} {currency} {item_name}"
        body = dump_item_body({"amount": amount_text, "currency": currency, "item": item_name, "date": str(arguments.get("date") or "")})
        item = create_action_item(db, item_type="expense", title=title, subtitle="Other • Today", body=body)
        audit_action(db, action=tool_name, risk_level=risk_level, status="completed", target_type="expense", target_id=item.id, summary=f"Created expense {item.title}", request_text=request_text, payload=payload)
        return {"reply": f"Created expense: {item.title}."}

    if tool_name == "create_reminder":
        raw_title = str(arguments.get("title") or "").strip()
        if not raw_title:
            return {"reply": "Tell me what to remind you about."}
        date = str(arguments.get("date") or parse_due_date(raw_title) or "").strip()
        time_value = str(arguments.get("time") or parse_time(raw_title) or "").strip()
        title = clean_action_title(raw_title)
        subtitle = f"Reminder • Once{f' at {time_value}' if time_value else ''}"
        body = dump_item_body({"date": date, "time": time_value, "repeat": "Once", "status": "open"})
        item = create_action_item(db, item_type="reminder", title=title, subtitle=subtitle, body=body)
        audit_action(db, action=tool_name, risk_level=risk_level, status="completed", target_type="reminder", target_id=item.id, summary=f"Created reminder {item.title}", request_text=request_text, payload=payload)
        return {"reply": f"Created reminder: {item.title}."}

    if tool_name in {"mark_task_done", "mark_task_open"}:
        target_query = str(arguments.get("query") or "").strip()
        if not target_query:
            return {"reply": "Tell me which task to update."}
        task, ambiguous = find_unique_best_item("task", target_query, db)
        if ambiguous:
            names = ", ".join(item.title for item in ambiguous[:5])
            audit_action(db, action=tool_name, risk_level=risk_level, status="blocked", target_type="task", summary=f"Ambiguous task match: {names}", request_text=request_text, payload=payload)
            return {"reply": f"I found multiple matching tasks: {names}. Please use a more specific title."}
        if not task:
            return {"reply": f"I could not find a task matching `{target_query}`."}
        status = "done" if tool_name == "mark_task_done" else "open"
        body = parse_item_body(task)
        body["status"] = status
        task.body = dump_item_body(body)
        task.subtitle = re.sub(r"\s•\s(?:Done|Open)$", "", task.subtitle or "")
        task.subtitle = f"{task.subtitle or 'Task'} • {'Done' if status == 'done' else 'Open'}"
        db.commit()
        audit_action(db, action=tool_name, risk_level=risk_level, status="completed", target_type="task", target_id=task.id, summary=f"Marked task {status}: {task.title}", request_text=request_text, payload=payload)
        return {"reply": f"Marked task {status}: {task.title}."}

    if tool_name == "rename_vault_document":
        query = str(arguments.get("query") or "").strip()
        new_title = str(arguments.get("new_title") or "").strip()
        if not query or not new_title:
            return {"reply": "Tell me which document to rename and the new name."}
        doc = find_best_vault_document(query, db)
        if not doc:
            return {"reply": "I could not find which vault document to rename."}
        old_title = doc.title
        doc.title = preserve_file_extension(old_title, new_title)
        db.commit()
        audit_action(db, action=tool_name, risk_level=risk_level, status="completed", target_type="vault_file", target_id=doc.id, summary=f"Renamed {old_title} to {doc.title}", request_text=request_text, payload=payload)
        return {"reply": f"Renamed {old_title} to {doc.title}."}

    if tool_name == "delete_vault_document":
        query = str(arguments.get("query") or "").strip()
        phrase = str(arguments.get("security_phrase") or "").strip()
        if not query:
            return {"reply": "Tell me the exact vault document to delete."}
        doc = find_best_vault_document(query, db)
        if not doc:
            return {"reply": "I could not find the vault document to delete."}
        if not VAULT_DELETE_PHRASE or not secrets.compare_digest(phrase, VAULT_DELETE_PHRASE):
            return ask_for_vault_delete_phrase(doc)
        doc_title = doc.title
        doc_id = doc.id
        delete_vault_document(doc, db)
        audit_action(db, action=tool_name, risk_level=risk_level, status="completed", target_type="vault_file", target_id=doc_id, summary=f"Deleted {doc_title}", request_text=request_text, payload=payload)
        return {"reply": f"Deleted {doc_title} from the vault."}

    if tool_name == "send_email":
        to_email = str(arguments.get("to") or "").strip()
        subject = str(arguments.get("subject") or "").strip()
        body = str(arguments.get("body") or "").strip()
        if not EMAIL_RE.fullmatch(to_email) or not subject or not body:
            return {"reply": "Tell me the email address, subject, and body before I prepare the email."}
        token = secrets.token_urlsafe(6)
        audit_action(
            db,
            action=tool_name,
            risk_level=risk_level,
            status="pending",
            target_type="email",
            summary=f"Pending email to {to_email}",
            request_text=request_text,
            payload={"to": to_email, "subject": subject, "body": body, "source": source},
            confirmation_token=token,
        )
        return {"reply": f"Confirm send email to {to_email} with subject \"{subject}\"? Reply `confirm {token}` to send."}

    if tool_name == "send_vault_document_email":
        to_email = str(arguments.get("to") or "").strip()
        query = str(arguments.get("query") or "").strip()
        if not EMAIL_RE.fullmatch(to_email) or not query:
            return {"reply": "Tell me which vault document to send and the recipient email."}
        doc = find_best_vault_document(query, db)
        if not doc:
            return {"reply": f"I could not find the vault document to send to {to_email}."}
        ok, detail = send_document_email(to_email, doc)
        status = "completed" if ok else "failed"
        summary = f"Sent {doc.title} to {to_email}" if ok else f"Could not send {doc.title} to {to_email}: {detail}"
        audit_action(db, action=tool_name, risk_level=risk_level, status=status, target_type="vault_file", target_id=doc.id, summary=summary, request_text=request_text, payload=payload)
        return {"reply": f"Sent {doc.title} to {to_email}." if ok else f"I found {doc.title}, but could not send it: {detail}"}

    return None


def assistant_reply_requires_confirmation(reply: str) -> bool:
    return bool(re.search(r"\bReply `confirm [A-Za-z0-9_-]{6,}` to send\.", reply or ""))


def execute_assistant_plan(planned_tool: dict, request_text: str, db: Session) -> Optional[dict]:
    steps = planned_tool.get("steps")
    if not isinstance(steps, list):
        tool_name = planned_tool.get("tool")
        if not tool_name:
            return None
        return execute_assistant_tool(tool_name, planned_tool.get("arguments", {}), request_text, db, source="llm")

    replies = []
    for step in steps[:5]:
        if not isinstance(step, dict):
            continue
        tool_name = step.get("tool")
        result = execute_assistant_tool(tool_name, step.get("arguments", {}), request_text, db, source="llm_plan")
        if not result:
            continue
        reply = result.get("reply", "")
        if reply:
            replies.append(reply)
        if assistant_reply_requires_confirmation(reply):
            break
    if not replies:
        return None
    return {"reply": "\n".join(replies)}


@app.get("/api/assistant/tools")
def read_assistant_tools():
    return ASSISTANT_TOOLS


@app.get("/api/assistant/audit")
def read_assistant_audit(limit: int = 50, db: Session = Depends(get_db)):
    rows = (
        db.query(models.AssistantAudit)
        .order_by(models.AssistantAudit.created_at.desc())
        .limit(min(max(limit, 1), 200))
        .all()
    )
    return [audit_to_dict(row) for row in rows]


def has_security_phrase(message: str) -> bool:
    if not VAULT_DELETE_PHRASE:
        return False
    tokens = normalize_search_text(message).split()
    return any(secrets.compare_digest(token, VAULT_DELETE_PHRASE.lower()) for token in tokens)


def is_exact_security_phrase(message: str) -> bool:
    if not VAULT_DELETE_PHRASE:
        return False
    return secrets.compare_digest(normalize_search_text(message), VAULT_DELETE_PHRASE.lower())


def local_upload_path(image_url: str | None) -> Optional[str]:
    if not image_url or "/static/" not in image_url:
        return None
    filename = image_url.rsplit("/static/", 1)[-1].split("?", 1)[0].split("#", 1)[0]
    filename = os.path.basename(filename)
    if not filename:
        return None
    return os.path.join("uploads", filename)


def delete_vault_document(item: models.Item, db: Session) -> None:
    upload_path = local_upload_path(item.image_url)
    db.delete(item)
    db.commit()
    if upload_path and os.path.exists(upload_path):
        try:
            os.remove(upload_path)
        except OSError:
            logger.warning("Could not remove vault upload file: %s", upload_path)


@app.delete("/api/vault/{item_id}")
def delete_vault_item(
    item_id: int,
    phrase: str = Query(default=""),
    db: Session = Depends(get_db),
):
    if not VAULT_DELETE_PHRASE:
        raise HTTPException(status_code=500, detail="Vault delete phrase is not configured")
    if not secrets.compare_digest((phrase or "").strip(), VAULT_DELETE_PHRASE):
        raise HTTPException(status_code=403, detail="Security phrase is required")

    item = db.query(models.Item).filter(models.Item.id == item_id, models.Item.type == "vault_file").first()
    if not item:
        raise HTTPException(status_code=404, detail="Vault document not found")
    item_title = item.title
    delete_vault_document(item, db)
    audit_action(db, action="delete_vault_document", risk_level=3, status="completed", target_type="vault_file", target_id=item_id, summary=f"Deleted {item_title}", request_text="DELETE /api/vault")
    return {"ok": True}


def send_document_email(to_email: str, item: models.Item) -> tuple[bool, str]:
    MABDC_MAIL_API_KEY = os.getenv("MABDC_MAIL_API_KEY")
    if not MABDC_MAIL_API_KEY:
        return False, "Mail API key is not configured on the backend."
    if not item.image_url:
        return False, "That document does not have a file link yet."

    safe_title = html.escape(item.title or "Vault document")
    safe_url = html.escape(item.image_url)
    payload = {
        "to": to_email,
        "from": "vault-ai@mabdc.org",
        "subject": f"Vault document: {item.title}",
        "html": f"""
        <div style="font-family: sans-serif; color: #333;">
            <h2>Command Brain Vault Document</h2>
            <p>Hello,</p>
            <p>The requested vault document is ready:</p>
            <p><strong>{safe_title}</strong></p>
            <p><a href="{safe_url}">Open document</a></p>
            <p>If the button does not work, copy this link:</p>
            <p>{safe_url}</p>
            <br/>
            <p>Command Brain AI</p>
        </div>
        """,
    }
    try:
        resp = httpx.post(
            "https://api-mail.mabdc.com/v1/emails",
            headers={"Authorization": f"Bearer {MABDC_MAIL_API_KEY}", "Content-Type": "application/json"},
            json=payload,
            timeout=15,
        )
        if resp.status_code in [200, 202]:
            return True, "sent"
        logger.warning("Document email API failed: %s %s", resp.status_code, resp.text)
        return False, f"Mail API returned {resp.status_code}."
    except Exception as exc:
        logger.exception("Document email failed: %s", exc)
        return False, "Mail delivery failed."


def send_generic_email(to_email: str, subject: str, body: str) -> tuple[bool, str]:
    MABDC_MAIL_API_KEY = os.getenv("MABDC_MAIL_API_KEY")
    if not MABDC_MAIL_API_KEY:
        return False, "Mail API key is not configured on the backend."

    safe_body = html.escape(body).replace("\n", "<br/>")
    payload = {
        "to": to_email,
        "from": "vault-ai@mabdc.org",
        "subject": subject,
        "html": f"""
        <div style="font-family: sans-serif; color: #333;">
            <p>{safe_body}</p>
            <br/>
            <p>Command Brain AI</p>
        </div>
        """,
    }
    try:
        resp = httpx.post(
            "https://api-mail.mabdc.com/v1/emails",
            headers={"Authorization": f"Bearer {MABDC_MAIL_API_KEY}", "Content-Type": "application/json"},
            json=payload,
            timeout=15,
        )
        if resp.status_code in [200, 202]:
            return True, "sent"
        logger.warning("Generic email API failed: %s %s", resp.status_code, resp.text)
        return False, f"Mail API returned {resp.status_code}."
    except Exception as exc:
        logger.exception("Generic email failed: %s", exc)
        return False, "Mail delivery failed."


def parse_generic_email(message: str) -> Optional[dict]:
    match = GENERIC_EMAIL_RE.search(message or "")
    if not match:
        return None
    return {
        "to": match.group("email"),
        "subject": match.group("subject").strip(),
        "body": match.group("body").strip(),
    }


def confirmation_token_from_message(message: str) -> str:
    match = re.search(r"\bconfirm\s+([A-Za-z0-9_-]{6,})\b", message or "", re.IGNORECASE)
    return match.group(1) if match else ""


def is_confirmation_message(message: str) -> bool:
    return bool(confirmation_token_from_message(message))


def handle_generic_email_request(message: str, history: list, db: Session) -> Optional[dict]:
    token = confirmation_token_from_message(message)
    if token:
        pending = (
            db.query(models.AssistantAudit)
            .filter(
                models.AssistantAudit.action == "send_email",
                models.AssistantAudit.status == "pending",
                models.AssistantAudit.confirmation_token == token,
            )
            .first()
        )
        if not pending:
            return {"reply": "I could not find a pending email for that confirmation token."}
        payload = json.loads(pending.payload or "{}")
        ok, detail = send_generic_email(payload["to"], payload["subject"], payload["body"])
        if ok:
            pending.status = "completed"
            pending.summary = f"Sent email to {payload['to']}"
            db.commit()
            return {"reply": f"Sent email to {payload['to']}."}
        pending.status = "failed"
        pending.summary = f"Email send failed: {detail}"
        db.commit()
        return {"reply": f"I could not send the email: {detail}"}

    parsed = parse_generic_email(message)
    if not parsed:
        return None
    token = secrets.token_urlsafe(6)
    audit_action(
        db,
        action="send_email",
        risk_level=3,
        status="pending",
        target_type="email",
        summary=f"Pending email to {parsed['to']}",
        request_text=message,
        payload=parsed,
        confirmation_token=token,
    )
    return {
        "reply": (
            f"Confirm send email to {parsed['to']} with subject \"{parsed['subject']}\"? "
            f"Reply `confirm {token}` to send."
        )
    }


def handle_document_email_request(message: str, history: list, db: Session) -> Optional[dict]:
    email_match = EMAIL_RE.search(message or "")
    if not email_match or not SEND_WORD_RE.search(message or ""):
        return None

    to_email = email_match.group(0)
    search_parts = [EMAIL_RE.sub(" ", message)]
    for h in reversed(history[-6:]):
        content = h.get("content", "") if isinstance(h, dict) else ""
        if content:
            search_parts.append(content)
    doc = find_best_vault_document(" ".join(search_parts), db)
    if not doc:
        return {"reply": f"I could not find the vault document to send to {to_email}. Try: send GEMA to {to_email}"}

    ok, detail = send_document_email(to_email, doc)
    if ok:
        audit_action(db, action="send_vault_document_email", risk_level=3, status="completed", target_type="vault_file", target_id=doc.id, summary=f"Sent {doc.title} to {to_email}", request_text=message)
        return {"reply": f"Sent {doc.title} to {to_email}."}
    audit_action(db, action="send_vault_document_email", risk_level=3, status="failed", target_type="vault_file", target_id=doc.id, summary=f"Could not send {doc.title} to {to_email}: {detail}", request_text=message)
    return {"reply": f"I found {doc.title}, but could not send it: {detail}"}


def handle_document_rename_request(message: str, history: list, db: Session) -> Optional[dict]:
    match = RENAME_RE.search(message or "")
    if not match:
        return None

    new_title = match.group(1).strip().strip('"').strip("'")
    if not new_title:
        return {"reply": "Tell me the new document name after `rename to`."}

    search_parts = [RENAME_RE.sub(" ", message or "")]
    for h in reversed(history[-8:]):
        content = h.get("content", "") if isinstance(h, dict) else ""
        if content:
            search_parts.append(content)

    doc = find_best_vault_document(" ".join(search_parts), db)
    if not doc:
        return {"reply": "I could not find which vault document to rename. Try: rename LABOUR CONTRACT to Dennis Labour contract"}

    old_title = doc.title
    doc.title = preserve_file_extension(old_title, new_title)
    db.commit()
    audit_action(db, action="rename_vault_document", risk_level=2, status="completed", target_type="vault_file", target_id=doc.id, summary=f"Renamed {old_title} to {doc.title}", request_text=message)
    return {"reply": f"Renamed {old_title} to {doc.title}."}


def handle_assistant_crud_request(message: str, db: Session) -> Optional[dict]:
    task_match = CREATE_TASK_RE.search(message or "") or QUICK_TASK_RE.search(message or "")
    if task_match:
        raw_title = task_match.group(1).strip()
        due = parse_due_date(raw_title)
        title = clean_action_title(raw_title)
        if not title:
            return {"reply": "Tell me the task title after `create task`."}
        subtitle = f"Task • Due {due}" if due else "Task • No due date"
        body = dump_item_body({"subtasks": [], "priority": "", "due": due, "status": "open"})
        item = create_action_item(db, item_type="task", title=title, subtitle=subtitle, body=body)
        audit_action(db, action="create_task", risk_level=1, status="completed", target_type="task", target_id=item.id, summary=f"Created task {item.title}", request_text=message)
        return {"reply": f"Created task: {item.title}."}

    note_match = CREATE_NOTE_RE.search(message or "")
    if note_match:
        raw_note = note_match.group(1).strip()
        if ":" in raw_note:
            title, body = [part.strip() for part in raw_note.split(":", 1)]
        else:
            title, body = raw_note[:60].strip(), raw_note
        if not title:
            return {"reply": "Tell me the note title after `create note`."}
        item = create_action_item(db, item_type="note", title=title, subtitle="Note • Today", body=body)
        audit_action(db, action="create_note", risk_level=1, status="completed", target_type="note", target_id=item.id, summary=f"Created note {item.title}", request_text=message)
        return {"reply": f"Created note: {item.title}."}

    expense_match = CREATE_EXPENSE_RE.search(message or "")
    if expense_match:
        raw_expense = expense_match.group(1).strip()
        amount_match = re.search(r"\b(\d+(?:\.\d{1,2})?)\s*(AED|USD|EUR|PHP)?\b", raw_expense, re.IGNORECASE)
        if not amount_match:
            return {"reply": "Tell me the expense amount, for example: create expense 42 AED lunch."}
        amount = f"{float(amount_match.group(1)):.2f}"
        currency = (amount_match.group(2) or "AED").upper()
        item_name = clean_action_title(raw_expense.replace(amount_match.group(0), "", 1)) or "Expense"
        title = f"{amount} {currency} {item_name}"
        body = dump_item_body({"amount": amount, "currency": currency, "item": item_name, "date": parse_due_date(raw_expense)})
        item = create_action_item(db, item_type="expense", title=title, subtitle="Other • Today", body=body)
        audit_action(db, action="create_expense", risk_level=1, status="completed", target_type="expense", target_id=item.id, summary=f"Created expense {item.title}", request_text=message)
        return {"reply": f"Created expense: {item.title}."}

    reminder_match = REMINDER_RE.search(message or "")
    if reminder_match:
        raw_title = reminder_match.group(1).strip()
        date = parse_due_date(raw_title)
        time_value = parse_time(raw_title)
        title = clean_action_title(raw_title)
        if not title:
            return {"reply": "Tell me what to remind you about."}
        repeat_part = "Once"
        time_part = f" at {time_value}" if time_value else ""
        subtitle = f"Reminder • {repeat_part}{time_part}"
        body = dump_item_body({"date": date, "time": time_value, "repeat": repeat_part, "status": "open"})
        item = create_action_item(db, item_type="reminder", title=title, subtitle=subtitle, body=body)
        audit_action(db, action="create_reminder", risk_level=1, status="completed", target_type="reminder", target_id=item.id, summary=f"Created reminder {item.title}", request_text=message)
        return {"reply": f"Created reminder: {item.title}."}

    done_match = MARK_DONE_RE.search(message or "")
    open_match = MARK_OPEN_RE.search(message or "")
    if done_match or open_match:
        target_query = (done_match or open_match).group(1).strip()
        task, ambiguous = find_unique_best_item("task", target_query, db)
        if ambiguous:
            names = ", ".join(item.title for item in ambiguous[:5])
            audit_action(db, action="update_task_status", risk_level=2, status="blocked", target_type="task", summary=f"Ambiguous task match: {names}", request_text=message)
            return {"reply": f"I found multiple matching tasks: {names}. Please use a more specific title."}
        if not task:
            return {"reply": f"I could not find a task matching `{target_query}`."}
        body = parse_item_body(task)
        status = "done" if done_match else "open"
        body["status"] = status
        task.body = dump_item_body(body)
        task.subtitle = re.sub(r"\s•\s(?:Done|Open)$", "", task.subtitle or "")
        task.subtitle = f"{task.subtitle or 'Task'} • {'Done' if status == 'done' else 'Open'}"
        db.commit()
        audit_action(db, action="update_task_status", risk_level=2, status="completed", target_type="task", target_id=task.id, summary=f"Marked task {status}: {task.title}", request_text=message)
        return {"reply": f"Marked task {status}: {task.title}."}

    return None


def pending_delete_query(history: list) -> str:
    for h in reversed(history[-8:]):
        if not isinstance(h, dict) or h.get("role") != "user":
            continue
        content = h.get("content", "")
        if DELETE_WORD_RE.search(content or ""):
            return content
    return ""


def pending_delete_title(history: list) -> str:
    for h in reversed(history[-8:]):
        if not isinstance(h, dict) or h.get("role") != "assistant":
            continue
        content = h.get("content", "")
        match = re.search(r"^I found (.+?)\\. To delete it, reply with the security phrase\\.", content or "")
        if match:
            return match.group(1)
    return ""


def ask_for_vault_delete_phrase(doc: models.Item) -> dict:
    return {"reply": f"I found {doc.title}. To delete it, reply with the security phrase."}


def handle_document_delete_request(message: str, history: list, db: Session) -> Optional[dict]:
    current_delete_request = bool(DELETE_WORD_RE.search(message or ""))
    phrase_provided = is_exact_security_phrase(message or "")
    previous_delete_request = pending_delete_query(history) if phrase_provided else ""

    if not current_delete_request and not previous_delete_request:
        return None

    if current_delete_request and not DOCUMENT_WORD_RE.search(message or ""):
        return None

    search_text = message if current_delete_request else previous_delete_request
    confirmed_title = pending_delete_title(history) if phrase_provided else ""
    doc = find_vault_document_by_title(confirmed_title, db) if confirmed_title else find_best_vault_document(search_text, db)
    if not doc:
        return {"reply": "I could not find the vault document to delete. Tell me the document name, then I will ask for the security phrase."}

    if current_delete_request:
        return ask_for_vault_delete_phrase(doc)

    doc_title = doc.title
    doc_id = doc.id
    delete_vault_document(doc, db)
    audit_action(db, action="delete_vault_document", risk_level=3, status="completed", target_type="vault_file", target_id=doc_id, summary=f"Deleted {doc_title}", request_text=message)
    return {"reply": f"Deleted {doc_title} from the vault."}


def extract_pdf_text(contents: bytes) -> str:
    try:
        pdf_doc = fitz.open(stream=contents, filetype="pdf")
        try:
            pages = [page.get_text("text").strip() for page in pdf_doc]
        finally:
            pdf_doc.close()
        return "\n\n".join(page for page in pages if page).strip()
    except Exception as exc:
        logger.warning("PDF text extraction failed: %s", exc)
        return ""


def render_pdf_pages_for_vision(contents: bytes, max_pages: int = 3) -> list[str]:
    images = []
    try:
        pdf_doc = fitz.open(stream=contents, filetype="pdf")
        try:
            for page_index in range(min(max_pages, pdf_doc.page_count)):
                page = pdf_doc.load_page(page_index)
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                images.append(base64.b64encode(pix.tobytes("jpeg")).decode("utf-8"))
        finally:
            pdf_doc.close()
    except Exception as exc:
        logger.warning("PDF render failed: %s", exc)
    return images


def parse_vault_extraction(raw_text: str, filename: str, pdf_text: str = "") -> dict:
    fallback = {
        "document_title": os.path.splitext(filename)[0] or "Document",
        "category": "Document",
        "expiry_date": "None",
        "summary": "",
        "full_text": pdf_text,
    }
    try:
        clean = (raw_text or "").strip()
        if clean.startswith("```"):
            clean = "\n".join(line for line in clean.splitlines() if not line.strip().startswith("```"))
        data = json.loads(clean)
        return {
            "document_title": str(data.get("document_title") or fallback["document_title"]).strip(),
            "category": str(data.get("category") or fallback["category"]).strip(),
            "expiry_date": str(data.get("expiry_date") or fallback["expiry_date"]).strip(),
            "summary": str(data.get("summary") or fallback["summary"]).strip(),
            "full_text": str(data.get("full_text") or fallback["full_text"]).strip(),
        }
    except Exception:
        parts = (raw_text or "").split("|", 2)
        if len(parts) >= 2:
            fallback["category"] = parts[0].strip() or fallback["category"]
            fallback["expiry_date"] = parts[1].strip() or fallback["expiry_date"]
            fallback["full_text"] = parts[2].strip() if len(parts) > 2 else fallback["full_text"]
        return fallback


def direct_vault_match_answer(docs: list[models.Item]) -> Optional[str]:
    if not docs:
        return None
    if any((doc.body or "").strip() for doc in docs):
        return None
    lines = [f"{doc.title} — {doc.subtitle or 'Vault document'}" for doc in docs[:5]]
    return "I found these matching vault documents:\n" + "\n".join(f"- {line}" for line in lines)

@app.post("/api/scan", response_model=List[schemas.Item])
async def scan_files(files: List[UploadFile] = File(...), db: Session = Depends(get_db)):
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="OpenRouter API key is not configured.")
    
    created_items = []
    
    async with httpx.AsyncClient() as client:
        for file in files:
            contents = await file.read()
            mime_type = file.content_type or "image/jpeg"
            
            if mime_type == "application/pdf":
                try:
                    pdf_doc = fitz.open(stream=contents, filetype="pdf")
                    page = pdf_doc.load_page(0)
                    pix = page.get_pixmap()
                    contents = pix.tobytes("jpeg")
                    mime_type = "image/jpeg"
                    pdf_doc.close()
                except Exception as e:
                    raise HTTPException(status_code=400, detail=f"Failed to parse PDF: {str(e)}")
            
            base64_image = base64.b64encode(contents).decode("utf-8")
            
            # Save file locally
            ext = mime_type.split("/")[-1]
            if ext == "jpeg": ext = "jpg"
            filename = f"{uuid.uuid4()}.{ext}"
            filepath = os.path.join("uploads", filename)
            with open(filepath, "wb") as f:
                f.write(contents)
                
            image_url = uploaded_file_url(filename)
            
            payload = {
                "model": "openai/gpt-4o",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Extract the following from this image: 1. A short title, 2. A short subtitle, 3. The document expiry date (if any, otherwise output 'None'). Format your response exactly as: Title|Subtitle|ExpiryDate. Do not include any other text."},
                            {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{base64_image}"}}
                        ]
                    }
                ]
            }
            
            headers = {
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json"
            }
            
            response = await client.post("https://openrouter.ai/api/v1/chat/completions", json=payload, headers=headers, timeout=60.0)
            
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=f"OCR API failed: {response.text}")
                
            data = response.json()
            ocr_text = data["choices"][0]["message"]["content"]
            
            parts = ocr_text.split("|")
            title = parts[0].strip() if len(parts) > 0 else "Scanned Note"
            subtitle = parts[1].strip() if len(parts) > 1 else "Note • Today"
            expiry_date = parts[2].strip() if len(parts) > 2 else "None"
            
            if expiry_date.lower() == "none" or not expiry_date:
                expiry_date = None
            
            # Default to Personal workspace for auto-scanned notes unless specified
            item_data = schemas.ItemCreate(type="note", title=title, subtitle=subtitle, image_url=image_url, expiry_date=expiry_date, workspace="Personal")
            db_item = models.Item(**model_data(item_data))
            db.add(db_item)
            db.commit()
            db.refresh(db_item)
            created_items.append(db_item)
            
    return created_items


@app.post("/api/chat")
async def chat_with_ai(request: Request, db: Session = Depends(get_db)):
    from fastapi import Request as _R
    data    = await request.json()
    message = data.get("message", "")
    history = data.get("history", [])

    email_intent = handle_generic_email_request(message, history, db)
    if email_intent:
        return email_intent

    crud_intent = handle_assistant_crud_request(message, db)
    if crud_intent:
        return crud_intent

    delete_intent = handle_document_delete_request(message, history, db)
    if delete_intent:
        return delete_intent

    rename_intent = handle_document_rename_request(message, history, db)
    if rename_intent:
        return rename_intent

    mail_intent = handle_document_email_request(message, history, db)
    if mail_intent:
        return mail_intent

    planned_tool = await plan_assistant_tool_with_llm(message, history)
    if planned_tool:
        tool_intent = execute_assistant_plan(planned_tool, message, db)
        if tool_intent:
            return tool_intent

    if not OPENROUTER_API_KEY:
        return {"reply": "⚠️ No API key. Go to Settings → AI & Privacy to add your OpenRouter key."}

    items = db.query(models.Item).order_by(models.Item.created_at.desc()).limit(80).all()
    by_type = {}
    for i in items:
        by_type.setdefault(i.type, []).append(f"  • {i.title} ({i.subtitle})")
    context_lines = []
    for t, rows in by_type.items():
        context_lines.append(f"[{t.upper()}S]"); context_lines.extend(rows[:15])
    context = "\n".join(context_lines) if context_lines else "No data yet."

    system_prompt = f"""You are Command Brain AI — a smart, concise personal assistant in a life-organiser app.
User's data:
{context}
Reply in 2-4 sentences. Use data above for specific answers. Be warm but brief."""

    messages_payload = [{"role": "system", "content": system_prompt}]
    for h in history[-10:]:
        messages_payload.append({"role": h["role"], "content": h["content"]})
    messages_payload.append({"role": "user", "content": message})

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"},
            json={"model": "openai/gpt-4o", "messages": messages_payload},
            timeout=30.0,
        )
    if resp.status_code != 200:
        return {"reply": f"❌ API error {resp.status_code}. Check your OpenRouter key."}
    return {"reply": resp.json()["choices"][0]["message"]["content"]}


@app.post("/api/receipt")
async def parse_receipt(files: List[UploadFile] = File(...), db: Session = Depends(get_db)):
    """Parse a receipt image → extract individual line items as separate expenses."""
    import json as _json
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="No API key configured.")
    created = []
    async with httpx.AsyncClient() as client:
        for file in files:
            contents  = await file.read()
            mime_type = file.content_type or "image/jpeg"
            if mime_type == "application/pdf":
                pdf_doc   = fitz.open(stream=contents, filetype="pdf")
                pix       = pdf_doc.load_page(0).get_pixmap()
                contents  = pix.tobytes("jpeg"); mime_type = "image/jpeg"; pdf_doc.close()
            b64      = base64.b64encode(contents).decode()
            ext      = "jpg" if mime_type.endswith("jpeg") else mime_type.split("/")[-1]
            filename = f"{uuid.uuid4()}.{ext}"
            with open(os.path.join("uploads", filename), "wb") as f: f.write(contents)
            image_url = uploaded_file_url(filename)

            prompt = (
                "This is a receipt. Extract each line item with its price. "
                "Return ONLY a JSON array: "
                '[{"item":"Coffee","price":12.5,"category":"Food & Drinks"}]. '
                "Categories: Food & Drinks, Transport, Shopping, Bills & Utilities, Entertainment, Health, Other. "
                "No markdown, raw JSON only."
            )
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"},
                json={"model": "openai/gpt-4o", "messages": [{"role": "user", "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{b64}"}}
                ]}]},
                timeout=60.0,
            )
            try:
                raw = resp.json()["choices"][0]["message"]["content"].strip()
                if raw.startswith("```"): raw = "\n".join(raw.split("\n")[1:-1])
                line_items = _json.loads(raw)
            except Exception:
                line_items = [{"item": "Receipt scan", "price": 0, "category": "Other"}]
            for li in line_items:
                db_item = models.Item(
                    type="expense",
                    title=f"{float(li.get('price',0)):.2f} AED {li.get('item','Item')}",
                    subtitle=f"{li.get('category','Other')} • Today",
                    image_url=image_url,
                )
                db.add(db_item); db.commit(); db.refresh(db_item)
                created.append(db_item)
    return created

class RAGRequest(BaseModel):
    query: str
    workspace: str = "Personal"

@app.post("/api/rag_query")
async def rag_query(request: RAGRequest, db: Session = Depends(get_db)):
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="OpenRouter API key is not configured.")
        
    docs = db.query(models.Item).filter(
        models.Item.workspace == request.workspace,
        models.Item.type.in_(["vault_file", "note"])
    ).all()
    
    if not docs:
        return {"answer": "You don't have any documents in this workspace yet. Upload some files to the Vault to get started!"}

    query_text = normalize_search_text(request.query)
    query_tokens = {token for token in query_text.split() if len(token) > 2}
    matching_docs = [
        d for d in docs
        if query_tokens and any(
            token in normalize_search_text(" ".join([d.title or "", d.subtitle or "", d.body or "", d.tags or ""]))
            for token in query_tokens
        )
    ]
    docs_for_context = matching_docs or docs
    if matching_docs:
        direct_answer = direct_vault_match_answer(matching_docs)
        if direct_answer:
            return {"answer": direct_answer}

    context_blocks = []
    for d in docs_for_context:
        context_blocks.append(
            "\n".join(
                part for part in [
                    f"Document: {d.title}",
                    f"Title: {d.title}",
                    f"Summary: {d.subtitle}" if d.subtitle else "",
                    f"Tags: {d.tags}" if d.tags else "",
                    d.body or "",
                    "---",
                ]
                if part
            )
        )
            
    context_str = "\\n".join(context_blocks)
    if not context_str.strip():
        return {"answer": "I found some files, but they don't have any readable text inside them yet."}
        
    prompt = f"""You are a helpful Vault Assistant.
Use ONLY the following context from the user's private documents to answer their query.
If the answer is not contained within the context, say "I couldn't find that in your vault documents."

CONTEXT:
{context_str}

USER QUERY:
{request.query}
"""

    async with httpx.AsyncClient() as client:
        payload = {
            "model": "openai/gpt-4o-mini",
            "messages": [{"role": "user", "content": prompt}]
        }
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json"
        }
        response = await client.post("https://openrouter.ai/api/v1/chat/completions", json=payload, headers=headers, timeout=30.0)
        
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail="AI query failed")
            
        data = response.json()
        answer = data["choices"][0]["message"]["content"]
        
    return {"answer": answer}

def send_expiry_email(to_email: str, doc_title: str, expiry_date: str, days_left: int = 0):
    MABDC_MAIL_API_KEY = os.getenv('MABDC_MAIL_API_KEY')
    if not MABDC_MAIL_API_KEY:
        logger.info("[MOCK EMAIL] To %s: '%s' expires in %s days on %s", to_email, doc_title, days_left, expiry_date)
        return

    safe_doc_title = html.escape(doc_title)
    safe_expiry_date = html.escape(expiry_date)

    try:
        url = 'https://api-mail.mabdc.com/v1/emails'
        headers = {
            'Authorization': f'Bearer {MABDC_MAIL_API_KEY}',
            'Content-Type': 'application/json'
        }
        
        html_body = f"""
        <div style="font-family: sans-serif; color: #333;">
            <h2>Command Brain Vault Alert</h2>
            <p>Hello,</p>
            <p>This is an automated reminder.</p>
            <p>Your document <strong>'{safe_doc_title}'</strong> is expiring on <strong>{safe_expiry_date}</strong> (in {days_left} days).</p>
            <p>Please take necessary actions to renew or update this document.</p>
            <br/>
            <p>Vault AI</p>
        </div>
        """
        
        payload = {
            'to': to_email,
            'from': 'vault-ai@mabdc.org',
            'subject': f"Action Required: '{doc_title}' expires in {days_left} days",
            'html': html_body
        }

        resp = httpx.post(url, headers=headers, json=payload, timeout=10)
        
        if resp.status_code in [200, 202]:
            logger.info("Sent expiry email for '%s' to %s via api-mail.mabdc.com", doc_title, to_email)
        else:
            logger.warning("Email API failed: %s %s", resp.status_code, resp.text)
    except Exception as e:
        logger.exception("Email failed: %s", e)


def check_expirations_and_notify():
    db = SessionLocal()
    try:
        items = db.query(models.Item).filter(models.Item.expiry_date.is_not(None)).all()
        today = datetime.now()
        for item in items:
            try:
                # Assuming expiry_date is formatted as 'DD MMM YYYY' or 'YYYY-MM-DD'
                # Let's try to parse common formats
                exp_date_str = item.expiry_date.strip()
                if exp_date_str.lower() == 'none':
                    continue
                exp_date = None
                formats = ['%d %b %Y', '%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%B %d, %Y']
                for fmt in formats:
                    try:
                        exp_date = datetime.strptime(exp_date_str, fmt)
                        break
                    except ValueError:
                        pass
                
                if exp_date:
                    delta = (exp_date - today).days
                    # Send notification on 30, 15, 10, 5 days
                    if delta in [30, 15, 10, 5]:
                        send_expiry_email('sottodennis@gmail.com', item.title, exp_date_str, delta)
            except Exception as e:
                logger.warning("Error parsing expiry date for item %s: %s", item.id, e)
    finally:
        db.close()

scheduler.add_job(check_expirations_and_notify, CronTrigger(hour=8, minute=0))

@app.post("/api/vault_upload")
async def vault_upload(file: UploadFile = File(...), workspace: str = Form("Company"), db: Session = Depends(get_db)):
    logger.info("Vault upload triggered for %s (%s)", file.filename, file.content_type)
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="OpenRouter API key is not configured.")

    contents = await file.read()
    mime_type = file.content_type or "application/pdf"
    
    vision_images = []
    pdf_text = ""

    # Convert PDF pages to images and extract embedded text when available.
    if "pdf" in mime_type.lower() or file.filename.lower().endswith(".pdf"):
        pdf_text = extract_pdf_text(contents)
        vision_images = render_pdf_pages_for_vision(contents)
        mime_type = "image/jpeg"
    elif mime_type.startswith("image/"):
        vision_images = [base64.b64encode(contents).decode("utf-8")]
    
    # Save locally
    ext = file.filename.split('.')[-1] if '.' in file.filename else "file"
    filename = f"{uuid.uuid4()}.{ext}"
    os.makedirs("uploads", exist_ok=True)
    with open(os.path.join("uploads", filename), "wb") as f:
        f.write(contents)

    image_url = uploaded_file_url(filename)

    prompt = f"""
You are indexing an employee/document vault file.
Filename: {file.filename}
Embedded PDF text, if present:
{pdf_text[:12000]}

Read the visible pages and embedded text. Identify the document accurately, especially labour contracts, insurance certificates, IDs, visas, passports, NOCs, and employment documents.
Return ONLY valid JSON with these keys:
{{"document_title":"specific human title","category":"document category","expiry_date":"YYYY-MM-DD or None","summary":"one sentence summary","full_text":"best readable text for search"}}
If an expiry date is not explicitly present, use "None". Do not guess dates.
"""

    ocr_text = ""
    
    if vision_images:
        try:
            async with httpx.AsyncClient() as client:
                content = [{"type": "text", "text": prompt}]
                for image_b64 in vision_images:
                    content.append({"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{image_b64}"}})
                payload = {
                    "model": "openai/gpt-4o",
                    "messages": [
                        {
                            "role": "user",
                            "content": content
                        }
                    ]
                }
                headers = {"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"}
                response = await client.post("https://openrouter.ai/api/v1/chat/completions", json=payload, headers=headers, timeout=60.0)
                
                if response.status_code == 200:
                    data = response.json()
                    ocr_text = data["choices"][0]["message"]["content"]
                else:
                    logger.warning("AI error: %s %s", response.status_code, response.text)
        except Exception as e:
            logger.exception("AI exception while processing vault upload: %s", e)

    extracted = parse_vault_extraction(ocr_text, file.filename, pdf_text)
    category = extracted["category"] or "Document"
    expiry = extracted["expiry_date"] or "None"
    summary = extracted["summary"]
    index_text = "\n\n".join(
        part for part in [
            f"Filename: {file.filename}",
            f"Title: {extracted['document_title']}",
            f"Category: {category}",
            f"Summary: {summary}" if summary else "",
            extracted["full_text"],
            pdf_text,
        ]
        if part
    )

    vault_item = models.Item(
        type="vault_file",
        title=file.filename,
        subtitle=f"{category} • Processed today",
        body=index_text,
        image_url=image_url,
        workspace=workspace
    )
    db.add(vault_item)

    if expiry.lower() != "none" and len(expiry) > 4:
        reminder_item = models.Item(
            type="reminder",
            title=f"Renew: {file.filename}",
            subtitle=f"Expires {expiry}",
            workspace=workspace
        )
        db.add(reminder_item)
        send_expiry_email("sottodennis@gmail.com", file.filename, expiry)

    db.commit()
    logger.info("Vault upload succeeded for %s", file.filename)
    return {"status": "success"}

class VoiceMemoRequest(BaseModel):
    transcript: str
    workspace: str = 'Personal'

@app.post('/api/vault_voice')
async def vault_voice(request: VoiceMemoRequest, db: Session = Depends(get_db)):
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail='OpenRouter API key is not configured.')

    prompt = f'Analyze the following voice memo transcript. Extract: 1. A short title (max 5 words), 2. A one-sentence summary, 3. A single Tag (e.g. Taxes, Ideas, Meeting, Medical, Contract, Personal). Format exactly as: Title|Summary|Tag\n\nTranscript: {request.transcript}'

    async with httpx.AsyncClient() as client:
        payload = {
            'model': 'openai/gpt-4o-mini',
            'messages': [{'role': 'user', 'content': prompt}]
        }
        headers = {'Authorization': f'Bearer {OPENROUTER_API_KEY}', 'Content-Type': 'application/json'}
        response = await client.post('https://openrouter.ai/api/v1/chat/completions', json=payload, headers=headers, timeout=30.0)

        if response.status_code != 200:
            raise HTTPException(status_code=500, detail='AI processing failed')

        data = response.json()
        ai_text = data['choices'][0]['message']['content']

        parts = ai_text.split('|', 2)
        title = parts[0].strip() if len(parts) > 0 else 'Voice Memo'
        summary = parts[1].strip() if len(parts) > 1 else 'Voice dictation'
        tag = parts[2].strip() if len(parts) > 2 else 'Memo'

        vault_item = models.Item(
            type='vault_file',
            title=f'🎙️ {title}',
            subtitle=summary,
            body=request.transcript,
            tags=tag,
            workspace=request.workspace
        )
        db.add(vault_item)
        db.commit()
        db.refresh(vault_item)
        return vault_item

@app.post('/items/{item_id}/share')
def share_item(item_id: int, db: Session = Depends(get_db)):
    db_item = db.query(models.Item).filter(models.Item.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail='Item not found')
    
    db_item.share_token = secrets.token_urlsafe(32)
    db_item.share_expires_at = datetime.utcnow() + timedelta(hours=24)
    db.commit()
    db.refresh(db_item)
    return {'share_token': db_item.share_token, 'expires_at': db_item.share_expires_at}

@app.get('/api/shared/{token}')
def get_shared_item(token: str, db: Session = Depends(get_db)):
    db_item = db.query(models.Item).filter(models.Item.share_token == token).first()
    if not db_item:
        raise HTTPException(status_code=404, detail='Link invalid or expired')
    
    if db_item.share_expires_at and db_item.share_expires_at < datetime.utcnow():
        raise HTTPException(status_code=404, detail='Link expired')
        
    return db_item
