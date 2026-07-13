from contextlib import asynccontextmanager
from datetime import datetime, timedelta
import base64
import hashlib
import hmac
import html
import json
import logging
import os
import re
import secrets
import shutil
import tarfile
import uuid

from fastapi import FastAPI, Depends, UploadFile, File, HTTPException, Request, Form, Query, Response, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from typing import List, Optional
import httpx
import base64
from celery_app import celery_app
from embeddings import generate_embedding
from llm import call_llm_async

import fitz
from dotenv import load_dotenv

load_dotenv()
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "https://brain.mabdc.com").rstrip("/")
AUTH_EMAIL = os.getenv("AUTH_EMAIL", "").strip().lower()
AUTH_PASSWORD = os.getenv("AUTH_PASSWORD", "")
SESSION_SECRET = os.getenv("SESSION_SECRET", secrets.token_urlsafe(32))
AUTH_REQUIRED = os.getenv("AUTH_REQUIRED", "true").lower() not in {"0", "false", "no", "off"}
SESSION_COOKIE = "commandbrain_session"
BACKUP_DIR = os.getenv("BACKUP_DIR", "/home/admin/app/backups")
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

# scheduler = BackgroundScheduler() (replaced by celery)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # APScheduler removed; Celery worker runs independently
    try:
        yield
    finally:
        pass


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


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

manager = ConnectionManager()

@app.websocket("/ws/status")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

class LoginRequest(BaseModel):
    email: str
    password: str


class VaultMetadataUpdate(BaseModel):
    title: str
    category: str = "Document"
    owner: str = ""
    expiry_date: str = "None"
    summary: str = ""
    full_text: str = ""


class VaultBulkRequest(BaseModel):
    ids: list[int]


class VaultBulkDeleteRequest(VaultBulkRequest):
    phrase: str = ""


class VaultBulkEmailRequest(VaultBulkRequest):
    to: str


def model_data(model: BaseModel, *, exclude_unset: bool = False) -> dict:
    if hasattr(model, "model_dump"):
        return model.model_dump(exclude_unset=exclude_unset)
    return model.dict(exclude_unset=exclude_unset)


def uploaded_file_url(filename: str) -> str:
    return f"{PUBLIC_BASE_URL}/static/{filename}"


def auth_is_configured() -> bool:
    return bool(AUTH_EMAIL and AUTH_PASSWORD and SESSION_SECRET)


def session_signature(payload: str) -> str:
    return hmac.new(SESSION_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def create_session_token(email: str) -> str:
    payload = json.dumps({"email": email.lower(), "iat": datetime.utcnow().isoformat()}, separators=(",", ":"))
    encoded = base64.urlsafe_b64encode(payload.encode("utf-8")).decode("ascii").rstrip("=")
    return f"{encoded}.{session_signature(encoded)}"


def verify_session_token(token: str | None) -> Optional[str]:
    if not token or "." not in token or not auth_is_configured():
        return None
    encoded, signature = token.rsplit(".", 1)
    if not hmac.compare_digest(session_signature(encoded), signature):
        return None
    try:
        padded = encoded + ("=" * (-len(encoded) % 4))
        payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))
    except Exception:
        return None
    email = str(payload.get("email") or "").lower()
    return email if hmac.compare_digest(email, AUTH_EMAIL) else None


def request_user_email(request: Request) -> Optional[str]:
    return verify_session_token(request.cookies.get(SESSION_COOKIE))


