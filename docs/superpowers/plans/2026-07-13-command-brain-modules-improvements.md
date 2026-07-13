# Command Brain Modules and Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add high-value Command Brain modules and harden the current architecture without breaking the live single-user deployment.

**Architecture:** Keep the existing Item model and React route shell for the first modules, then split backend responsibilities into routers/services once behavior is covered by tests. Additive modules should use the current `/items` contract where possible and only introduce new backend endpoints when the generic item shape is insufficient.

**Tech Stack:** React 19, Vite, FastAPI, SQLAlchemy, SQLite, Pydantic, oxlint, custom Python regression checks.

---

## File Structure

- Modify: `backend/main.py`
  - Short term: add narrow endpoints only where generic item CRUD cannot support the module.
  - Later: move endpoints into router files.
- Modify: `backend/models.py`
  - Add fields only when the Item abstraction cannot represent required data.
- Modify: `backend/schemas.py`
  - Keep Pydantic v1/v2 compatibility.
- Create: `backend/routers/*.py`
  - Used in the backend split phase.
- Create: `backend/services/*.py`
  - Used for AI, files, mail, and reminder logic.
- Modify: `frontend/src/App.jsx`
  - Add lazy routes for new modules.
- Modify: `frontend/src/Layout.jsx`
  - Add navigation or FAB access only for modules that should be first-class.
- Modify: `frontend/src/pages/WorkspacesPage.jsx`
  - Add module entries.
- Create: `frontend/src/pages/HabitsPage.jsx`
- Create: `frontend/src/pages/GoalsPage.jsx`
- Create: `frontend/src/pages/ContactsPage.jsx`
- Create: `frontend/src/pages/DocumentsPage.jsx`
- Create: `frontend/src/pages/KnowledgePage.jsx`
- Create: `frontend/src/pages/HealthPage.jsx`
- Create: `frontend/src/pages/TravelPage.jsx`
- Create: `frontend/src/pages/AssetsPage.jsx`
- Create: `frontend/src/pages/FinancePlanPage.jsx`
- Create: `frontend/src/pages/AutomationPage.jsx`
- Create: `tests/audit_regressions.py` additions
  - Guard high-risk behavior for each module.

---

## Phase 1: Stabilize the Module Foundation

### Task 1: Add Shared Module Metadata

**Files:**
- Create: `frontend/src/modules/moduleRegistry.js`
- Modify: `frontend/src/pages/WorkspacesPage.jsx`
- Modify: `frontend/src/Layout.jsx`

- [ ] **Step 1: Write the failing regression**

Add to `tests/audit_regressions.py`:

```python
def test_module_registry_exists_and_drives_workspaces() -> None:
    registry = read("frontend/src/modules/moduleRegistry.js")
    workspaces = read("frontend/src/pages/WorkspacesPage.jsx")
    assert "export const MODULES" in registry
    assert "MODULES" in workspaces
```

- [ ] **Step 2: Run regression and verify failure**

Run:

```bash
python3 tests/audit_regressions.py
```

Expected: fails because `moduleRegistry.js` does not exist.

- [ ] **Step 3: Create registry**

Create `frontend/src/modules/moduleRegistry.js`:

```javascript
import {
  CheckCircle2, Bell, Wallet, FileText, FolderOpen, BookOpen,
  BarChart2, Sparkles, Target, Users, FileArchive, Workflow
} from 'lucide-react';

export const MODULES = [
  { key: 'tasks', icon: CheckCircle2, bg: 'bg-green-500', label: '/task', sub: 'Open tasks', to: '/tasks' },
  { key: 'reminders', icon: Bell, bg: 'bg-orange-500', label: '/reminder', sub: 'Upcoming reminders', to: '/reminders' },
  { key: 'expenses', icon: Wallet, bg: 'bg-blue-500', label: '/expense', sub: 'Track spending', to: '/expenses' },
  { key: 'notes', icon: FileText, bg: 'bg-purple-500', label: '/note', sub: 'Quick notes', to: '/notes' },
  { key: 'projects', icon: FolderOpen, bg: 'bg-teal-600', label: '/project', sub: 'Project boards', to: '/projects' },
  { key: 'journal', icon: BookOpen, bg: 'bg-pink-500', label: '/journal', sub: 'PIN protected', to: '/journal', locked: true },
  { key: 'analytics', icon: BarChart2, bg: 'bg-indigo-500', label: '/analytics', sub: 'Insights & trends', to: '/analytics' },
  { key: 'chat', icon: Sparkles, bg: 'bg-violet-600', label: '/chat', sub: 'AI assistant', to: '/chat' },
  { key: 'habits', icon: Target, bg: 'bg-emerald-500', label: '/habit', sub: 'Daily streaks', to: '/habits' },
  { key: 'contacts', icon: Users, bg: 'bg-cyan-600', label: '/contact', sub: 'People and follow-ups', to: '/contacts' },
  { key: 'documents', icon: FileArchive, bg: 'bg-red-500', label: '/document', sub: 'Expiring docs', to: '/documents' },
  { key: 'automation', icon: Workflow, bg: 'bg-slate-500', label: '/automation', sub: 'Rules and routines', to: '/automation' },
];
```

