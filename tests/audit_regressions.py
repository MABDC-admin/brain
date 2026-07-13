from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def assert_absent(path: str, needle: str) -> None:
    content = read(path)
    if needle in content:
        raise AssertionError(f"{path} still contains {needle!r}")


def test_no_hardcoded_localhost_api_urls() -> None:
    for path in [
        "backend/main.py",
        "frontend/src",
        "frontend/public",
    ]:
        target = ROOT / path
        files = target.rglob("*") if target.is_dir() else [target]
        for file_path in files:
            if file_path.is_file() and file_path.suffix in {".js", ".jsx", ".py"}:
                content = file_path.read_text(encoding="utf-8")
                if "http://localhost:8001" in content:
                    raise AssertionError(f"{file_path.relative_to(ROOT)} has localhost API URL")


def test_backend_uses_configured_cors_origins() -> None:
    assert_absent("backend/main.py", 'allow_origins=["*"]')
    assert "CORS_ORIGINS" in read("backend/main.py")


def test_backend_avoids_deprecated_fastapi_shutdown_hook() -> None:
    assert_absent("backend/main.py", "@app.on_event")
    assert "lifespan=" in read("backend/main.py")


def test_share_tokens_use_secrets_module() -> None:
    content = read("backend/main.py")
    if "share_token = str(uuid.uuid4())" in content:
        raise AssertionError("share tokens still use uuid4")
    assert "secrets.token_urlsafe" in content


def test_backend_dependencies_are_declared_or_removed() -> None:
    assert "import requests" not in read("backend/main.py")
    assert "requests" not in read("backend/requirements.txt")
    assert "apscheduler" in read("backend/requirements.txt").lower()


def test_login_auth_uses_environment_and_http_only_cookie() -> None:
    backend = read("backend/main.py")
    frontend = read("frontend/src/App.jsx")
    settings = read("frontend/src/pages/SettingsPage.jsx")
    assert "AUTH_EMAIL = os.getenv" in backend
    assert "AUTH_PASSWORD = os.getenv" in backend
    assert "SESSION_SECRET = os.getenv" in backend
    assert "httponly=True" in backend
    assert "secure=True" in backend
    assert "/api/auth/login" in frontend
    assert "/api/auth/me" in frontend
    assert "/api/auth/logout" in settings
    assert "Denskie123" not in backend
    assert "Denskie123" not in frontend
    assert "Denskie123" not in settings


def test_frontend_has_no_development_console_log() -> None:
    assert_absent("frontend/src/main.jsx", "console.log")


def test_expense_creation_uses_form_fields_that_exist() -> None:
    assert_absent("frontend/src/pages/ExpensePage.jsx", "form.currency")
    assert_absent("frontend/src/pages/ExpensePage.jsx", "form.title")


def test_journal_creation_persists_entry_body() -> None:
    content = read("frontend/src/pages/JournalPage.jsx")
    assert "JSON.stringify({ type: 'journal', title, subtitle, body })" in content


def test_settings_lock_icon_is_imported_from_lucide() -> None:
    content = read("frontend/src/pages/SettingsPage.jsx")
    import_block = content.split("} from 'lucide-react';", 1)[0]
    assert "Lock" in import_block


def test_clear_data_uses_backend_clear_all_endpoint() -> None:
    frontend = read("frontend/src/pages/SettingsPage.jsx")
    backend = read("backend/routers/items.py")
    assert "X-Clear-Data-Token" in frontend
    assert "encodeURIComponent(workspace)" in frontend
    assert '@router.delete("/api/items/clear-all")' in backend
    assert "CLEAR_DATA_TOKEN" in backend
    assert "workspace != \"*\"" in backend
    assert "items.map(i => fetch" not in frontend


def test_assistant_has_local_vault_ocr_retry_command() -> None:
    backend = read("backend/main.py")
    assert "OCR_WORD_RE" in backend
    assert "async def handle_document_ocr_request" in backend
    assert "async def retry_vault_document_ocr" in backend
    assert "await handle_document_ocr_request(message, history, db)" in backend
    assert "vault_index_prompt" in backend
    assert "vault_body_payload" in backend


def test_module_registry_exists_and_drives_workspaces() -> None:
    registry = read("frontend/src/modules/moduleRegistry.js")
    workspaces = read("frontend/src/pages/WorkspacesPage.jsx")
    assert "export const MODULES" in registry
    assert "MODULES" in workspaces
    assert "WORKSPACES" not in workspaces