def set_session_cookie(response: Response, email: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        create_session_token(email),
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 30,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/", secure=True, samesite="lax")


def upload_filename_from_url(image_url: str | None) -> str:
    if not image_url or "/static/" not in image_url:
        return ""
    filename = image_url.rsplit("/static/", 1)[-1].split("?", 1)[0].split("#", 1)[0]
    return os.path.basename(filename)


def is_public_path(path: str, method: str) -> bool:
    if method.upper() == "OPTIONS":
        return True
    return (
        path in {"/api/auth/login", "/api/auth/me", "/api/auth/logout"}
        or path.startswith("/api/shared/")
        or path in {"/docs", "/redoc", "/openapi.json"}
    )


@app.middleware("http")
async def require_auth_session(request: Request, call_next):
    path = request.url.path
    private_path = path.startswith("/api/") or path.startswith("/items") or path.startswith("/static/")
    if AUTH_REQUIRED and private_path and not is_public_path(path, request.method):
        if not auth_is_configured():
            return JSONResponse({"detail": "Authentication is not configured"}, status_code=503)
        if not request_user_email(request):
            return JSONResponse({"detail": "Authentication required"}, status_code=401)
    return await call_next(request)


@app.post("/api/auth/login")
async def auth_login(payload: LoginRequest, response: Response):
    if not auth_is_configured():
        raise HTTPException(status_code=503, detail="Authentication is not configured")
    email = (payload.email or "").strip().lower()
    if not hmac.compare_digest(email, AUTH_EMAIL) or not hmac.compare_digest(payload.password or "", AUTH_PASSWORD):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    set_session_cookie(response, email)
    return {"authenticated": True, "email": email}


@app.get("/api/auth/me")
async def auth_me(request: Request):
    email = request_user_email(request)
    return {"authenticated": bool(email), "email": email}


@app.post("/api/auth/logout")
async def auth_logout(response: Response):
    clear_session_cookie(response)
    return {"ok": True}


EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
SEND_WORD_RE = re.compile(r"\b(send|email|mail|forward)\b", re.IGNORECASE)
DELETE_WORD_RE = re.compile(r"\b(delete|remove|trash)\b", re.IGNORECASE)
DOCUMENT_WORD_RE = re.compile(r"\b(vault|document|doc|file|pdf|contract|scan)\b", re.IGNORECASE)
OCR_WORD_RE = re.compile(r"\b(?:ocr|scan|rescan|re-scan|read document|read file)\b", re.IGNORECASE)
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
    ranked = find_ranked_vault_document_matches(query, db)
    return ranked[0]["doc"] if ranked else None


VAULT_MATCH_STOPWORDS = {
    "delete", "remove", "trash", "send", "email", "mail", "forward", "rename", "document", "doc", "file", "pdf",
    "the", "this", "that", "please", "to", "from", "with", "subject", "body", "confirm", "vault", "contract",
    "example", "com", "mabdc", "brain", "https", "static",
}


def find_ranked_vault_document_matches(query: str, db: Session) -> list[dict]:
    query_embedding = generate_embedding(query)
    
    docs = db.query(models.Item).filter(models.Item.type == "vault_file", models.Item.image_url.is_not(None)).all()
    ranked = []
    
    query_tokens = { token for token in normalize_search_text(query).split() if len(token) > 2 and token not in VAULT_MATCH_STOPWORDS }
    if not query_tokens:
        query_tokens = { token for token in normalize_search_text(query).split() if len(token) > 2 and token not in {"the", "this", "that", "please", "to", "from"} }

    for doc in docs:
        score = 0
        confidence = 0.0
        
        if doc.embedding and query_embedding and any(query_embedding):
            try:
                dot = sum(a * b for a, b in zip(doc.embedding, query_embedding))
                mag1 = sum(a * a for a in doc.embedding) ** 0.5
                mag2 = sum(b * b for b in query_embedding) ** 0.5
                similarity = dot / (mag1 * mag2) if mag1 and mag2 else 0
                score = similarity * 10
                confidence = max(0.0, min(1.0, similarity))
            except Exception:
                pass
                
        haystack = normalize_search_text(" ".join([doc.title or "", doc.subtitle or "", doc.body or "", doc.workspace or ""]))
        matched_tokens = sorted(token for token in query_tokens if token in haystack)
        
        if not confidence:
            score = len(matched_tokens)
            confidence = min(1.0, score / max(len(query_tokens), 1)) if query_tokens else 0.0

        if score > 0 or confidence > 0.3:
            ranked.append({
                "doc": doc,
                "score": score,
                "confidence": confidence,
                "matched_tokens": matched_tokens,
            })
            
    return sorted(ranked, key=lambda match: (match["score"], len(match["doc"].title or "")), reverse=True)


def vault_match_details(match: dict, alternatives: list[dict] | None = None) -> dict:
    doc = match["doc"]
    return {
        "document_title": doc.title,
        "document_id": doc.id,
        "match_confidence": round(float(match.get("confidence") or 0), 2),
        "match_reason": "Matched tokens: " + ", ".join(match.get("matched_tokens") or []),
        "alternatives": [
            {
                "document_title": alt["doc"].title,
                "document_id": alt["doc"].id,
                "match_confidence": round(float(alt.get("confidence") or 0), 2),
            }
            for alt in (alternatives or [])[:3]
        ],
    }


def ambiguous_vault_match_reply(matches: list[dict]) -> dict:
    names = ", ".join(match["doc"].title for match in matches[:5])
    return {"reply": f"I found multiple matching vault documents: {names}. Please use a more specific document name."}


def resolve_vault_document_match(query: str, db: Session) -> tuple[Optional[dict], Optional[dict]]:
    ranked = find_ranked_vault_document_matches(query, db)
    if not ranked:
        return None, None
    top_score = ranked[0]["score"]
    tied = [match for match in ranked if match["score"] == top_score]
    if len(tied) > 1:
        return None, ambiguous_vault_match_reply(tied)
    return ranked[0], None


def find_vault_document_by_title(title: str, db: Session) -> Optional[models.Item]:
    return (
        db.query(models.Item)
        .filter(models.Item.type == "vault_file", models.Item.title == title)
        .first()
    )


def find_vault_document_by_normalized_title(title: str, db: Session) -> tuple[Optional[models.Item], Optional[dict]]:
    wanted = normalize_search_text(title)
    if not wanted:
        return None, None
    matches = [
        item
        for item in db.query(models.Item).filter(models.Item.type == "vault_file").all()
        if normalize_search_text(item.title or "") == wanted
    ]
    if len(matches) > 1:
        return None, ambiguous_vault_match_reply([{"doc": item} for item in matches])
    return (matches[0], None) if matches else (None, None)


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


def normalize_expiry_date(value: str) -> str:
    raw = (value or "").strip()
    if not raw or raw.lower() == "none":
        return "None"
    iso_match = re.search(r"\b(20\d{2})-(\d{1,2})-(\d{1,2})\b", raw)
    if iso_match:
        year, month, day = [int(part) for part in iso_match.groups()]
        try:
            return datetime(year, month, day).date().isoformat()
        except ValueError:
            return raw
    slash_match = re.search(r"\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b", raw)
    if slash_match:
        first, second, year = [int(part) for part in slash_match.groups()]
        month, day = first, second
        if first > 12 and second <= 12:
            day, month = first, second
        try:
            return datetime(year, month, day).date().isoformat()
        except ValueError:
            return raw
    month_names = {
        "jan": 1, "january": 1,
        "feb": 2, "february": 2,
        "mar": 3, "march": 3,
        "apr": 4, "april": 4,
        "may": 5,
        "jun": 6, "june": 6,
        "jul": 7, "july": 7,
        "aug": 8, "august": 8,
        "sep": 9, "sept": 9, "september": 9,
        "oct": 10, "october": 10,
        "nov": 11, "november": 11,
        "dec": 12, "december": 12,
    }
    day_month = re.search(r"\b(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})\b", raw)
    month_day = re.search(r"\b([A-Za-z]+)\s+(\d{1,2}),?\s+(20\d{2})\b", raw)
    match = day_month or month_day
    if match:
        if day_month:
            day = int(match.group(1))
            month = month_names.get(match.group(2).lower())
            year = int(match.group(3))
        else:
            month = month_names.get(match.group(1).lower())
            day = int(match.group(2))
            year = int(match.group(3))
        if month:
            try:
                return datetime(year, month, day).date().isoformat()
            except ValueError:
                return raw
    return raw


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
    payload = parse_json_object(row.payload or "{}") or {}
    return {
        "id": row.id,
        "action": row.action,
        "risk_level": row.risk_level,
        "status": row.status,
        "target_type": row.target_type,
        "target_id": row.target_id,
        "summary": row.summary,
        "request_text": row.request_text,
        "payload": payload,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def email_audit_to_dict(row: models.AssistantAudit) -> dict:
    payload = parse_json_object(row.payload or "{}") or {}
    return {
        **audit_to_dict(row),
        "to": payload.get("to", ""),
        "subject": payload.get("subject") or payload.get("document_title") or "",
        "body": payload.get("body", ""),
        "document_id": payload.get("document_id"),
        "document_title": payload.get("document_title", ""),
        "delivery_detail": payload.get("delivery_detail") or row.summary or "",
        "can_resend": row.status == "completed" and row.action in {"send_email", "send_vault_document_email", "resend_email"},
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
    content = await call_llm_async(model="openai/gpt-4o-mini", messages=messages_payload, temperature=0.0)
    if not content:
        return None

    planned = parse_json_object(content)
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


def execute_assistant_tool(
    tool_name: str,
    arguments: dict,
    request_text: str,
    db: Session,
    *,
    source: str = "llm",
    remaining_steps: list | None = None,
) -> Optional[dict]:
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
        match, match_error = resolve_vault_document_match(query, db)
        if match_error:
            return match_error
        if not match:
            return {"reply": "I could not find which vault document to rename."}
        doc = match["doc"]
        old_title = doc.title
        doc.title = preserve_file_extension(old_title, new_title)
        db.commit()
        audit_action(db, action=tool_name, risk_level=risk_level, status="completed", target_type="vault_file", target_id=doc.id, summary=f"Renamed {old_title} to {doc.title}", request_text=request_text, payload=payload)
        return {"reply": f"Renamed {old_title} to {doc.title}."}

    if tool_name == "delete_vault_document":
        query = str(arguments.get("query") or "").strip()
        if not query:
            return {"reply": "Tell me the exact vault document to delete."}
        match, match_error = resolve_vault_document_match(query, db)
        if match_error:
            return match_error
        if not match:
            return {"reply": "I could not find the vault document to delete."}
        doc = match["doc"]
        approval = create_pending_approval(
            db,
            action=tool_name,
            target_type="vault_file",
            target_id=doc.id,
            summary=f"Pending delete {doc.title}",
            request_text=request_text,
            details=vault_match_details(match),
            payload={**payload, "document_id": doc.id, "document_title": doc.title},
            remaining_steps=remaining_steps,
        )
        return {
            "reply": f"Confirm delete vault document {doc.title}? Reply `confirm {approval['token']}` to delete.",
            "approval": approval,
        }

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
            payload={"to": to_email, "subject": subject, "body": body, "source": source, "remaining_steps": remaining_steps or []},
            confirmation_token=token,
        )
        details = {"to": to_email, "subject": subject, "body": body}
        return {
            "reply": f"Confirm send email to {to_email} with subject \"{subject}\"? Reply `confirm {token}` to send.",
            "approval": approval_payload(tool_name, token, details, remaining_steps),
        }

    if tool_name == "send_vault_document_email":
        to_email = str(arguments.get("to") or "").strip()
        query = str(arguments.get("query") or "").strip()
        if not EMAIL_RE.fullmatch(to_email) or not query:
            return {"reply": "Tell me which vault document to send and the recipient email."}
        match, match_error = resolve_vault_document_match(query, db)
        if match_error:
            return match_error
        if not match:
            return {"reply": f"I could not find the vault document to send to {to_email}."}
        doc = match["doc"]
        details = {"to": to_email, **vault_match_details(match)}
        approval = create_pending_approval(
            db,
            action=tool_name,
            target_type="vault_file",
            target_id=doc.id,
            summary=f"Pending send {doc.title} to {to_email}",
            request_text=request_text,
            details=details,
            payload={**payload, "to": to_email, "document_id": doc.id, "document_title": doc.title},
            remaining_steps=remaining_steps,
        )
        return {
            "reply": f"Confirm send vault document {doc.title} to {to_email}? Reply `confirm {approval['token']}` to send.",
            "approval": approval,
        }

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
    limited_steps = steps[:5]
    for index, step in enumerate(limited_steps):
        if not isinstance(step, dict):
            continue
        tool_name = step.get("tool")
        result = execute_assistant_tool(
            tool_name,
            step.get("arguments", {}),
            request_text,
            db,
            source="llm_plan",
            remaining_steps=limited_steps[index + 1 :],
        )
        if not result:
            continue
        reply = result.get("reply", "")
        if reply:
            replies.append(reply)
        approval = result.get("approval")
        if assistant_reply_requires_confirmation(reply):
            response = {"reply": "\n".join(replies)}
            if approval:
                response["approval"] = approval
            return response
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


@app.get("/api/email/audit")
def read_email_audit(limit: int = 50, db: Session = Depends(get_db)):
    rows = (
        db.query(models.AssistantAudit)
        .filter(models.AssistantAudit.action.in_(["send_email", "send_vault_document_email", "resend_email"]))
        .order_by(models.AssistantAudit.created_at.desc())
        .limit(min(max(limit, 1), 200))
        .all()
    )
    return [email_audit_to_dict(row) for row in rows]


@app.post("/api/email/audit/{audit_id}/resend")
def resend_email_from_audit(audit_id: int, db: Session = Depends(get_db)):
    row = db.query(models.AssistantAudit).filter(models.AssistantAudit.id == audit_id).first()
    if not row or row.action not in {"send_email", "send_vault_document_email", "resend_email"}:
        raise HTTPException(status_code=404, detail="Email audit entry not found")
    payload = parse_json_object(row.payload or "{}") or {}

    if row.action == "send_vault_document_email":
        doc = db.query(models.Item).filter(models.Item.id == payload.get("document_id"), models.Item.type == "vault_file").first()
        if not doc:
            raise HTTPException(status_code=404, detail="Vault document no longer exists")
        ok, detail = send_document_email(str(payload.get("to") or ""), doc)
        resend_payload = {**payload, "delivery_detail": detail, "source_audit_id": audit_id}
        summary = f"Resent {doc.title} to {payload.get('to', 'recipient')}" if ok else f"Resend failed: {detail}"
        target_type = "vault_file"
        target_id = doc.id
    else:
        ok, detail = send_generic_email(str(payload.get("to") or ""), str(payload.get("subject") or ""), str(payload.get("body") or ""))
        resend_payload = {**payload, "delivery_detail": detail, "source_audit_id": audit_id}
        summary = f"Resent email to {payload.get('to', 'recipient')}" if ok else f"Resend failed: {detail}"
        target_type = "email"
        target_id = None

    audit_action(
        db,
        action="resend_email",
        risk_level=3,
        status="completed" if ok else "failed",
        target_type=target_type,
        target_id=target_id,
        summary=summary,
        request_text=f"resend audit {audit_id}",
        payload=resend_payload,
    )
    if not ok:
        raise HTTPException(status_code=502, detail=detail)
    return {"ok": True, "detail": detail}


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
    filename = upload_filename_from_url(image_url)
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


def selected_vault_documents(ids: list[int], db: Session) -> list[models.Item]:
    clean_ids = []
    for item_id in ids or []:
        if isinstance(item_id, int) and item_id not in clean_ids:
            clean_ids.append(item_id)
    if not clean_ids:
        return []
    rows = db.query(models.Item).filter(models.Item.type == "vault_file", models.Item.id.in_(clean_ids)).all()
    by_id = {row.id: row for row in rows}
    return [by_id[item_id] for item_id in clean_ids if item_id in by_id]


def vault_export_row(item: models.Item) -> dict:
    body = parse_item_body(item)
    return {
        "id": item.id,
        "title": item.title,
        "category": body.get("category") or (item.subtitle or "").split("•", 1)[0].strip() or "Document",
        "owner": body.get("owner") or item.tags or "",
        "expiry_date": body.get("expiry_date") or item.expiry_date or "",
        "summary": body.get("summary") or "",
        "scan_status": body.get("scan_status") or "",
        "workspace": item.workspace,
    }


def ensure_share_token(item: models.Item, db: Session) -> str:
    if not item.share_token or (item.share_expires_at and item.share_expires_at < datetime.utcnow()):
        item.share_token = secrets.token_urlsafe(32)
        item.share_expires_at = datetime.utcnow() + timedelta(hours=24)
        db.commit()
        db.refresh(item)
    return item.share_token


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


@app.post("/api/vault/bulk/export")
def bulk_export_vault_documents(payload: VaultBulkRequest, db: Session = Depends(get_db)):
    docs = selected_vault_documents(payload.ids, db)
    rows = [vault_export_row(doc) for doc in docs]
    audit_action(
        db,
        action="bulk_export_vault_documents",
        risk_level=1,
        status="completed",
        target_type="vault_file",
        summary=f"Exported metadata for {len(rows)} vault documents",
        request_text="POST /api/vault/bulk/export",
        payload={"ids": [doc.id for doc in docs], "count": len(rows)},
    )
    return {"documents": rows, "count": len(rows)}


@app.post("/api/vault/bulk/delete")
def bulk_delete_vault_documents(payload: VaultBulkDeleteRequest, db: Session = Depends(get_db)):
    if not VAULT_DELETE_PHRASE:
        raise HTTPException(status_code=500, detail="Vault delete phrase is not configured")
    if not secrets.compare_digest((payload.phrase or "").strip(), VAULT_DELETE_PHRASE):
        raise HTTPException(status_code=403, detail="Security phrase is required")
    docs = selected_vault_documents(payload.ids, db)
    deleted = []
    for doc in docs:
        deleted.append({"id": doc.id, "title": doc.title})
        delete_vault_document(doc, db)
    audit_action(
        db,
        action="bulk_delete_vault_documents",
        risk_level=3,
        status="completed",
        target_type="vault_file",
        summary=f"Deleted {len(deleted)} vault documents",
        request_text="POST /api/vault/bulk/delete",
        payload={"deleted": deleted},
    )
    return {"ok": True, "deleted_count": len(deleted), "deleted": deleted}


@app.post("/api/vault/bulk/email")
def bulk_email_vault_documents(payload: VaultBulkEmailRequest, db: Session = Depends(get_db)):
    if not EMAIL_RE.fullmatch(payload.to or ""):
        raise HTTPException(status_code=400, detail="Valid recipient email is required")
    docs = selected_vault_documents(payload.ids, db)
    results = []
    for doc in docs:
        ensure_share_token(doc, db)
        ok, detail = send_document_email(payload.to, doc)
        results.append({"id": doc.id, "title": doc.title, "ok": ok, "detail": detail, "share_token": doc.share_token})
    sent_count = sum(1 for row in results if row["ok"])
    audit_action(
        db,
        action="bulk_email_vault_documents",
        risk_level=3,
        status="completed" if sent_count == len(results) else "failed",
        target_type="vault_file",
        summary=f"Sent {sent_count}/{len(results)} vault documents to {payload.to}",
        request_text="POST /api/vault/bulk/email",
        payload={"to": payload.to, "results": results},
    )
    return {"ok": sent_count == len(results), "sent_count": sent_count, "results": results}


@app.post("/api/vault/bulk/ocr")
async def bulk_ocr_vault_documents(payload: VaultBulkRequest, db: Session = Depends(get_db)):
    docs = selected_vault_documents(payload.ids, db)
    results = []
    for doc in docs:
        try:
            result = await retry_vault_document_ocr(doc, db, request_text="bulk OCR selected vault documents")
            db.refresh(doc)
            results.append({"id": doc.id, "title": doc.title, "ok": True, "reply": result.get("reply", "")})
        except Exception as exc:
            db.rollback()
            results.append({"id": doc.id, "title": doc.title, "ok": False, "reply": str(exc)})
    processed_count = sum(1 for row in results if row["ok"])
    audit_action(
        db,
        action="bulk_ocr_vault_documents",
        risk_level=2,
        status="completed" if processed_count == len(results) else "failed",
        target_type="vault_file",
        summary=f"OCR processed {processed_count}/{len(results)} vault documents",
        request_text="POST /api/vault/bulk/ocr",
        payload={"ids": [doc.id for doc in docs], "results": results},
    )
    return {"ok": processed_count == len(results), "processed_count": processed_count, "results": results}


@app.patch("/api/vault/{item_id}/metadata", response_model=schemas.Item)
def update_vault_metadata(item_id: int, payload: VaultMetadataUpdate, db: Session = Depends(get_db)):
    item = db.query(models.Item).filter(models.Item.id == item_id, models.Item.type == "vault_file").first()
    if not item:
        raise HTTPException(status_code=404, detail="Vault document not found")

    display_title = preserve_file_extension(item.title, payload.title or item.title)
    category = (payload.category or "Document").strip()
    owner = (payload.owner or "").strip()
    expiry = normalize_expiry_date(payload.expiry_date or "None")
    summary = (payload.summary or "").strip()
    full_text = (payload.full_text or "").strip()
    index_text, body = reviewed_vault_payload(
        original_filename=item.title,
        display_title=display_title,
        category=category,
        owner=owner,
        expiry_date=expiry,
        summary=summary,
        full_text=full_text,
    )

    old_title = item.title
    item.title = display_title
    item.subtitle = vault_subtitle(category, owner, "Reviewed")
    item.body = body
    item.tags = owner or item.tags
    item.expiry_date = None if expiry.lower() == "none" else expiry
    db.commit()
    db.refresh(item)
    audit_action(
        db,
        action="review_vault_metadata",
        risk_level=2,
        status="completed",
        target_type="vault_file",
        target_id=item.id,
        summary=f"Reviewed vault metadata for {item.title}",
        request_text=f"PATCH /api/vault/{item_id}/metadata",
        payload={"old_title": old_title, "new_title": item.title, "category": category, "owner": owner, "expiry_date": expiry, "index_text": index_text},
    )
    return item


def send_document_email(to_email: str, item: models.Item) -> tuple[bool, str]:
    MABDC_MAIL_API_KEY = os.getenv("MABDC_MAIL_API_KEY")
    if not MABDC_MAIL_API_KEY:
        return False, "Mail API key is not configured on the backend."
    if not item.image_url:
        return False, "That document does not have a file link yet."

    safe_title = html.escape(item.title or "Vault document")
    document_url = f"{PUBLIC_BASE_URL}/shared/{item.share_token}" if item.share_token else item.image_url
    safe_url = html.escape(document_url)
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


def cancellation_token_from_message(message: str) -> str:
    match = re.search(r"\bcancel\s+([A-Za-z0-9_-]{6,})\b", message or "", re.IGNORECASE)
    return match.group(1) if match else ""


def is_confirmation_message(message: str) -> bool:
    return bool(confirmation_token_from_message(message) or cancellation_token_from_message(message))


def approval_payload(action: str, token: str, details: dict, remaining_steps: list | None = None) -> dict:
    safe_details = {key: value for key, value in (details or {}).items() if key != "security_phrase"}
    return {
        "action": action,
        "token": token,
        "risk_level": ASSISTANT_TOOL_RISK.get(action, 0),
        "details": safe_details,
        "remaining_steps": remaining_steps or [],
        "confirm_command": f"confirm {token}",
        "cancel_command": f"cancel {token}",
    }


def create_pending_approval(
    db: Session,
    *,
    action: str,
    target_type: str,
    summary: str,
    request_text: str,
    details: dict,
    payload: dict,
    remaining_steps: list | None = None,
    target_id: int | None = None,
) -> dict:
    token = secrets.token_urlsafe(6)
    full_payload = {**payload, "remaining_steps": remaining_steps or []}
    audit_action(
        db,
        action=action,
        risk_level=ASSISTANT_TOOL_RISK.get(action, 3),
        status="pending",
        target_type=target_type,
        target_id=target_id,
        summary=summary,
        request_text=request_text,
        payload=full_payload,
        confirmation_token=token,
    )
    return approval_payload(action, token, details, remaining_steps)


def looks_like_compound_action_request(message: str) -> bool:
    text = normalize_search_text(message)
    if not text:
        return False
    has_sequence = any(marker in text for marker in [" first ", " then ", " after ", " and ", " comma "])
    action_count = sum(
        1
        for word in ["create", "add", "task", "remind", "reminder", "note", "expense", "rename", "delete", "send", "email", "mark"]
        if re.search(rf"\b{word}\b", text)
    )
    return has_sequence and action_count >= 2


def handle_generic_email_request(message: str, history: list, db: Session) -> Optional[dict]:
    cancel_token = cancellation_token_from_message(message)
    if cancel_token:
        pending = (
            db.query(models.AssistantAudit)
            .filter(
                models.AssistantAudit.status == "pending",
                models.AssistantAudit.confirmation_token == cancel_token,
            )
            .first()
        )
        if not pending:
            return {"reply": "I could not find a pending action for that cancellation token."}
        payload = json.loads(pending.payload or "{}")
        pending.status = "canceled"
        if pending.action == "delete_vault_document":
            pending.summary = f"Canceled vault delete for {payload.get('document_title', 'document')}"
            reply = f"Canceled pending vault delete for {payload.get('document_title', 'document')}."
        elif pending.action == "send_vault_document_email":
            pending.summary = f"Canceled vault document email to {payload.get('to', 'recipient')}"
            reply = f"Canceled pending vault document email to {payload.get('to', 'recipient')}."
        else:
            pending.summary = f"Canceled email to {payload.get('to', 'recipient')}"
            reply = f"Canceled pending email to {payload.get('to', 'recipient')}."
        db.commit()
        return {"reply": reply}

    token = confirmation_token_from_message(message)
    if token:
        pending = (
            db.query(models.AssistantAudit)
            .filter(
                models.AssistantAudit.status == "pending",
                models.AssistantAudit.confirmation_token == token,
            )
            .first()
        )
        if not pending:
            return {"reply": "I could not find a pending email for that confirmation token."}
        payload = json.loads(pending.payload or "{}")
        if pending.action == "delete_vault_document":
            doc = db.query(models.Item).filter(models.Item.id == payload.get("document_id"), models.Item.type == "vault_file").first()
            if not doc:
                pending.status = "failed"
                pending.summary = "Vault document no longer exists"
                db.commit()
                return {"reply": "I could not delete it because the vault document no longer exists."}
            doc_title = doc.title
            doc_id = doc.id
            delete_vault_document(doc, db)
            pending.status = "completed"
            pending.summary = f"Deleted {doc_title}"
            db.commit()
            replies = [f"Deleted {doc_title} from the vault."]
            remaining_steps = payload.get("remaining_steps") if isinstance(payload.get("remaining_steps"), list) else []
            if remaining_steps:
                resumed = execute_assistant_plan({"steps": remaining_steps}, pending.request_text or message, db)
                if resumed and resumed.get("reply"):
                    replies.append(resumed["reply"])
            return {"reply": "\n".join(replies)}

        if pending.action == "send_vault_document_email":
            doc = db.query(models.Item).filter(models.Item.id == payload.get("document_id"), models.Item.type == "vault_file").first()
            if not doc:
                pending.status = "failed"
                pending.summary = "Vault document no longer exists"
                db.commit()
                return {"reply": "I could not send it because the vault document no longer exists."}
            ok, detail = send_document_email(payload["to"], doc)
            payload["delivery_detail"] = detail
            pending.payload = json.dumps(payload, ensure_ascii=False)
            if ok:
                pending.status = "completed"
                pending.summary = f"Sent {doc.title} to {payload['to']}"
                db.commit()
                replies = [f"Sent {doc.title} to {payload['to']}."]
                remaining_steps = payload.get("remaining_steps") if isinstance(payload.get("remaining_steps"), list) else []
                if remaining_steps:
                    resumed = execute_assistant_plan({"steps": remaining_steps}, pending.request_text or message, db)
                    if resumed and resumed.get("reply"):
                        replies.append(resumed["reply"])
                return {"reply": "\n".join(replies)}
            pending.status = "failed"
            pending.summary = f"Vault document email failed: {detail}"
            db.commit()
            return {"reply": f"I could not send the vault document: {detail}"}

        ok, detail = send_generic_email(payload["to"], payload["subject"], payload["body"])
        payload["delivery_detail"] = detail
        pending.payload = json.dumps(payload, ensure_ascii=False)
        if ok:
            pending.status = "completed"
            pending.summary = f"Sent email to {payload['to']}"
            db.commit()
            replies = [f"Sent email to {payload['to']}."]
            remaining_steps = payload.get("remaining_steps") if isinstance(payload.get("remaining_steps"), list) else []
            if remaining_steps:
                resumed = execute_assistant_plan({"steps": remaining_steps}, pending.request_text or message, db)
                if resumed and resumed.get("reply"):
                    replies.append(resumed["reply"])
            return {"reply": "\n".join(replies)}
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
        ),
        "approval": approval_payload("send_email", token, parsed),
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
    match, match_error = resolve_vault_document_match(" ".join(search_parts), db)
    if match_error:
        return match_error
    if not match:
        return {"reply": f"I could not find the vault document to send to {to_email}. Try: send GEMA to {to_email}"}
    doc = match["doc"]
    details = {"to": to_email, **vault_match_details(match)}

    approval = create_pending_approval(
        db,
        action="send_vault_document_email",
        target_type="vault_file",
        target_id=doc.id,
        summary=f"Pending send {doc.title} to {to_email}",
        request_text=message,
        details=details,
        payload={"to": to_email, "document_id": doc.id, "document_title": doc.title},
    )
    return {
        "reply": f"Confirm send vault document {doc.title} to {to_email}? Reply `confirm {approval['token']}` to send.",
        "approval": approval,
    }


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

    match, match_error = resolve_vault_document_match(" ".join(search_parts), db)
    if match_error:
        return match_error
    if not match:
        return {"reply": "I could not find which vault document to rename. Try: rename LABOUR CONTRACT to Dennis Labour contract"}
    doc = match["doc"]

    old_title = doc.title
    doc.title = preserve_file_extension(old_title, new_title)
    db.commit()
    audit_action(db, action="rename_vault_document", risk_level=2, status="completed", target_type="vault_file", target_id=doc.id, summary=f"Renamed {old_title} to {doc.title}", request_text=message)
    return {"reply": f"Renamed {old_title} to {doc.title}."}


def recent_vault_document_title(history: list) -> str:
    filename_re = re.compile(r'["“]([^"”]+?\.(?:pdf|png|jpe?g|docx?))["”]', re.IGNORECASE)
    loose_re = re.compile(r"\b([\w .,_-]+?\.(?:pdf|png|jpe?g|docx?))\b", re.IGNORECASE)
    for h in reversed(history[-8:]):
        if not isinstance(h, dict):
            continue
        content = h.get("content", "")
        if not content:
            continue
        match = filename_re.search(content) or loose_re.search(content)
        if match:
            return match.group(1).strip(" .")
    return ""


def find_vault_document_for_ocr(message: str, history: list, db: Session) -> tuple[Optional[models.Item], Optional[dict]]:
    title = recent_vault_document_title(history)
    search_text = OCR_WORD_RE.sub(" ", message or "").strip()
    if title and not search_text:
        doc = find_vault_document_by_title(title, db)
        if doc:
            return doc, None
        doc, match_error = find_vault_document_by_normalized_title(title, db)
        if doc or match_error:
            return doc, match_error
        return None, None
    elif title:
        doc = find_vault_document_by_title(title, db)
        if doc:
            return doc, None
        doc, match_error = find_vault_document_by_normalized_title(title, db)
        if doc or match_error:
            return doc, match_error

    if not search_text:
        for h in reversed(history[-8:]):
            if isinstance(h, dict) and h.get("content"):
                search_text = f"{search_text} {h['content']}".strip()

    match, match_error = resolve_vault_document_match(search_text, db)
    if match_error:
        return None, match_error
    return (match["doc"], None) if match else (None, None)


def vault_file_mime_type(path: str) -> str:
    lower = path.lower()
    if lower.endswith(".pdf"):
        return "application/pdf"
    if lower.endswith((".jpg", ".jpeg")):
        return "image/jpeg"
    if lower.endswith(".png"):
        return "image/png"
    return "application/octet-stream"


async def retry_vault_document_ocr(doc: models.Item, db: Session, request_text: str = "") -> dict:
    upload_path = local_upload_path(doc.image_url)
    if not upload_path or not os.path.exists(upload_path):
        return {"reply": f"I found {doc.title}, but the stored file is missing. Please upload it again."}

    with open(upload_path, "rb") as uploaded:
        contents = uploaded.read()

    mime_type = vault_file_mime_type(upload_path)
    pdf_text = ""
    vision_images: list[str] = []
    vision_mime_type = mime_type
    if mime_type == "application/pdf":
        pdf_text = extract_pdf_text(contents)
        vision_images = render_pdf_pages_for_vision(contents)
        vision_mime_type = "image/jpeg"
    elif mime_type.startswith("image/"):
        vision_images = [base64.b64encode(contents).decode("utf-8")]

    prompt = vault_index_prompt(doc.title, pdf_text)
    ocr_text, scan_attempts, scan_error = await request_vault_vision_extraction(prompt, vision_images, vision_mime_type)
    extracted = build_vault_scan_result(
        ocr_text=ocr_text,
        filename=doc.title,
        pdf_text=pdf_text,
        vision_attempts=scan_attempts,
        vision_error=scan_error,
    )

    old_title = doc.title
    display_title = preserve_file_extension(old_title, extracted["document_title"] or old_title)
    category = extracted["category"] or "Document"
    owner = extracted.get("owner", "")
    summary = extracted["summary"]
    index_text = build_vault_index_text(old_title, display_title, category, summary, extracted, pdf_text)
    doc.title = display_title
    doc.subtitle = vault_subtitle(category, owner, f"OCR {extracted['scan_status']}")
    doc.body = vault_body_payload(index_text, extracted, summary)
    doc.tags = owner or doc.tags
    expiry = extracted["expiry_date"] or "None"
    if expiry.lower() != "none" and len(expiry) > 4:
        doc.expiry_date = expiry
    db.commit()
    audit_action(
        db,
        action="retry_vault_ocr",
        risk_level=2,
        status=extracted["scan_status"],
        target_type="vault_file",
        target_id=doc.id,
        summary=f"OCR {extracted['scan_status']} for {doc.title}",
        request_text=request_text,
        payload={"old_title": old_title, "new_title": doc.title, "scan_attempts": scan_attempts, "scan_error": scan_error},
    )
    return {"reply": f"OCR updated {doc.title}. Status: {extracted['scan_status']} after {scan_attempts} attempt(s)."}


async def handle_document_ocr_request(message: str, history: list, db: Session) -> Optional[dict]:
    if not OCR_WORD_RE.search(message or ""):
        return None
    doc, match_error = find_vault_document_for_ocr(message, history, db)
    if match_error:
        return match_error
    if not doc:
        return {"reply": "Tell me which vault document to OCR, for example: OCR Dennis-Passport.pdf"}
    return await retry_vault_document_ocr(doc, db, request_text=message)


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
    if confirmed_title:
        doc = find_vault_document_by_title(confirmed_title, db)
        match = {"doc": doc, "confidence": 1.0, "matched_tokens": ["confirmed"], "score": 1} if doc else None
        match_error = None
    else:
        match, match_error = resolve_vault_document_match(search_text, db)
        doc = match["doc"] if match else None
    if match_error:
        return match_error
    if not doc:
        return {"reply": "I could not find the vault document to delete. Tell me the document name, then I will ask for the security phrase."}

    if current_delete_request:
        approval = create_pending_approval(
            db,
            action="delete_vault_document",
            target_type="vault_file",
            target_id=doc.id,
            summary=f"Pending delete {doc.title}",
            request_text=message,
            details=vault_match_details(match),
            payload={"document_id": doc.id, "document_title": doc.title},
        )
        return {
            "reply": f"Confirm delete vault document {doc.title}? Reply `confirm {approval['token']}` to delete.",
            "approval": approval,
        }

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
        "owner": "",
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
            "owner": str(data.get("owner") or data.get("person") or data.get("employee_name") or fallback["owner"]).strip(),
            "expiry_date": normalize_expiry_date(str(data.get("expiry_date") or fallback["expiry_date"]).strip()),
            "summary": str(data.get("summary") or fallback["summary"]).strip(),
            "full_text": str(data.get("full_text") or fallback["full_text"]).strip(),
        }
    except Exception:
        parts = (raw_text or "").split("|", 2)
        if len(parts) >= 2:
            fallback["category"] = parts[0].strip() or fallback["category"]
            fallback["expiry_date"] = normalize_expiry_date(parts[1].strip() or fallback["expiry_date"])
            fallback["full_text"] = parts[2].strip() if len(parts) > 2 else fallback["full_text"]
        return fallback


