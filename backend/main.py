from fastapi import FastAPI, Depends, UploadFile, File, HTTPException, Request, Form
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import httpx
import base64
import uuid
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import smtplib
from email.message import EmailMessage
from datetime import datetime

SMTP_EMAIL = os.getenv('SMTP_EMAIL')
SMTP_PASSWORD = os.getenv('SMTP_PASSWORD')

import fitz
from dotenv import load_dotenv

load_dotenv()
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

import models, schemas
from database import SessionLocal, engine

models.Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("uploads", exist_ok=True)
app.mount("/static", StaticFiles(directory="uploads"), name="static")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/items", response_model=List[schemas.Item])
def read_items(skip: int = 0, limit: int = 100, workspace: str = "Personal", db: Session = Depends(get_db)):
    items = db.query(models.Item).filter(models.Item.workspace == workspace).order_by(models.Item.created_at.desc()).offset(skip).limit(limit).all()
    return items

@app.post("/items", response_model=schemas.Item)
def create_item(item: schemas.ItemCreate, db: Session = Depends(get_db)):
    db_item = models.Item(**item.dict())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

@app.get("/items/type/{item_type}", response_model=List[schemas.Item])
def read_items_by_type(item_type: str, workspace: str = "Personal", db: Session = Depends(get_db)):
    return db.query(models.Item).filter(models.Item.type == item_type, models.Item.workspace == workspace).order_by(models.Item.created_at.desc()).all()

@app.patch("/items/{item_id}", response_model=schemas.Item)
def update_item(item_id: int, item: schemas.ItemBase, db: Session = Depends(get_db)):
    db_item = db.query(models.Item).filter(models.Item.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")
    for key, value in item.dict(exclude_unset=True).items():
        setattr(db_item, key, value)
    db.commit()
    db.refresh(db_item)
    return db_item

@app.delete("/items/{item_id}")
def delete_item(item_id: int, db: Session = Depends(get_db)):
    db_item = db.query(models.Item).filter(models.Item.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(db_item)
    db.commit()
    return {"ok": True}


@app.post("/api/scan", response_model=List[schemas.Item])
async def scan_files(files: List[UploadFile] = File(...), db: Session = Depends(get_db)):
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="OpenRouter API key is not configured.")
    
    created_items = []
    
    async with httpx.AsyncClient() as client:
        for file in files:
            contents = await file.read()
            mime_type = file.content_type or "image/jpeg"
            
            if mime_type == "application/pdf":
                try:
                    pdf_doc = fitz.open(stream=contents, filetype="pdf")
                    page = pdf_doc.load_page(0)
                    pix = page.get_pixmap()
                    contents = pix.tobytes("jpeg")
                    mime_type = "image/jpeg"
                    pdf_doc.close()
                except Exception as e:
                    raise HTTPException(status_code=400, detail=f"Failed to parse PDF: {str(e)}")
            
            base64_image = base64.b64encode(contents).decode("utf-8")
            
            # Save file locally
            ext = mime_type.split("/")[-1]
            if ext == "jpeg": ext = "jpg"
            filename = f"{uuid.uuid4()}.{ext}"
            filepath = os.path.join("uploads", filename)
            with open(filepath, "wb") as f:
                f.write(contents)
                
            image_url = f"http://localhost:8001/static/{filename}"
            
            payload = {
                "model": "openai/gpt-4o",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Extract the following from this image: 1. A short title, 2. A short subtitle, 3. The document expiry date (if any, otherwise output 'None'). Format your response exactly as: Title|Subtitle|ExpiryDate. Do not include any other text."},
                            {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{base64_image}"}}
                        ]
                    }
                ]
            }
            
            headers = {
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json"
            }
            
            response = await client.post("https://openrouter.ai/api/v1/chat/completions", json=payload, headers=headers, timeout=60.0)
            
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=f"OCR API failed: {response.text}")
                
            data = response.json()
            ocr_text = data["choices"][0]["message"]["content"]
            
            parts = ocr_text.split("|")
            title = parts[0].strip() if len(parts) > 0 else "Scanned Note"
            subtitle = parts[1].strip() if len(parts) > 1 else "Note • Today"
            expiry_date = parts[2].strip() if len(parts) > 2 else "None"
            
            if expiry_date.lower() == "none" or not expiry_date:
                expiry_date = None
            
            # Default to Personal workspace for auto-scanned notes unless specified
            item_data = schemas.ItemCreate(type="note", title=title, subtitle=subtitle, image_url=image_url, expiry_date=expiry_date, workspace="Personal")
            db_item = models.Item(**item_data.dict())
            db.add(db_item)
            db.commit()
            db.refresh(db_item)
            created_items.append(db_item)
            
    return created_items