- [ ] **Step 4: Use registry in workspaces**

Update `frontend/src/pages/WorkspacesPage.jsx` to import `MODULES` and map it instead of the local `WORKSPACES` array.

- [ ] **Step 5: Verify**

Run:

```bash
python3 tests/audit_regressions.py
npm --prefix frontend run lint
npm --prefix frontend run build
```

Expected: all pass.

---

## Phase 2: Habits Module

### Task 2: Build Habit Tracking

**Files:**
- Create: `frontend/src/pages/HabitsPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `tests/audit_regressions.py`

- [ ] **Step 1: Write failing regression**

```python
def test_habits_route_is_registered() -> None:
    app = read("frontend/src/App.jsx")
    assert "HabitsPage" in app
    assert 'path="/habits"' in app
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
python3 tests/audit_regressions.py
```

Expected: fails because route is missing.

- [ ] **Step 3: Create page**

Implement `HabitsPage.jsx` using `type: "habit"` items:

```javascript
// Store title as habit name.
// Store subtitle as "Habit • Daily".
// Store body as JSON: { streak, completions: ["YYYY-MM-DD"] }.
```

Required UI:
- list habits
- add habit
- mark today complete
- show streak
- delete habit

- [ ] **Step 4: Register route**

In `frontend/src/App.jsx`:

```javascript
const HabitsPage = React.lazy(() => import('./pages/HabitsPage.jsx'));
```

Add:

```jsx
<Route path="/habits" element={<HabitsPage workspace={workspace} />} />
```

- [ ] **Step 5: Verify**

Run:

```bash
python3 tests/audit_regressions.py
npm --prefix frontend run lint
npm --prefix frontend run build
```

Expected: all pass.

---

## Phase 3: Contacts and Follow-Ups Module

### Task 3: Build Contacts

**Files:**
- Create: `frontend/src/pages/ContactsPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `tests/audit_regressions.py`

- [ ] **Step 1: Add regression**

```python
def test_contacts_route_is_registered() -> None:
    app = read("frontend/src/App.jsx")
    assert "ContactsPage" in app
    assert 'path="/contacts"' in app
```

- [ ] **Step 2: Implement contact item convention**

Use `type: "contact"`:

```javascript
{
  title: "Person or company name",
  subtitle: "Contact • Follow up 2026-07-20",
  body: JSON.stringify({ phone, email, notes, lastContacted, nextFollowUp }),
  workspace
}
```

Required UI:
- add contact
- edit notes
- set next follow-up
- quick-create reminder from contact
- list overdue follow-ups

- [ ] **Step 3: Verify**

Run:

```bash
python3 tests/audit_regressions.py
npm --prefix frontend run lint
npm --prefix frontend run build
```

Expected: all pass.

---

## Phase 4: Documents Module

### Task 4: Build Dedicated Document Expiry View

**Files:**
- Create: `frontend/src/pages/DocumentsPage.jsx`
- Modify: `frontend/src/App.jsx`
- Optionally modify: `backend/main.py`

- [ ] **Step 1: Add regression**

```python
def test_documents_route_is_registered() -> None:
    app = read("frontend/src/App.jsx")
    assert "DocumentsPage" in app
    assert 'path="/documents"' in app
```

- [ ] **Step 2: Implement page**

Use existing `vault_file` and `note` items with `expiry_date`.

Required UI:
- grouped by expired, due soon, later, no expiry
- filter by workspace
- open shared document
- create reminder for expiry

- [ ] **Step 3: Verify no new backend fields required**

Run:

```bash
rg -n "expiry_date|vault_file|share_token" backend frontend/src/pages
```

Expected: page uses existing fields unless a gap is explicitly documented.

---

## Phase 5: Automation Module

### Task 5: Add Simple Local Rules

**Files:**
- Create: `frontend/src/pages/AutomationPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `backend/main.py` only if server-side automation is needed later.

- [ ] **Step 1: Add regression**

```python
def test_automation_route_is_registered() -> None:
    app = read("frontend/src/App.jsx")
    assert "AutomationPage" in app
    assert 'path="/automation"' in app
