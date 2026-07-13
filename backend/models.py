from sqlalchemy import Column, Integer, String, DateTime, Boolean
from database import Base
import datetime

class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, index=True) # "task", "reminder", "expense", "note"
    title = Column(String, index=True)
    subtitle = Column(String)
    image_url = Column(String, nullable=True)
    expiry_date = Column(String, nullable=True)
    workspace = Column(String, default="Personal", index=True)
    is_locked = Column(Boolean, default=False, index=True)
    body = Column(String, nullable=True)
    tags = Column(String, nullable=True)
    share_token = Column(String, nullable=True, index=True)
    share_expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class AssistantAudit(Base):
    __tablename__ = "assistant_audit"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(String, index=True)
    risk_level = Column(Integer, default=0, index=True)
    status = Column(String, default="completed", index=True)
    target_type = Column(String, nullable=True, index=True)
    target_id = Column(Integer, nullable=True, index=True)
    summary = Column(String)
    request_text = Column(String, nullable=True)
    payload = Column(String, nullable=True)
    confirmation_token = Column(String, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