def test_additional_module_routes_are_registered() -> None:
    app = read("frontend/src/App.jsx")
    expected_routes = {
        "HabitsPage": 'path="/habits"',
        "ContactsPage": 'path="/contacts"',
        "DocumentsPage": 'path="/documents"',
        "GoalsPage": 'path="/goals"',
        "KnowledgePage": 'path="/knowledge"',
        "HealthPage": 'path="/health"',
        "TravelPage": 'path="/travel"',
        "AssetsPage": 'path="/assets"',
        "FinancePlanPage": 'path="/finance-planning"',
        "AutomationPage": 'path="/automation"',
    }
    for page, route in expected_routes.items():
        assert page in app
        assert route in app


def test_additional_modules_use_expected_item_types() -> None:
    expected_types = {
        "frontend/src/pages/HabitsPage.jsx": "habit",
        "frontend/src/pages/ContactsPage.jsx": "contact",
        "frontend/src/pages/DocumentsPage.jsx": "document",
        "frontend/src/pages/GoalsPage.jsx": "goal",
        "frontend/src/pages/KnowledgePage.jsx": "knowledge",
        "frontend/src/pages/HealthPage.jsx": "health",
        "frontend/src/pages/TravelPage.jsx": "travel",
        "frontend/src/pages/AssetsPage.jsx": "asset",
        "frontend/src/pages/FinancePlanPage.jsx": "finance_plan",
    }
    for path, item_type in expected_types.items():
        content = read(path)
        assert f"/items/type/{item_type}?workspace=${{encodeURIComponent(" in content
        assert f"type: '{item_type}'" in content or f'type: "{item_type}"' in content


def test_automation_rules_are_local_and_testable() -> None:
    app = read("frontend/src/App.jsx")
    page = read("frontend/src/pages/AutomationPage.jsx")
    rules = read("frontend/src/modules/rules.js")
    assert "AutomationPage" in app
    assert "commandbrain_rules" in page
    assert "export function applyRules" in rules
    assert "export function getExpiryReminderDraft" in rules
    assert "tag-expense-over" in rules
    assert "auto-create-expiry-reminder" in page
    assert "getExpiryReminderDraft" in read("frontend/src/pages/DocumentsPage.jsx")


def test_backend_uses_items_router() -> None:
    main = read("backend/main.py")
    router = read("backend/routers/items.py")
    assert "from routers.items import router as items_router" in main
    assert "app.include_router(items_router)" in main
    assert '@router.get("/items"' in router
    assert '@router.delete("/api/items/clear-all")' in router


def test_item_updates_accept_patch_and_put() -> None:
    router = read("backend/routers/items.py")
    assert 'methods=["PATCH", "PUT"]' in router


def test_app_uses_router_location_for_shared_routes() -> None:
    app = read("frontend/src/App.jsx")
    app_inner = app.split("function AppInner()", 1)[1]
    assert "const location = useLocation();" in app_inner
    assert "const isSharedRoute = location.pathname.startsWith('/shared/')" in app_inner


def test_backend_smoke_uses_isolated_database() -> None:
    smoke = read("tests/backend_smoke.py")
    database = read("backend/database.py")
    assert "tempfile.NamedTemporaryFile" in smoke
    assert 'os.environ["SQLALCHEMY_DATABASE_URL"]' in smoke
    assert "dependency_overrides" in smoke
    assert 'os.getenv("SQLALCHEMY_DATABASE_URL"' in database


def test_assistant_llm_tool_planner_is_allowlisted_and_validated() -> None:
    main = read("backend/main.py")
    assert "ASSISTANT_TOOL_NAMES" in main
    assert "plan_assistant_tool_with_llm" in main
    assert "execute_assistant_tool" in main
    assert "execute_assistant_plan" in main
    assert "assistant_reply_requires_confirmation" in main
    assert "looks_like_compound_action_request" in main
    assert "use_planner_first" in main
    assert "tool_name not in ASSISTANT_TOOL_NAMES" in main
    assert "step_tool not in ASSISTANT_TOOL_NAMES" in main
    assert "confidence < 0.65" in main
    assert "Rejected unapproved assistant tool" in main
    assert "Rejected unapproved assistant plan step" in main
    assert 'status="pending"' in main
    assert "confirmation_token=token" in main
    assert "For multiple actions, use steps" in main
    assert "remaining_steps" in main
    assert 'execute_assistant_plan({"steps": remaining_steps}' in main
    assert "approval_payload" in main
    assert "create_pending_approval" in main
    assert "cancellation_token_from_message" in main
    assert 'status = "canceled"' in main
    assert "delete_vault_document" in main
    assert "send_vault_document_email" in main
    assert "find_ranked_vault_document_matches" in main
    assert "resolve_vault_document_match" in main
    assert "ambiguous_vault_match_reply" in main
    assert "match_confidence" in main
    assert "match_reason" in main