```

- [ ] **Step 2: Implement local rule storage**

Use `localStorage` key `commandbrain_rules`.

Initial rules:
- auto-create reminder when item subtitle includes `Expires`
- auto-tag expenses above a configurable amount
- auto-pin notes containing configured keywords

- [ ] **Step 3: Add rule execution helper**

Create `frontend/src/modules/rules.js`:

```javascript
export function applyRules(item, rules) {
  return rules.reduce((next, rule) => {
    if (!rule.enabled) return next;
    if (rule.kind === 'tag-expense-over' && item.type === 'expense') {
      const amount = Number(item.title?.match(/^\d+(\.\d+)?/)?.[0] || 0);
      if (amount >= Number(rule.amount)) return { ...next, tags: rule.tag };
    }
    return next;
  }, item);
}
```

- [ ] **Step 4: Verify**

Run:

```bash
npm --prefix frontend run lint
npm --prefix frontend run build
```

Expected: all pass.

---

## Phase 6: Goals and Milestones Module

### Task 6: Build Goals

**Files:**
- Create: `frontend/src/pages/GoalsPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/modules/moduleRegistry.js`
- Modify: `tests/audit_regressions.py`

- [ ] **Step 1: Add route regression**

Add to `tests/audit_regressions.py`:

```python
def test_goals_route_is_registered() -> None:
    app = read("frontend/src/App.jsx")
    registry = read("frontend/src/modules/moduleRegistry.js")
    assert "GoalsPage" in app
    assert 'path="/goals"' in app
    assert "'goals'" in registry
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
python3 tests/audit_regressions.py
```

Expected: fails because `GoalsPage` and `/goals` do not exist.

- [ ] **Step 3: Implement item convention**

Use `type: "goal"`:

```javascript
{
  title: "Launch client portal",
  subtitle: "Goal • Active • Due 2026-09-30",
  body: JSON.stringify({
    status: "active",
    dueDate: "2026-09-30",
    progress: 35,
    milestones: [
      { id: "m1", title: "Design screens", done: true },
      { id: "m2", title: "Ship MVP", done: false }
    ]
  }),
  workspace
}
```

- [ ] **Step 4: Create page**

Create `frontend/src/pages/GoalsPage.jsx` with:
- active goals list
- add goal form
- progress slider
- milestone checklist
- done/archive action that changes status in `body`

- [ ] **Step 5: Register route**

In `frontend/src/App.jsx`:

```javascript
const GoalsPage = React.lazy(() => import('./pages/GoalsPage.jsx'));
```

Add:

```jsx
<Route path="/goals" element={<GoalsPage workspace={workspace} />} />
```

- [ ] **Step 6: Update registry**

Add a module entry:

```javascript
{ key: 'goals', icon: Trophy, bg: 'bg-amber-500', label: '/goal', sub: 'Milestones and progress', to: '/goals' }
```

Import `Trophy` from `lucide-react`.

- [ ] **Step 7: Verify**

Run:

```bash
python3 tests/audit_regressions.py
npm --prefix frontend run lint
npm --prefix frontend run build
```

Expected: all pass.

---

## Phase 7: Knowledge and Learning Module

### Task 7: Build Knowledge Library

**Files:**
- Create: `frontend/src/pages/KnowledgePage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/modules/moduleRegistry.js`
- Modify: `tests/audit_regressions.py`

- [ ] **Step 1: Add route regression**

```python
def test_knowledge_route_is_registered() -> None:
    app = read("frontend/src/App.jsx")
    registry = read("frontend/src/modules/moduleRegistry.js")
    assert "KnowledgePage" in app
    assert 'path="/knowledge"' in app
    assert "'knowledge'" in registry
```

- [ ] **Step 2: Implement item convention**

Use `type: "knowledge"`:

```javascript
{
  title: "React Suspense notes",
  subtitle: "Knowledge • React • Article",
  body: JSON.stringify({
    sourceUrl: "https://example.com/article",
    summary: "Short summary",
    tags: ["react", "frontend"],
    status: "reading"
  }),
  workspace
}
```

- [ ] **Step 3: Create page**

Required UI:
- add resource
- tag filter
- status filter: reading, saved, mastered
- quick convert to note
- search within title, summary, tags

- [ ] **Step 4: Verify**

Run:

```bash
python3 tests/audit_regressions.py
npm --prefix frontend run lint
npm --prefix frontend run build
```

Expected: all pass.

---

## Phase 8: Health and Medication Module

### Task 8: Build Health Tracker

**Files:**
- Create: `frontend/src/pages/HealthPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/modules/moduleRegistry.js`
- Modify: `tests/audit_regressions.py`

- [ ] **Step 1: Add route regression**

```python
def test_health_route_is_registered() -> None:
    app = read("frontend/src/App.jsx")
    registry = read("frontend/src/modules/moduleRegistry.js")
    assert "HealthPage" in app
    assert 'path="/health"' in app
    assert "'health'" in registry