@app.post("/api/chat")
async def chat_with_ai(request: Request, db: Session = Depends(get_db)):
    from fastapi import Request as _R
    if not OPENROUTER_API_KEY:
        return {"reply": "⚠️ No API key. Go to Settings → AI & Privacy to add your OpenRouter key."}
    data    = await request.json()
    message = data.get("message", "")
    history = data.get("history", [])

    items = db.query(models.Item).order_by(models.Item.created_at.desc()).limit(80).all()
    by_type = {}
    for i in items:
        by_type.setdefault(i.type, []).append(f"  • {i.title} ({i.subtitle})")
    context_lines = []
    for t, rows in by_type.items():
        context_lines.append(f"[{t.upper()}S]"); context_lines.extend(rows[:15])
    context = "\n".join(context_lines) if context_lines else "No data yet."

    system_prompt = f"""You are Command Brain AI — a smart, concise personal assistant in a life-organiser app.
User's data:
{context}
Reply in 2-4 sentences. Use data above for specific answers. Be warm but brief."""

    messages_payload = [{"role": "system", "content": system_prompt}]
    for h in history[-10:]:
        messages_payload.append({"role": h["role"], "content": h["content"]})
    messages_payload.append({"role": "user", "content": message})

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"},
            json={"model": "openai/gpt-4o", "messages": messages_payload},
            timeout=30.0,
        )
    if resp.status_code != 200:
        return {"reply": f"❌ API error {resp.status_code}. Check your OpenRouter key."}
    return {"reply": resp.json()["choices"][0]["message"]["content"]}


@app.post("/api/receipt")
async def parse_receipt(files: List[UploadFile] = File(...), db: Session = Depends(get_db)):
    """Parse a receipt image → extract individual line items as separate expenses."""
    import json as _json
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="No API key configured.")
    created = []
    async with httpx.AsyncClient() as client:
        for file in files:
            contents  = await file.read()
            mime_type = file.content_type or "image/jpeg"
            if mime_type == "application/pdf":
                pdf_doc   = fitz.open(stream=contents, filetype="pdf")
                pix       = pdf_doc.load_page(0).get_pixmap()
                contents  = pix.tobytes("jpeg"); mime_type = "image/jpeg"; pdf_doc.close()
            b64      = base64.b64encode(contents).decode()
            ext      = "jpg" if mime_type.endswith("jpeg") else mime_type.split("/")[-1]
            filename = f"{uuid.uuid4()}.{ext}"
            with open(os.path.join("uploads", filename), "wb") as f: f.write(contents)
            image_url = f"http://localhost:8001/static/{filename}"

            prompt = (
                "This is a receipt. Extract each line item with its price. "
                "Return ONLY a JSON array: "
                '[{"item":"Coffee","price":12.5,"category":"Food & Drinks"}]. '
                "Categories: Food & Drinks, Transport, Shopping, Bills & Utilities, Entertainment, Health, Other. "
                "No markdown, raw JSON only."
            )
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"},
                json={"model": "openai/gpt-4o", "messages": [{"role": "user", "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{b64}"}}
                ]}]},
                timeout=60.0,
            )
            try:
                raw = resp.json()["choices"][0]["message"]["content"].strip()
                if raw.startswith("```"): raw = "\n".join(raw.split("\n")[1:-1])
                line_items = _json.loads(raw)
            except Exception:
                line_items = [{"item": "Receipt scan", "price": 0, "category": "Other"}]
            for li in line_items:
                db_item = models.Item(
                    type="expense",
                    title=f"{float(li.get('price',0)):.2f} AED {li.get('item','Item')}",
                    subtitle=f"{li.get('category','Other')} • Today",
                    image_url=image_url,
                )
                db.add(db_item); db.commit(); db.refresh(db_item)
                created.append(db_item)
    return created

class RAGRequest(BaseModel):
    query: str
    workspace: str = "Personal"

@app.post("/api/rag_query")
async def rag_query(request: RAGRequest, db: Session = Depends(get_db)):
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="OpenRouter API key is not configured.")
        
    docs = db.query(models.Item).filter(
        models.Item.workspace == request.workspace,
        models.Item.type.in_(["vault_file", "note"])
    ).all()
    
    if not docs:
        return {"answer": "You don't have any documents in this workspace yet. Upload some files to the Vault to get started!"}
        
    context_blocks = []
    for d in docs:
        if d.body:
            context_blocks.append(f"Document: {d.title}\\n{d.body}\\n---")
            
    context_str = "\\n".join(context_blocks)
    if not context_str.strip():
        return {"answer": "I found some files, but they don't have any readable text inside them yet."}
        
    prompt = f"""You are a helpful Vault Assistant.
Use ONLY the following context from the user's private documents to answer their query.
If the answer is not contained within the context, say "I couldn't find that in your vault documents."

CONTEXT:
{context_str}

USER QUERY:
{request.query}
"""

    async with httpx.AsyncClient() as client:
        payload = {
            "model": "openai/gpt-4o-mini",
            "messages": [{"role": "user", "content": prompt}]
        }
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json"
        }
        response = await client.post("https://openrouter.ai/api/v1/chat/completions", json=payload, headers=headers, timeout=30.0)
        
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail="AI query failed")
            
        data = response.json()
        answer = data["choices"][0]["message"]["content"]
        
    return {"answer": answer}