def build_vault_scan_result(
    *,
    ocr_text: str,
    filename: str,
    pdf_text: str = "",
    vision_attempts: int = 0,
    vision_error: str = "",
) -> dict:
    extracted = parse_vault_extraction(ocr_text, filename, pdf_text)
    has_vision_text = bool((ocr_text or "").strip())
    if not has_vision_text:
        extracted["document_title"] = os.path.splitext(filename)[0] or "Document"
        extracted["category"] = extracted.get("category") or "Document"
        extracted["owner"] = extracted.get("owner") or ""
        extracted["summary"] = extracted.get("summary") or "Vision scan unavailable; indexed fallback text."
        extracted["full_text"] = extracted.get("full_text") or pdf_text or filename
    extracted["scan_status"] = "success" if has_vision_text else "fallback"
    extracted["scan_attempts"] = vision_attempts
    extracted["scan_error"] = "" if has_vision_text else (vision_error or "Vision scan produced no readable result")
    return extracted


async def request_vault_vision_extraction(prompt: str, vision_images: list[str], mime_type: str, *, max_attempts: int = 2) -> tuple[str, int, str]:
    if not vision_images or not OPENROUTER_API_KEY:
        return "", 0, "Vision unavailable"
    last_error = ""
    for attempt in range(1, max_attempts + 1):
        try:
            content = [{"type": "text", "text": prompt}]
            for image_b64 in vision_images:
                content.append({"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{image_b64}"}})
            
            text = await call_llm_async(model="openai/gpt-4o", messages=[{"role": "user", "content": content}])
            if text and text.strip():
                return text, attempt, ""
            last_error = "Vision returned empty content"
        except Exception as exc:
            last_error = str(exc)
            logger.exception("AI exception while processing vault upload attempt %s: %s", attempt, exc)
    return "", max_attempts, last_error


