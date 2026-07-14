# Expired Document Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically detect expired OCR documents, notify `sottodennis@gmail.com` with the expired file attached when no newer replacement exists, and soft-archive the expired document so it remains recoverable.

**Architecture:** Keep the workflow inside the existing backend/Celery vault lifecycle. Store archive and notification state in the existing vault item JSON body, move expired documents to the `Archive` workspace, and use the existing email API attachment path.

**Tech Stack:** FastAPI backend, SQLAlchemy items table, Celery OCR task, existing MABDC mail API, pytest.

---

### Task 1: Expiry Helpers And Tests

**Files:**
- Modify: `backend/main.py`
- Create: `backend/test_expired_document_lifecycle.py`

- [ ] **Step 1: Write failing tests**

Add tests for: parsing expired dates, finding newer replacement docs by owner/category, skipping notification when already notified, and soft-archiving with previous workspace retained.

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend && python -m pytest -q -s test_expired_document_lifecycle.py`

Expected: fail because lifecycle helpers do not exist yet.

- [ ] **Step 3: Implement helpers**

Add helpers in `backend/main.py`: `parse_expiry_date_value`, `document_is_expired`, `find_newer_replacement_document`, `archive_expired_document`, and `handle_expired_document_lifecycle`.

- [ ] **Step 4: Run tests to verify pass**

Run: `cd backend && python -m pytest -q -s test_expired_document_lifecycle.py`

Expected: pass.

### Task 2: Expired Attachment Email

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/test_expired_document_lifecycle.py`

- [ ] **Step 1: Write failing tests**

Add tests proving expired notification uses one attachment email, records `expired_notified_at`, and does not send twice for the same document.

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend && python -m pytest -q -s test_expired_document_lifecycle.py`

Expected: fail because expired notification email is not implemented.

- [ ] **Step 3: Implement email function**

Add `expired_document_email_html` and `send_expired_document_email`, using `email_attachment_for_document` for the expired file.

- [ ] **Step 4: Run tests to verify pass**

Run: `cd backend && python -m pytest -q -s test_expired_document_lifecycle.py`

Expected: pass.

### Task 3: Wire Celery And Daily Scan

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/test_expired_document_lifecycle.py`

- [ ] **Step 1: Write failing tests**

Add tests proving OCR lifecycle calls archive/notify only for expired docs and daily expiration checks process missed expired vault documents.

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend && python -m pytest -q -s test_expired_document_lifecycle.py`

Expected: fail until lifecycle is wired into OCR and daily checks.

- [ ] **Step 3: Implement wiring**

Call `handle_expired_document_lifecycle` after OCR updates a vault item and inside `check_expirations_and_notify`. Keep future-expiry reminder behavior.

- [ ] **Step 4: Run verification**

Run:
- `cd backend && python -m py_compile main.py doc_watcher.py test_expired_document_lifecycle.py`
- `cd backend && python -m pytest -q -s test_expired_document_lifecycle.py test_vault_filenames.py test_assistant_bulk_email.py`

Expected: all pass.

### Task 4: Deploy And Verify

**Files:**
- Commit changed backend files and plan.

- [ ] **Step 1: Deploy backend code to VPS**

Copy updated backend files to `/home/admin/app/backend`, restart `brain.service`, `brain-celery-worker.service`, `brain-celery-beat.service`, and keep `brain-doc-watcher.service` active.

- [ ] **Step 2: Run server tests**

Run: `cd /home/admin/app/backend && ./venv/bin/python -m pytest -q -s test_expired_document_lifecycle.py test_vault_filenames.py test_assistant_bulk_email.py`

Expected: all pass.

- [ ] **Step 3: Verify services**

Run: `systemctl is-active brain.service brain-celery-worker.service brain-celery-beat.service brain-doc-watcher.service`

Expected: all active.