def send_expiry_email(to_email: str, doc_title: str, expiry_date: str, days_left: int = 0):
    import os
    MABDC_MAIL_API_KEY = os.getenv('MABDC_MAIL_API_KEY')
    if not MABDC_MAIL_API_KEY:
        print(f"[MOCK EMAIL] To {to_email}: '{doc_title}' expires in {days_left} days on {expiry_date}")
        return
        
    try:
        import requests
        url = 'https://api-mail.mabdc.com/v1/emails'
        headers = {
            'Authorization': f'Bearer {MABDC_MAIL_API_KEY}',
            'Content-Type': 'application/json'
        }
        
        html_body = f"""
        <div style="font-family: sans-serif; color: #333;">
            <h2>Command Brain Vault Alert</h2>
            <p>Hello,</p>
            <p>This is an automated reminder.</p>
            <p>Your document <strong>'{doc_title}'</strong> is expiring on <strong>{expiry_date}</strong> (in {days_left} days).</p>
            <p>Please take necessary actions to renew or update this document.</p>
            <br/>
            <p>Vault AI</p>
        </div>
        """
        
        payload = {
            'to': to_email,
            'from': 'vault-ai@mabdc.org',
            'subject': f"Action Required: '{doc_title}' expires in {days_left} days",
            'html': html_body
        }
        
        resp = requests.post(url, headers=headers, json=payload, timeout=10)
        
        if resp.status_code in [200, 202]:
            print(f"Sent expiry email for '{doc_title}' to {to_email} via api-mail.mabdc.com")
        else:
            print(f"Email API failed: {resp.status_code} {resp.text}")
    except Exception as e:
        print(f"Email failed: {e}")


def check_expirations_and_notify():
    db = SessionLocal()
    try:
        items = db.query(models.Item).filter(models.Item.expiry_date != None).all()
        today = datetime.now()
        for item in items:
            try:
                # Assuming expiry_date is formatted as 'DD MMM YYYY' or 'YYYY-MM-DD'
                # Let's try to parse common formats
                exp_date_str = item.expiry_date.strip()
                if exp_date_str.lower() == 'none':
                    continue
                exp_date = None
                formats = ['%d %b %Y', '%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%B %d, %Y']
                for fmt in formats:
                    try:
                        exp_date = datetime.strptime(exp_date_str, fmt)
                        break
                    except ValueError:
                        pass
                
                if exp_date:
                    delta = (exp_date - today).days
                    # Send notification on 30, 15, 10, 5 days
                    if delta in [30, 15, 10, 5]:
                        send_expiry_email('sottodennis@gmail.com', item.title, exp_date_str, delta)
            except Exception as e:
                print(f"Error parsing expiry date for item {item.id}: {e}")
    finally:
        db.close()

scheduler = BackgroundScheduler()
scheduler.add_job(check_expirations_and_notify, CronTrigger(hour=8, minute=0))
scheduler.start()

@app.on_event('shutdown')
def shutdown_event():
    scheduler.shutdown()

