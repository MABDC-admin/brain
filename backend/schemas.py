from pydantic import BaseModel
try:
    from pydantic import ConfigDict
except ImportError:
    ConfigDict = None
from datetime import datetime
from typing import Optional

class ItemBase(BaseModel):
    type: str
    title: str
    subtitle: str
    image_url: Optional[str] = None
    expiry_date: Optional[str] = None
    workspace: Optional[str] = "Personal"
    is_locked: Optional[bool] = False
    body: Optional[str] = None
    tags: Optional[str] = None
    share_token: Optional[str] = None
    share_expires_at: Optional[datetime] = None

class ItemCreate(ItemBase):
    pass

class Item(ItemBase):
    id: int
    created_at: datetime

    if ConfigDict:
        model_config = ConfigDict(from_attributes=True)
    else:
        class Config:
            orm_mode = True