def vault_index_prompt(filename: str, pdf_text: str = "") -> str:
    return f"""
You are indexing an employee/document vault file.
Filename: {filename}
Embedded PDF text, if present:
{pdf_text[:12000]}

Read the visible pages and embedded text. Identify the document accurately, especially labour contracts, insurance certificates, IDs, visas, passports, NOCs, and employment documents.
Return ONLY valid JSON with these keys:
{{"document_title":"specific human title","category":"document category","owner":"person or employee name, or empty string","expiry_date":"YYYY-MM-DD or None","summary":"one sentence summary","full_text":"best readable text for search"}}
If an expiry date is not explicitly present, use "None". Do not guess dates.
"""


def build_vault_index_text(filename: str, display_title: str, category: str, summary: str, extracted: dict, pdf_text: str = "") -> str:
    return "\n\n".join(
        part for part in [
            f"Filename: {display_title}",
            f"Original filename: {filename}",
            f"Title: {display_title}",
            f"Category: {category}",
            f"Owner: {extracted.get('owner', '')}" if extracted.get("owner") else "",
            f"Summary: {summary}" if summary else "",
            f"Scan status: {extracted['scan_status']}",
            f"Scan attempts: {extracted['scan_attempts']}",
            f"Scan error: {extracted['scan_error']}" if extracted["scan_error"] else "",
            extracted["full_text"],
            pdf_text,
        ]
        if part
    )


