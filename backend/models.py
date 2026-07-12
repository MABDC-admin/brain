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