def test_chat_page_renders_structured_approval_controls() -> None:
    chat = read("frontend/src/pages/ChatPage.jsx")
    assert "ApprovalCard" in chat
    assert "m.approval" in chat
    assert "confirm_command" in chat
    assert "cancel_command" in chat
    assert "remaining_steps" in chat
    assert "document_title" in chat
    assert "match_confidence" in chat
    assert "alternatives" in chat
    assert "ShieldCheck" in chat


def test_task_page_supports_editing_existing_tasks() -> None:
    task_page = read("frontend/src/pages/TaskPage.jsx")
    assert "editingTask" in task_page
    assert "openTaskEditor" in task_page
    assert "Pencil" in task_page
    assert "method: targetTask ? 'PUT' : 'POST'" in task_page


def test_task_done_status_is_persisted() -> None:
    task_page = read("frontend/src/pages/TaskPage.jsx")
    assert "meta.status === 'done'" in task_page
    assert "persistTaskStatus" in task_page
    assert "status: nextDone ? 'done' : 'open'" in task_page
    assert "method: 'PATCH'" in task_page


def test_mobile_layout_removes_desktop_phone_frame() -> None:
    layout = read("frontend/src/Layout.jsx")
    css = read("frontend/src/index.css")
    assert "phone-shell" in layout
    assert "@media (max-width: 640px)" in css
    assert ".phone-shell" in css
    assert "width: 100vw;" in css
    assert "height: 100dvh;" in css
    assert "border-radius: 0;" in css
    assert "box-shadow: none;" in css


def test_workspace_selector_is_clickable_on_touch_devices() -> None:
    layout = read("frontend/src/Layout.jsx")
    assert "workspaceOpen" in layout
    assert "setWorkspaceOpen" in layout
    assert "aria-expanded={workspaceOpen}" in layout
    assert "setWorkspaceOpen(false)" in layout
    assert "group-hover:opacity-100" not in layout


def test_workspace_queries_are_url_encoded() -> None:
    encoded_pages = {
        "frontend/src/App.jsx": "/items?workspace=${encodeURIComponent(workspace)}",
        "frontend/src/pages/TaskPage.jsx": "/items/type/task?workspace=${encodeURIComponent(",
        "frontend/src/pages/NotePage.jsx": "/items/type/note?workspace=${encodeURIComponent(",
        "frontend/src/pages/ReminderPage.jsx": "/items/type/reminder?workspace=${encodeURIComponent(",
        "frontend/src/pages/ExpensePage.jsx": "/items/type/expense?workspace=${encodeURIComponent(",
        "frontend/src/pages/TimelinePage.jsx": "/items?workspace=${encodeURIComponent(",
        "frontend/src/pages/VaultPage.jsx": "/items/type/vault_file?workspace=${encodeURIComponent(",
    }
    for path, needle in encoded_pages.items():
        assert needle in read(path)


def test_delete_confirmation_uses_shared_ui() -> None:
    dialog = read("frontend/src/components/DeleteConfirmationProvider.jsx")
    hook = read("frontend/src/hooks/useDeleteConfirmation.js")
    app = read("frontend/src/App.jsx")
    swipe = read("frontend/src/components/SwipeableRow.jsx")
    settings = read("frontend/src/pages/SettingsPage.jsx")
    assert "createContext" in hook
    assert "useDeleteConfirmation" in hook
    assert "DeleteConfirmationProvider" in app
    assert "confirmDelete" in swipe
    assert "window.confirm" not in settings


