# Login Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add single-user login protection to Command Brain.

**Architecture:** Backend owns authentication using environment credentials and a signed HTTP-only cookie. Frontend gates the private app with a login form and uses the cookie session automatically. Shared links and static files remain public.

**Tech Stack:** FastAPI, itsdangerous-compatible HMAC signing with Python standard library, React, Vite, pytest smoke tests.

---

### Task 1: Backend Session Auth

**Files:**
- Modify: `backend/main.py`
- Test: `tests/backend_smoke.py`

- [ ] Add auth configuration globals: `AUTH_EMAIL`, `AUTH_PASSWORD`, `SESSION_SECRET`, `AUTH_REQUIRED`.
- [ ] Add helpers to sign, verify, set, and clear the `commandbrain_session` cookie.
- [ ] Add `/api/auth/login`, `/api/auth/me`, and `/api/auth/logout`.
- [ ] Add HTTP middleware that rejects private API requests with `401` when auth is enabled and the cookie is missing or invalid.
- [ ] Keep `/api/shared`, `/static`, and auth endpoints public.
- [ ] Add tests proving unauthenticated `/items` returns `401`, login succeeds with configured credentials, bad login fails, and authenticated `/items` succeeds.

### Task 2: Frontend Login Gate

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/pages/SettingsPage.jsx`

- [ ] Add `LoginScreen` UI in `App.jsx`.
- [ ] On app load, call `/api/auth/me`; show login screen until authenticated.
- [ ] On login submit, call `/api/auth/login` with email/password and continue into the app on success.
- [ ] Preserve `/shared/{token}` behavior without login.
- [ ] Add a logout button in Settings that calls `/api/auth/logout` and reloads the app.

### Task 3: Verify And Deploy

**Files:**
- Modify: live `/home/admin/app/backend/.env`
- Deploy: backend and frontend build

- [ ] Run `scripts/verify-before-deploy.sh`.
- [ ] Set live `AUTH_EMAIL=sottodennis@gmail.com`, `AUTH_PASSWORD`, and `SESSION_SECRET`.
- [ ] Deploy backend and frontend.
- [ ] Verify `/api/auth/me` reports unauthenticated before login and protected APIs reject unauthenticated requests.
