# Command Brain Code Audit Report

Date: 2026-07-13

## Scope

Audited the FastAPI backend, React/Vite frontend, service worker, dependency manifests, and build/lint configuration. The audit covered formatting and naming irregularities, deprecated APIs, stale React hooks, security-sensitive defaults, hardcoded deployment values, dependency drift, and production build output.

## Irregularities Found and Fixed

| Severity | Location | Irregularity | Recommended fix | Fix applied |
| --- | --- | --- | --- | --- |
| High | `backend/main.py:25`, `backend/main.py:83`, earlier hardcoded upload URLs | Backend generated file URLs with `http://localhost:8001` or a fixed production domain. This breaks deployed clients and makes environment changes risky. | Centralize public URL generation behind an environment-backed base URL. | Added `PUBLIC_BASE_URL` and `uploaded_file_url()`, then routed scan, receipt, and vault upload URLs through it. |
| High | `backend/main.py:26-33`, `backend/main.py:58-64` | CORS allowed `*` while credentials were enabled. This is overly permissive and browser-inconsistent. | Use an explicit origin allowlist from configuration. | Added `CORS_ORIGINS` with production and local-dev defaults. |
| High | `backend/main.py:577-578` | Share links used UUID4 tokens. UUID4 is usually hard to guess, but it is not the best primitive for bearer share tokens. | Use `secrets.token_urlsafe()` for share tokens. | Replaced UUID share tokens with `secrets.token_urlsafe(32)`. |
| High | `frontend/src/pages/ExpensePage.jsx:68-75` | Expense creation computed a valid title but posted nonexistent `form.currency` and `form.title` fields. | Post the computed title from the actual form fields. | Updated the request payload to send `title`. |
| High | `frontend/src/pages/JournalPage.jsx:169-175` | Journal save accepted `body` but did not send it to the backend, losing entry text. | Persist `body` in the item creation payload. | Added `body` to the journal create request. |
| Medium | `backend/main.py:45-56`, `backend/main.py:430` | Scheduler was started at import time and shutdown through deprecated `@app.on_event`. | Use FastAPI lifespan and start/stop the scheduler with the app lifecycle. | Added `lifespan`, moved scheduler startup/shutdown there, and removed `@app.on_event`. |
| Medium | `backend/main.py:77-80`, `backend/schemas.py:12-44` | Pydantic v2 deprecates `.dict()` and `orm_mode`. | Use `model_dump()` when available and `ConfigDict(from_attributes=True)` for Pydantic v2 while keeping v1 compatibility. | Added `model_data()` and conditional Pydantic v1/v2 schema configuration. |
| Medium | `backend/database.py:1-11` | SQLAlchemy `declarative_base` import used the old extension path. | Import `declarative_base` from `sqlalchemy.orm`. | Updated import path. |
| Medium | `backend/main.py:354-396` | Email HTML interpolated document data without escaping and used undeclared `requests`. | Escape interpolated HTML and use an already declared HTTP client dependency. | Added `html.escape()` and replaced `requests.post()` with `httpx.post()`. |
| Medium | `backend/requirements.txt:1-9` | `apscheduler` was imported but missing from backend requirements. | Declare every imported runtime dependency. | Added `apscheduler`. |
| Medium | `frontend/src/App.jsx:27-45` | All pages were eagerly imported, producing an oversized initial JavaScript chunk. | Split route pages with dynamic imports. | Converted route pages to `React.lazy()` with a shared suspense fallback. |
| Medium | `frontend/public/sw.js:33-35`, `frontend/public/sw.js:65` | Service worker API detection depended on port `:8001` and had an unused catch parameter. | Detect API requests by path and remove unused parameters. | Switched detection to `/api/` and `/items` paths and cleaned the catch handler. |
| Low | `frontend/src/ThemeContext.jsx:1-28`, `frontend/src/hooks/themeContextValue.js:1-3`, `frontend/src/hooks/useTheme.js:1-4` | Theme provider, context, and hook lived in one file, triggering React Fast Refresh lint warnings. | Split provider, context value, and hook. | Added focused hook/context modules and updated imports. |
| Low | Multiple frontend files reported by `oxlint` | Unused imports, variables, and stale hook dependencies created maintenance noise and potential stale workspace loads. | Remove unused symbols and correct dependency arrays where behavior depends on `workspace`. | Cleaned imports/state in pages and components; fixed workspace dependencies for task, expense, note, reminder, vault, search, and app item loaders. |
| Low | `frontend/package.json:12-17` and lockfile | `playwright` and `source-map` were listed as production dependencies but unused in source. | Remove unused production dependencies. | Uninstalled both packages and refreshed `package-lock.json`. |
| Low | `frontend/src/main.jsx` | Development-only cache-busting `console.log` shipped in source. | Remove development logging. | Removed the log. |

## Regression Coverage Added

Created `tests/audit_regressions.py` to guard the highest-risk findings:

- no hardcoded `http://localhost:8001` API URLs
- no wildcard credentialed CORS
- no deprecated FastAPI `@app.on_event`
- share tokens use `secrets.token_urlsafe`
- backend dependency expectations are met
- no development console log in `main.jsx`
- expense creation uses existing form fields
- journal creation persists entry body

## Verification

Commands run successfully:

- `python3 tests/audit_regressions.py`
- `python3 -m py_compile backend/*.py tests/audit_regressions.py`
- Backend import with installed requirements and warnings treated as errors:
  `PYTHONWARNINGS=error python -c "import main; print(main.app.title)"`
- `npx oxlint --deny-warnings`
- `npm run build`
- `npm audit --audit-level=moderate`

Build output now uses route and vendor chunks instead of one oversized app chunk. `npm audit` reported 0 vulnerabilities.

## Notes

The backend still has broad application-level architectural debt in `backend/main.py`, which remains a large multi-responsibility module. I kept this audit’s refactoring compatible and focused: production behavior, security posture, dependency correctness, lint cleanliness, and verified functional bugs. A larger follow-up should split backend concerns into routers/services once there is endpoint-level test coverage.