def vault_body_payload(index_text: str, extracted: dict, summary: str) -> str:
    return dump_item_body({
        "index_text": index_text,
        "scan_status": extracted["scan_status"],
        "scan_attempts": extracted["scan_attempts"],
        "scan_error": extracted["scan_error"],
        "summary": summary,
        "full_text": extracted["full_text"],
        "category": extracted.get("category", ""),
        "owner": extracted.get("owner", ""),
        "expiry_date": extracted.get("expiry_date", "None"),
    })


def vault_subtitle(category: str, owner: str = "", status: str = "Processed today") -> str:
    parts = [category or "Document"]
    if owner:
        parts.append(owner)
    parts.append(status)
    return " • ".join(parts)


def reviewed_vault_payload(
    *,
    original_filename: str,
    display_title: str,
    category: str,
    owner: str,
    expiry_date: str,
    summary: str,
    full_text: str,
) -> tuple[str, str]:
    extracted = {
        "document_title": display_title,
        "category": category or "Document",
        "owner": owner or "",
        "expiry_date": normalize_expiry_date(expiry_date or "None"),
        "summary": summary or "",
        "full_text": full_text or "",
        "scan_status": "reviewed",
        "scan_attempts": 0,
        "scan_error": "",
    }
    index_text = build_vault_index_text(original_filename, display_title, extracted["category"], extracted["summary"], extracted)
    return index_text, vault_body_payload(index_text, extracted, extracted["summary"])


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

    if is_confirmation_message(message):
        email_intent = handle_generic_email_request(message, history, db)
        if email_intent:
            return email_intent

    use_planner_first = bool(OPENROUTER_API_KEY or "plan_assistant_tool_with_llm" in globals()) and looks_like_compound_action_request(message)
    if use_planner_first:
        planned_tool = await plan_assistant_tool_with_llm(message, history)
        if planned_tool:
            tool_intent = execute_assistant_plan(planned_tool, message, db)
            if tool_intent:
                return tool_intent

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

    ocr_intent = await handle_document_ocr_request(message, history, db)
    if ocr_intent:
        return ocr_intent

    mail_intent = handle_document_email_request(message, history, db)
    if mail_intent:
        return mail_intent

    planned_tool = None if use_planner_first else await plan_assistant_tool_with_llm(message, history)
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