def test_core_command_pages_support_editing_and_dates() -> None:
    task = read("frontend/src/pages/TaskPage.jsx")
    reminder = read("frontend/src/pages/ReminderPage.jsx")
    expense = read("frontend/src/pages/ExpensePage.jsx")
    note = read("frontend/src/pages/NotePage.jsx")

    assert "editingTask" in task
    assert "method: targetTask ? 'PUT' : 'POST'" in task
    assert 'type="date"' in task

    assert "editingReminder" in reminder
    assert "method: targetReminder ? 'PUT' : 'POST'" in reminder
    assert 'type="date"' in reminder
    assert "openReminderEditor" in reminder

    assert "editingExpense" in expense
    assert "method: targetExpense ? 'PUT' : 'POST'" in expense
    assert 'type="date"' in expense
    assert "openExpenseEditor" in expense

    assert "editingNote" in note
    assert "method: targetNote ? 'PUT' : 'POST'" in note
    assert "openNoteEditor" in note


def test_vault_uses_in_app_file_preview() -> None:
    vault = read("frontend/src/pages/VaultPage.jsx")
    assert "selectedFile" in vault
    assert "setSelectedFile" in vault
    assert "<iframe" in vault
    assert "application/pdf" in vault or "endsWith('.pdf')" in vault
    assert "window.open(f.image_url, '_blank')" not in vault


def test_vault_has_no_pin_based_item_lock() -> None:
    vault = read("frontend/src/pages/VaultPage.jsx")
    assert "app_pin" not in vault
    assert "unlockItem" not in vault
    assert "toggleLock" not in vault
    assert "Enter PIN" not in vault
    assert "Locked Document" not in vault
    assert "Requires PIN" not in vault


def test_vault_supports_bulk_sequential_uploads() -> None:
    vault = read("frontend/src/pages/VaultPage.jsx")
    assert "multiple" in vault
    assert "uploadProgress" in vault
    assert "Array.from(e.target.files" in vault
    assert "for (const [index, file] of selectedFiles.entries())" in vault
    assert "Uploading ${uploadProgress.current} of ${uploadProgress.total}" in vault


def test_search_page_has_no_mock_recent_searches() -> None:
    search = read("frontend/src/pages/SearchPage.jsx")
    assert "RECENT_SEARCHES" not in search
    assert "expenses this month" not in search
    assert "notes about Acme" not in search
    assert "tax return" not in search
    assert "meeting with Maria" not in search
    assert "Recent searches" not in search


def test_vault_deletion_requires_security_phrase() -> None:
    vault = read("frontend/src/pages/VaultPage.jsx")
    dialog = read("frontend/src/components/DeleteConfirmationProvider.jsx")
    swipe = read("frontend/src/components/SwipeableRow.jsx")
    backend = read("backend/main.py")
    assert "banana" not in vault
    assert "banana" not in dialog
    assert "banana" not in backend
    assert "/api/vault/" in vault
    assert "requiresPhrase" in dialog
    assert "phraseInput" in dialog
    assert "request.onConfirm(phraseInput.trim())" in dialog
    assert "deleteRequiredPhrase" in swipe
    assert "VAULT_DELETE_PHRASE" in backend
    assert 'os.getenv("VAULT_DELETE_PHRASE")' in backend
    assert 'os.getenv("VAULT_DELETE_PHRASE", "banana")' not in backend
    assert '@app.delete("/api/vault/{item_id}")' in backend


def test_chat_can_delete_vault_documents_after_approval() -> None:
    backend = read("backend/main.py")
    assert "handle_document_delete_request" in backend
    assert "DELETE_WORD_RE" in backend
    assert "has_security_phrase" in backend
    assert "is_exact_security_phrase" in backend
    assert "pending_delete_title" in backend
    assert "find_vault_document_by_title" in backend
    assert "delete_vault_document" in backend
    assert "delete_intent = handle_document_delete_request" in backend
    assert "create_pending_approval" in backend
    assert "Confirm delete vault document" in backend
    assert "reply with the security phrase:" not in backend
    assert "if current_delete_request:" in backend
    assert "return ask_for_vault_delete_phrase" not in backend


def test_chat_can_rename_vault_documents() -> None:
    backend = read("backend/main.py")
    assert "RENAME_RE" in backend
    assert "handle_document_rename_request" in backend
    assert "rename_intent = handle_document_rename_request" in backend
    assert "preserve_file_extension" in backend
    assert "Renamed" in backend