```

- [ ] **Step 2: Implement item conventions**

Use `type: "health"` for metrics and `type: "medication"` for medication schedules:

```javascript
{
  type: "health",
  title: "Blood pressure",
  subtitle: "Health • 120/80 • Today",
  body: JSON.stringify({ metric: "blood_pressure", systolic: 120, diastolic: 80, date: "2026-07-13" }),
  workspace
}
```

```javascript
{
  type: "medication",
  title: "Vitamin D",
  subtitle: "Medication • Daily • 09:00",
  body: JSON.stringify({ dosage: "1000 IU", time: "09:00", repeat: "Daily", takenDates: [] }),
  workspace
}
```

- [ ] **Step 3: Create page**

Required UI:
- metric cards
- add medication
- mark medication taken today
- upcoming medication reminders
- create reminder item for medication schedule

- [ ] **Step 4: Verify**

Run:

```bash
python3 tests/audit_regressions.py
npm --prefix frontend run lint
npm --prefix frontend run build
```

Expected: all pass.

---

## Phase 9: Travel and Trip Planner Module

### Task 9: Build Travel Planner

**Files:**
- Create: `frontend/src/pages/TravelPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/modules/moduleRegistry.js`
- Modify: `tests/audit_regressions.py`

- [ ] **Step 1: Add route regression**

```python
def test_travel_route_is_registered() -> None:
    app = read("frontend/src/App.jsx")
    registry = read("frontend/src/modules/moduleRegistry.js")
    assert "TravelPage" in app
    assert 'path="/travel"' in app
    assert "'travel'" in registry
```

- [ ] **Step 2: Implement item convention**

Use `type: "trip"`:

```javascript
{
  title: "Dubai business trip",
  subtitle: "Trip • 2026-08-10 to 2026-08-14",
  body: JSON.stringify({
    destination: "Dubai",
    startDate: "2026-08-10",
    endDate: "2026-08-14",
    checklist: [
      { id: "passport", title: "Passport", done: false },
      { id: "hotel", title: "Hotel booking", done: false }
    ],
    reservations: []
  }),
  workspace
}
```

- [ ] **Step 3: Create page**

Required UI:
- upcoming trips
- trip detail drawer
- checklist
- reservation list
- create related reminders
- attach vault documents by linking `share_token` or item id in `body`

- [ ] **Step 4: Verify**

Run:

```bash
python3 tests/audit_regressions.py
npm --prefix frontend run lint
npm --prefix frontend run build
```

Expected: all pass.

---

## Phase 10: Asset Inventory Module

### Task 10: Build Asset Inventory

**Files:**
- Create: `frontend/src/pages/AssetsPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/modules/moduleRegistry.js`
- Modify: `tests/audit_regressions.py`

- [ ] **Step 1: Add route regression**

```python
def test_assets_route_is_registered() -> None:
    app = read("frontend/src/App.jsx")
    registry = read("frontend/src/modules/moduleRegistry.js")
    assert "AssetsPage" in app
    assert 'path="/assets"' in app
    assert "'assets'" in registry
```

- [ ] **Step 2: Implement item convention**

Use `type: "asset"`:

```javascript
{
  title: "MacBook Pro",
  subtitle: "Asset • Electronics • Warranty 2027-01-15",
  body: JSON.stringify({
    category: "Electronics",
    serialNumber: "C02...",
    purchaseDate: "2026-01-15",
    warrantyUntil: "2027-01-15",
    value: 9500,
    location: "Office"
  }),
  workspace
}
```

- [ ] **Step 3: Create page**

Required UI:
- inventory list by category
- warranty due soon
- total estimated value
- add/edit asset
- create renewal reminder for warranty

- [ ] **Step 4: Verify**

Run:

```bash
python3 tests/audit_regressions.py
npm --prefix frontend run lint
npm --prefix frontend run build
```

Expected: all pass.

---

## Phase 11: Finance Planning Module

### Task 11: Build Budget Forecasts and Recurring Payments

**Files:**
- Create: `frontend/src/pages/FinancePlanPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/modules/moduleRegistry.js`
- Modify: `tests/audit_regressions.py`

- [ ] **Step 1: Add route regression**

```python
def test_finance_plan_route_is_registered() -> None:
    app = read("frontend/src/App.jsx")
    registry = read("frontend/src/modules/moduleRegistry.js")
    assert "FinancePlanPage" in app
    assert 'path="/finance-plan"' in app
    assert "'finance-plan'" in registry