def send_reminder_email(to_email: str, title: str, date_value: str, time_value: str = ""):
    MABDC_MAIL_API_KEY = os.getenv("MABDC_MAIL_API_KEY")
    when = f"{date_value} {time_value}".strip()
    if not MABDC_MAIL_API_KEY:
        logger.info("[MOCK REMINDER] To %s: %s due %s", to_email, title, when)
        return

    safe_title = html.escape(title)
    safe_when = html.escape(when or "now")
    try:
        resp = httpx.post(
            "https://api-mail.mabdc.com/v1/emails",
            headers={"Authorization": f"Bearer {MABDC_MAIL_API_KEY}", "Content-Type": "application/json"},
            json={
                "to": to_email,
                "from": "vault-ai@mabdc.org",
                "subject": f"Reminder: {title}",
                "html": f"""
                <div style="font-family: sans-serif; color: #333;">
                    <h2>Command Brain Reminder</h2>
                    <p><strong>{safe_title}</strong></p>
                    <p>Scheduled for {safe_when}.</p>
                </div>
                """,
            },
            timeout=15,
        )
        if resp.status_code not in [200, 202]:
            logger.warning("Reminder email API failed: %s %s", resp.status_code, resp.text)
    except Exception as exc:
        logger.exception("Failed to send reminder email: %s", exc)


