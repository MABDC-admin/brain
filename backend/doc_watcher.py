import json
import logging
import mimetypes
import os
import time
from pathlib import Path

import models
from database import SessionLocal
from main import (
    dump_item_body,
    process_vault_document_task,
    uploaded_file_url,
)


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("brain-doc-watcher")

UPLOAD_DIR = Path(os.getenv("WATCH_UPLOAD_DIR", "uploads")).resolve()
WORKSPACE = os.getenv("WATCH_WORKSPACE", "Company")
POLL_SECONDS = int(os.getenv("WATCH_POLL_SECONDS", "5"))
STABLE_SECONDS = int(os.getenv("WATCH_STABLE_SECONDS", "8"))
REQUEUE_AFTER_SECONDS = int(os.getenv("WATCH_REQUEUE_AFTER_SECONDS", "1800"))
WATCH_EXISTING = os.getenv("WATCH_EXISTING", "false").lower() in {"1", "true", "yes", "on"}
SUPPORTED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".docx", ".xlsx", ".pptx"}


def parse_body(raw: str | None) -> dict:
    try:
        parsed = json.loads(raw or "{}")
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def file_is_stable(path: Path, seen: dict[str, tuple[int, float]]) -> bool:
    stat = path.stat()
    previous = seen.get(str(path))
    if not previous:
        seen[str(path)] = (stat.st_size, time.time())
        return False
    previous_size, first_seen_at = previous
    if previous_size != stat.st_size:
        seen[str(path)] = (stat.st_size, time.time())
        return False
    return previous_size == stat.st_size and (time.time() - first_seen_at) >= STABLE_SECONDS


def mime_type_for(path: Path) -> str:
    guessed, _encoding = mimetypes.guess_type(path.name)
    return guessed or "application/octet-stream"


def item_for_upload(db, path: Path):
    image_url = uploaded_file_url(path.name)
    return (
        db.query(models.Item)
        .filter(models.Item.type == "vault_file", models.Item.image_url == image_url)
        .first()
    )


def should_enqueue(item: models.Item) -> bool:
    body = parse_body(item.body)
    status = str(body.get("scan_status") or "").lower()
    if status in {"success", "reviewed"}:
        return False
    queued_at = float(body.get("watcher_queued_at") or 0)
    if status == "processing" and queued_at and time.time() - queued_at < REQUEUE_AFTER_SECONDS:
        return False
    return True


def create_item_for_upload(db, path: Path) -> models.Item:
    item = models.Item(
        type="vault_file",
        title=f"Processing {path.name}...",
        subtitle="Queued by document watcher...",
        image_url=uploaded_file_url(path.name),
        workspace=WORKSPACE,
        body=dump_item_body({
            "scan_status": "processing",
            "summary": "Document watcher detected this file and queued AI processing.",
            "watcher_queued_at": time.time(),
        }),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def mark_queued(db, item: models.Item):
    body = parse_body(item.body)
    body["scan_status"] = "processing"
    body["summary"] = body.get("summary") or "Document watcher queued AI processing."
    body["watcher_queued_at"] = time.time()
    item.body = dump_item_body(body)
    item.subtitle = "Queued by document watcher..."
    db.commit()
    db.refresh(item)


def enqueue_path(path: Path):
    db = SessionLocal()
    try:
        item = item_for_upload(db, path)
        if item and not should_enqueue(item):
            return
        if not item:
            item = create_item_for_upload(db, path)
        else:
            mark_queued(db, item)
        process_vault_document_task.delay(
            item.id,
            path.name,
            str(path),
            mime_type_for(path),
            item.workspace or WORKSPACE,
            item.image_url,
        )
        logger.info("Queued OCR for %s as vault item %s", path.name, item.id)
    except Exception:
        logger.exception("Failed to enqueue OCR for %s", path)
    finally:
        db.close()


def watch_forever():
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("Watching %s for %s", UPLOAD_DIR, ", ".join(sorted(SUPPORTED_EXTENSIONS)))
    started_at = time.time()
    seen: dict[str, tuple[int, float]] = {}
    while True:
        for path in sorted(UPLOAD_DIR.iterdir()):
            if not path.is_file() or path.suffix.lower() not in SUPPORTED_EXTENSIONS:
                continue
            if path.name.startswith(".") or path.name.endswith((".tmp", ".part", ".crdownload")):
                continue
            if not WATCH_EXISTING and path.stat().st_mtime < started_at:
                continue
            try:
                if file_is_stable(path, seen):
                    enqueue_path(path)
            except FileNotFoundError:
                continue
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    watch_forever()