```

- [ ] **Step 2: Implement item convention**

Use `type: "recurring_payment"`:

```javascript
{
  title: "950 AED Internet",
  subtitle: "Recurring • Bills & Utilities • Monthly",
  body: JSON.stringify({
    amount: 950,
    category: "Bills & Utilities",
    cadence: "Monthly",
    nextDueDate: "2026-08-01",
    account: "Main"
  }),
  workspace
}
```

- [ ] **Step 3: Create page**

Required UI:
- monthly forecast
- recurring payments list
- upcoming due payments
- convert due recurring payment into expense
- budget variance by category using existing expense items

- [ ] **Step 4: Verify**

Run:

```bash
python3 tests/audit_regressions.py
npm --prefix frontend run lint
npm --prefix frontend run build
```

Expected: all pass.

---

## Phase 12: Backend Router Split

### Task 12: Extract Item CRUD Router

**Files:**
- Create: `backend/deps.py`
- Create: `backend/routers/items.py`
- Modify: `backend/main.py`
- Modify: `tests/audit_regressions.py`

- [ ] **Step 1: Add import regression**

```python
def test_backend_uses_items_router() -> None:
    main = read("backend/main.py")
    assert "from routers.items import router as items_router" in main
    assert "app.include_router(items_router)" in main
```

- [ ] **Step 2: Move `get_db` to deps**

Create `backend/deps.py`:

```python
from database import SessionLocal

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 3: Move item endpoints**

Move:
- `GET /items`
- `POST /items`
- `GET /items/type/{item_type}`
- `PATCH /items/{item_id}`
- `DELETE /items/{item_id}`
- `DELETE /api/items/clear-all`

into `backend/routers/items.py`.

- [ ] **Step 4: Include router**

In `backend/main.py`:

```python
from routers.items import router as items_router
app.include_router(items_router)
```

- [ ] **Step 5: Verify**

Run:

```bash
python3 tests/audit_regressions.py
python3 -m py_compile backend/*.py backend/routers/*.py tests/audit_regressions.py
```

Expected: all pass.

---

## Phase 13: Endpoint-Level Tests

### Task 13: Add FastAPI TestClient Smoke Tests

**Files:**
- Modify: `backend/requirements.txt`
- Create: `tests/backend_smoke.py`

- [ ] **Step 1: Add requirements**

Add:

```text
pytest
```

- [ ] **Step 2: Create tests**

Create `tests/backend_smoke.py`:

```python
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from fastapi.testclient import TestClient
import main


client = TestClient(main.app)


def test_items_crud_smoke():
    created = client.post("/items", json={
        "type": "note",
        "title": "Smoke note",
        "subtitle": "Note • Test",
        "workspace": "Smoke"
    })
    assert created.status_code == 200
    item_id = created.json()["id"]

    listed = client.get("/items", params={"workspace": "Smoke"})
    assert listed.status_code == 200
    assert any(item["id"] == item_id for item in listed.json())

    deleted = client.delete(f"/items/{item_id}")
    assert deleted.status_code == 200
```

- [ ] **Step 3: Verify**

Run:

```bash
pytest tests/backend_smoke.py
```

Expected: pass.

---

## Phase 14: Deployment Guard

### Task 14: Add Deploy Checklist Script

**Files:**
- Create: `scripts/verify-before-deploy.sh`

- [ ] **Step 1: Create script**

```bash
#!/usr/bin/env bash
set -euo pipefail

python3 tests/audit_regressions.py
python3 -m py_compile backend/*.py tests/*.py
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend audit --audit-level=moderate
```

- [ ] **Step 2: Make executable**

Run:

```bash
chmod +x scripts/verify-before-deploy.sh
```

- [ ] **Step 3: Verify**

Run:

```bash
scripts/verify-before-deploy.sh
```

Expected: all pass.

---

## Recommended Order

1. Phase 1: Module registry.
2. Phase 2: Habits.
3. Phase 3: Contacts.
4. Phase 4: Documents.
5. Phase 6: Goals.
6. Phase 7: Knowledge.
7. Phase 8: Health.
8. Phase 9: Travel.
9. Phase 10: Assets.
10. Phase 11: Finance Planning.
11. Phase 14: Deploy guard.
12. Phase 13: Backend smoke tests.
13. Phase 12: Backend router split.
14. Phase 5: Automation.

This order gives visible product improvements first, then hardens delivery and architecture before higher-risk automation behavior.