def reminder_is_due(meta: dict, now: datetime) -> bool:
    date_value = meta.get("date") or ""
    time_value = meta.get("time") or ""
    if not date_value:
        return False
    try:
        due_date = datetime.strptime(date_value, "%Y-%m-%d").date()
    except ValueError:
        return False
    today = now.date()
    if due_date < today:
        return True
    if due_date > today:
        return False
    if not time_value:
        return True
    try:
        due_time = datetime.strptime(time_value, "%H:%M").time()
    except ValueError:
        return True
    return now.time() >= due_time


def check_due_reminders_and_notify(db: Session | None = None):
    owns_db = db is None
    db = db or SessionLocal()
    try:
        now = datetime.now()
        today = now.date().isoformat()
        reminders = db.query(models.Item).filter(models.Item.type == "reminder").all()
        for reminder in reminders:
            meta = parse_item_body(reminder)
            if meta.get("status") == "done":
                continue
            if meta.get("last_notified_date") == today:
                continue
            if not reminder_is_due(meta, now):
                continue
            send_reminder_email("sottodennis@gmail.com", reminder.title, meta.get("date", ""), meta.get("time", ""))
            meta["last_notified_date"] = today
            reminder.body = dump_item_body(meta)
        db.commit()
    finally:
        if owns_db:
            db.close()


