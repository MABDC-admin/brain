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
