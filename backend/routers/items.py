import os
import secrets
from typing import List

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from deps import get_db


router = APIRouter()


def model_data(model, *, exclude_unset: bool = False) -> dict:
    if hasattr(model, "model_dump"):
        return model.model_dump(exclude_unset=exclude_unset)
    return model.dict(exclude_unset=exclude_unset)


@router.get("/items", response_model=List[schemas.Item])
def read_items(skip: int = 0, limit: int = 100, workspace: str = "Personal", db: Session = Depends(get_db)):
    return (
        db.query(models.Item)
        .filter(models.Item.workspace == workspace)
        .order_by(models.Item.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.post("/items", response_model=schemas.Item)
def create_item(item: schemas.ItemCreate, db: Session = Depends(get_db)):
    db_item = models.Item(**model_data(item))
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.get("/items/type/{item_type}", response_model=List[schemas.Item])
def read_items_by_type(item_type: str, workspace: str = "Personal", db: Session = Depends(get_db)):
    return (
        db.query(models.Item)
        .filter(models.Item.type == item_type, models.Item.workspace == workspace)
        .order_by(models.Item.created_at.desc())
        .all()
    )


@router.api_route("/items/{item_id}", methods=["PATCH", "PUT"], response_model=schemas.Item)
def update_item(item_id: int, item: schemas.ItemBase, db: Session = Depends(get_db)):
    db_item = db.query(models.Item).filter(models.Item.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")
    for key, value in model_data(item, exclude_unset=True).items():
        setattr(db_item, key, value)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.delete("/items/{item_id}")
def delete_item(item_id: int, db: Session = Depends(get_db)):
    db_item = db.query(models.Item).filter(models.Item.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(db_item)
    db.commit()
    return {"ok": True}


@router.delete("/api/items/clear-all")
def clear_all_items(
    workspace: str = "Personal",
    x_clear_data_token: str | None = Header(default=None, alias="X-Clear-Data-Token"),
    db: Session = Depends(get_db),
):
    expected_token = os.getenv("CLEAR_DATA_TOKEN")
    if not expected_token or not x_clear_data_token or not secrets.compare_digest(x_clear_data_token, expected_token):
        raise HTTPException(status_code=403, detail="Clear data token is required")

    query = db.query(models.Item)
    if workspace != "*":
        query = query.filter(models.Item.workspace == workspace)
    deleted_count = query.delete(synchronize_session=False)
    db.commit()
    return {"ok": True, "deleted_count": deleted_count, "workspace": workspace}