def test_vault_upload_uses_pdf_text_and_structured_extraction() -> None:
    backend = read("backend/main.py")
    assert "extract_pdf_text" in backend
    assert "render_pdf_pages_for_vision" in backend
    assert "parse_vault_extraction" in backend
    assert '"document_title"' in backend
    assert '"full_text"' in backend
    assert "Return ONLY valid JSON" in backend
    assert "pdf_text" in backend
    assert "build_vault_scan_result" in backend
    assert "request_vault_vision_extraction" in backend
    assert '"scan_status"' in backend
    assert '"scan_attempts"' in backend
    assert '"scan_error"' in backend
    assert '"index_text": index_text' in backend
    assert "display_title = preserve_file_extension" in backend
    assert "Original filename:" in backend


def test_vault_page_displays_scan_status() -> None:
    vault = read("frontend/src/pages/VaultPage.jsx")
    assert "parseVaultBody" in vault
    assert "scan_status" in vault
    assert "scan_attempts" in vault
    assert "scan_error" in vault
    assert "Fallback OCR" in vault


def test_due_reminder_notifications_are_scheduled_and_deduped() -> None:
    backend = read("backend/main.py")
    assert "send_reminder_email" in backend
    assert "check_due_reminders_and_notify" in backend
    assert "reminder_is_due" in backend
    assert "last_notified_date" in backend
    assert 'CronTrigger(minute="*/5")' in backend


def test_rag_query_can_match_vault_titles_without_body() -> None:
    backend = read("backend/main.py")
    assert "matching_docs = [" in backend
    assert "direct_vault_match_answer" in backend
    assert "normalize_search_text(request.query)" in backend
    assert "Title:" in backend
    assert "Summary:" in backend


def test_chat_can_send_vault_documents_by_email() -> None:
    backend = read("backend/main.py")
    assert 'EMAIL_RE = re.compile(r"\\b' in backend
    assert 'SEND_WORD_RE = re.compile(r"\\b' in backend
    assert 'r"\\\\b' not in backend
    assert "handle_document_email_request" in backend
    assert "send_document_email" in backend
    assert "find_best_vault_document" in backend
    assert "mail_intent = handle_document_email_request" in backend
    assert "MABDC_MAIL_API_KEY" in backend
    assert "image_url" in backend


if __name__ == "__main__":
    tests = [
        test_no_hardcoded_localhost_api_urls,
        test_backend_uses_configured_cors_origins,
        test_backend_avoids_deprecated_fastapi_shutdown_hook,
        test_share_tokens_use_secrets_module,
        test_backend_dependencies_are_declared_or_removed,
        test_frontend_has_no_development_console_log,
        test_expense_creation_uses_form_fields_that_exist,
        test_journal_creation_persists_entry_body,
        test_settings_lock_icon_is_imported_from_lucide,
        test_clear_data_uses_backend_clear_all_endpoint,
        test_module_registry_exists_and_drives_workspaces,
        test_additional_module_routes_are_registered,
        test_additional_modules_use_expected_item_types,
        test_automation_rules_are_local_and_testable,
        test_backend_uses_items_router,
        test_item_updates_accept_patch_and_put,
        test_app_uses_router_location_for_shared_routes,
        test_backend_smoke_uses_isolated_database,
        test_task_page_supports_editing_existing_tasks,
        test_task_done_status_is_persisted,
        test_mobile_layout_removes_desktop_phone_frame,
        test_workspace_selector_is_clickable_on_touch_devices,
        test_workspace_queries_are_url_encoded,
        test_delete_confirmation_uses_shared_ui,
        test_core_command_pages_support_editing_and_dates,
        test_vault_uses_in_app_file_preview,
        test_vault_supports_bulk_sequential_uploads,
        test_search_page_has_no_mock_recent_searches,
        test_vault_deletion_requires_security_phrase,
        test_chat_can_delete_vault_documents_after_phrase,
        test_chat_can_rename_vault_documents,
        test_vault_upload_uses_pdf_text_and_structured_extraction,
        test_rag_query_can_match_vault_titles_without_body,
        test_chat_can_send_vault_documents_by_email,
    ]

    failures = []
    for test in tests:
        try:
            test()
            print(f"PASS {test.__name__}")
        except AssertionError as exc:
            print(f"FAIL {test.__name__}: {exc}")
            failures.append(test.__name__)

    if failures:
        raise SystemExit(1)
