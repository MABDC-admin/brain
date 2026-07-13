# Login Auth Design

## Goal
Add real login protection to Command Brain so private app data and command APIs require a server-authenticated session.

## Design
Use a single-user email/password login configured through backend environment variables. The password must not be committed to source code. The backend issues a signed, HTTP-only, secure cookie after successful login. The frontend shows a login screen before the private app and checks `/api/auth/me` on refresh.

## Public Routes
The following routes remain public:
- `/api/auth/login`
- `/api/auth/me`
- `/api/auth/logout`
- `/api/shared/{token}`
- `/static/...`
- Browser preflight `OPTIONS` requests

All other app APIs require the session cookie when auth is configured.

## Frontend
Add an auth gate in `frontend/src/App.jsx` with email/password fields and a logout control in settings. Existing app data stays unchanged after login.

## Deployment
Set `AUTH_EMAIL`, `AUTH_PASSWORD`, and `SESSION_SECRET` in `/home/admin/app/backend/.env` on the VPS. Use `sottodennis@gmail.com` as the login email.

## Testing
Add backend smoke tests for login success, login failure, protected API rejection, and authenticated API access. Keep existing tests running by disabling auth in the normal smoke fixture and explicitly enabling it inside the auth tests.