@app.post("/api/vault_upload")
async def vault_upload(file: UploadFile = File(...), workspace: str = Form("Company"), db: Session = Depends(get_db)):
    print(f"Vault Upload triggered for {file.filename} ({file.content_type})")
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="OpenRouter API key is not configured.")

    contents = await file.read()
    mime_type = file.content_type or "application/pdf"
    
    base64_image = ""
    is_image = False

    # Convert PDF to image if needed
    if "pdf" in mime_type.lower() or file.filename.lower().endswith(".pdf"):
        try:
            pdf_doc = fitz.open(stream=contents, filetype="pdf")
            page = pdf_doc.load_page(0)
            pix = page.get_pixmap()
            base64_image = base64.b64encode(pix.tobytes("jpeg")).decode("utf-8")
            mime_type = "image/jpeg"
            is_image = True
            pdf_doc.close()
        except Exception as e:
            print("PDF Parse error:", e)
    elif mime_type.startswith("image/"):
        base64_image = base64.b64encode(contents).decode("utf-8")
        is_image = True
    
    # Save locally
    ext = file.filename.split('.')[-1] if '.' in file.filename else "file"
    filename = f"{uuid.uuid4()}.{ext}"
    os.makedirs("uploads", exist_ok=True)
    with open(f"uploads/{filename}", "wb") as f:
        f.write(contents)

    image_url = f"https://brain.mabdc.com/static/{filename}"

    prompt = "Extract from this document: 1. Category (e.g., Tax, ID, Employee Contract), 2. The Expiry Date (if any, exactly as 'DD MMM YYYY', else 'None'), 3. THE FULL READABLE TEXT of the document for search indexing. Format exactly as: Category|ExpiryDate|FullText"

    ocr_text = "Document|None|"
    
    if is_image and base64_image:
        try:
            async with httpx.AsyncClient() as client:
                payload = {
                    "model": "openai/gpt-4o",
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": prompt},
                                {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{base64_image}"}}
                            ]
                        }
                    ]
                }
                headers = {"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"}
                response = await client.post("https://openrouter.ai/api/v1/chat/completions", json=payload, headers=headers, timeout=60.0)
                
                if response.status_code == 200:
                    data = response.json()
                    ocr_text = data["choices"][0]["message"]["content"]
                else:
                    print("AI Error:", response.status_code, response.text)
        except Exception as e:
            print("AI Exception:", e)

    parts = ocr_text.split("|", 2)
    category = parts[0].strip() if len(parts) > 0 else "Document"
    expiry = parts[1].strip() if len(parts) > 1 else "None"
    full_text = parts[2].strip() if len(parts) > 2 else ""

    vault_item = models.Item(
        type="vault_file",
        title=file.filename,
        subtitle=f"{category} • Processed today",
        body=full_text,
        image_url=image_url,
        workspace=workspace
    )
    db.add(vault_item)

    if expiry.lower() != "none" and len(expiry) > 4:
        reminder_item = models.Item(
            type="reminder",
            title=f"Renew: {file.filename}",
            subtitle=f"Expires {expiry}",
            workspace=workspace
        )
        db.add(reminder_item)
        send_expiry_email("sottodennis@gmail.com", file.filename, expiry)

    db.commit()
    print(f"Vault Upload Success for {file.filename}")
    return {"status": "success"}

from pydantic import BaseModel
class VoiceMemoRequest(BaseModel):
    transcript: str
    workspace: str = 'Personal'

@app.post('/api/vault_voice')
async def vault_voice(request: VoiceMemoRequest, db: Session = Depends(get_db)):
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail='OpenRouter API key is not configured.')

    prompt = f'Analyze the following voice memo transcript. Extract: 1. A short title (max 5 words), 2. A one-sentence summary, 3. A single Tag (e.g. Taxes, Ideas, Meeting, Medical, Contract, Personal). Format exactly as: Title|Summary|Tag\n\nTranscript: {request.transcript}'

    async with httpx.AsyncClient() as client:
        payload = {
            'model': 'openai/gpt-4o-mini',
            'messages': [{'role': 'user', 'content': prompt}]
        }
        headers = {'Authorization': f'Bearer {OPENROUTER_API_KEY}', 'Content-Type': 'application/json'}
        response = await client.post('https://openrouter.ai/api/v1/chat/completions', json=payload, headers=headers, timeout=30.0)

        if response.status_code != 200:
            raise HTTPException(status_code=500, detail='AI processing failed')

        data = response.json()
        ai_text = data['choices'][0]['message']['content']

        parts = ai_text.split('|', 2)
        title = parts[0].strip() if len(parts) > 0 else 'Voice Memo'
        summary = parts[1].strip() if len(parts) > 1 else 'Voice dictation'
        tag = parts[2].strip() if len(parts) > 2 else 'Memo'

        vault_item = models.Item(
            type='vault_file',
            title=f'🎙️ {title}',
            subtitle=summary,
            body=request.transcript,
            tags=tag,
            workspace=request.workspace
        )
        db.add(vault_item)
        db.commit()
        db.refresh(vault_item)
        return vault_item

@app.post('/items/{item_id}/share')
def share_item(item_id: int, db: Session = Depends(get_db)):
    import datetime
    db_item = db.query(models.Item).filter(models.Item.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail='Item not found')
    
    db_item.share_token = str(uuid.uuid4())
    db_item.share_expires_at = datetime.datetime.utcnow() + datetime.timedelta(hours=24)
    db.commit()
    db.refresh(db_item)
    return {'share_token': db_item.share_token, 'expires_at': db_item.share_expires_at}

@app.get('/api/shared/{token}')
def get_shared_item(token: str, db: Session = Depends(get_db)):
    import datetime
    db_item = db.query(models.Item).filter(models.Item.share_token == token).first()
    if not db_item:
        raise HTTPException(status_code=404, detail='Link invalid or expired')
    
    if db_item.share_expires_at and db_item.share_expires_at < datetime.datetime.utcnow():
        raise HTTPException(status_code=404, detail='Link expired')
        
    return db_item