def perform_daily_backup(now: datetime | None = None) -> dict:
    timestamp = (now or datetime.now()).strftime("%Y%m%d-%H%M%S")
    os.makedirs(BACKUP_DIR, exist_ok=True)

    db_path = engine.url.database
    if not db_path:
        raise RuntimeError("Database path is not available for backup")
    database_backup = os.path.join(BACKUP_DIR, f"app-{timestamp}.db")
    shutil.copy2(db_path, database_backup)

    uploads_backup = os.path.join(BACKUP_DIR, f"uploads-{timestamp}.tar.gz")
    with tarfile.open(uploads_backup, "w:gz") as archive:
        if os.path.isdir("uploads"):
            archive.add("uploads", arcname="uploads")

    logger.info("Daily backup created: %s and %s", database_backup, uploads_backup)
    return {"database_backup": database_backup, "uploads_backup": uploads_backup}


def run_scheduled_backup():
    try:
        perform_daily_backup()
    except Exception as exc:
        logger.exception("Daily backup failed: %s", exc)


@celery_app.task
def check_expirations_and_notify_task():
    check_expirations_and_notify()

@celery_app.task
def check_due_reminders_task():
    check_due_reminders_and_notify()

@celery_app.task
def run_scheduled_backup_task():
    run_scheduled_backup()

@app.post("/api/vault_upload")
async def vault_upload(file: UploadFile = File(...), workspace: str = Form("Company"), db: Session = Depends(get_db)):
    logger.info("Vault upload triggered for %s (%s)", file.filename, file.content_type)

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

    prompt = vault_index_prompt(file.filename, pdf_text)

    ocr_text, scan_attempts, scan_error = await request_vault_vision_extraction(prompt, vision_images, mime_type)
    extracted = build_vault_scan_result(
        ocr_text=ocr_text,
        filename=file.filename,
        pdf_text=pdf_text,
        vision_attempts=scan_attempts,
        vision_error=scan_error,
    )
    display_title = preserve_file_extension(file.filename, extracted["document_title"] or file.filename)
    category = extracted["category"] or "Document"
    owner = extracted.get("owner", "")
    expiry = extracted["expiry_date"] or "None"
    summary = extracted["summary"]
    index_text = build_vault_index_text(file.filename, display_title, category, summary, extracted, pdf_text)

    vault_item = models.Item(
        type="vault_file",
        title=display_title,
        subtitle=vault_subtitle(category, owner),
        body=vault_body_payload(index_text, extracted, summary),
        image_url=image_url,
        workspace=workspace,
        tags=owner or None,
        embedding=generate_embedding(index_text)
    )
    db.add(vault_item)

    if expiry.lower() != "none" and len(expiry) > 4:
        reminder_item = models.Item(
            type="reminder",
            title=f"Renew: {display_title}",
            subtitle=f"Expires {expiry}",
            workspace=workspace
        )
        db.add(reminder_item)
        send_expiry_email("sottodennis@gmail.com", display_title, expiry)

    db.commit()
    logger.info("Vault upload succeeded for %s", file.filename)
    return {"status": "success", "scan_status": extracted["scan_status"], "scan_attempts": extracted["scan_attempts"]}

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


@app.get('/api/shared/{token}/file')
def get_shared_item_file(token: str, db: Session = Depends(get_db)):
    db_item = db.query(models.Item).filter(models.Item.share_token == token).first()
    if not db_item:
        raise HTTPException(status_code=404, detail='Link invalid or expired')
    if db_item.share_expires_at and db_item.share_expires_at < datetime.utcnow():
        raise HTTPException(status_code=404, detail='Link expired')

    upload_path = local_upload_path(db_item.image_url)
    if not upload_path or not os.path.exists(upload_path):
        raise HTTPException(status_code=404, detail='Shared file not found')
    return FileResponse(upload_path, filename=db_item.title or upload_filename_from_url(db_item.image_url) or "document")
