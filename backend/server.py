"""Catatan Keuangan Asatidz - Backend.

Personal finance tracker for Islamic boarding school teachers (Ustadz/Ustadzah).
Authentication via Emergent Google OAuth. All data scoped per `user_id`.
"""

import base64
import io
import json
import logging
import os
import re
import tempfile
import uuid
from datetime import datetime, timezone, timedelta, date
from pathlib import Path
from typing import List, Optional, Literal

import httpx
from fastapi import FastAPI, APIRouter, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

from emergentintegrations.llm.openai.speech_to_text import OpenAISpeechToText
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="Catatan Keuangan Asatidz API")
api = APIRouter(prefix="/api")

EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
SESSION_TTL_DAYS = 7

# Default kategori (per user, seeded on first login)
DEFAULT_CATEGORIES = [
    # Pemasukan
    {"name": "Honor/Gaji Pondok", "type": "income", "icon": "wallet"},
    {"name": "Infaq/Sedekah Diterima", "type": "income", "icon": "hand-heart"},
    {"name": "Pendapatan Lain", "type": "income", "icon": "plus-circle"},
    # Pengeluaran
    {"name": "Konsumsi", "type": "expense", "icon": "utensils"},
    {"name": "Transportasi", "type": "expense", "icon": "car"},
    {"name": "Kebutuhan Pribadi", "type": "expense", "icon": "shopping-bag"},
    {"name": "Infaq/Sedekah", "type": "expense", "icon": "heart"},
    {"name": "Pendidikan/Buku", "type": "expense", "icon": "book-open"},
    {"name": "Kesehatan", "type": "expense", "icon": "activity"},
    {"name": "Lain-lain", "type": "expense", "icon": "more-horizontal"},
]


# ============================================================
# Models
# ============================================================
class UserOut(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    gelar: Optional[Literal["Ustadz", "Ustadzah"]] = None
    reminder_hour: int = 20

class SessionRequest(BaseModel):
    session_id: str

class SessionResponse(BaseModel):
    user: UserOut
    token: str

class GelarRequest(BaseModel):
    gelar: Literal["Ustadz", "Ustadzah"]
    name: Optional[str] = None

class ReminderRequest(BaseModel):
    reminder_hour: int = Field(ge=0, le=23)

class TransactionIn(BaseModel):
    type: Literal["income", "expense"]
    amount: float = Field(gt=0)
    category: str
    date: str  # YYYY-MM-DD
    note: Optional[str] = ""
    voice_note_base64: Optional[str] = None  # base64 of recorded audio
    voice_note_mime: Optional[str] = None    # e.g. "audio/m4a" / "audio/webm"

class TransactionOut(TransactionIn):
    id: str

class VoiceParseIn(BaseModel):
    audio_base64: str
    mime: str = "audio/m4a"  # m4a (iOS/Android default) or webm (web)

class VoiceParseOut(BaseModel):
    transcription: str
    draft: Optional[dict] = None  # {type, amount, category, date, note}

class CategoryIn(BaseModel):
    name: str
    type: Literal["income", "expense"]
    icon: Optional[str] = "tag"

class CategoryOut(CategoryIn):
    id: str
    is_default: bool = False


# ============================================================
# Auth helper
# ============================================================
async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Tidak terotentikasi")
    token = authorization.split(" ", 1)[1].strip()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Sesi tidak ditemukan")
    expires_at = session["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Sesi kedaluwarsa")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Pengguna tidak ditemukan")
    return user


def user_public(u: dict) -> UserOut:
    return UserOut(
        user_id=u["user_id"],
        email=u["email"],
        name=u["name"],
        picture=u.get("picture"),
        gelar=u.get("gelar"),
        reminder_hour=u.get("reminder_hour", 20),
    )


async def seed_default_categories(user_id: str):
    existing = await db.categories.count_documents({"user_id": user_id})
    if existing > 0:
        return
    docs = [
        {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "name": c["name"],
            "type": c["type"],
            "icon": c["icon"],
            "is_default": True,
            "created_at": datetime.now(timezone.utc),
        }
        for c in DEFAULT_CATEGORIES
    ]
    await db.categories.insert_many(docs)


# ============================================================
# Auth Routes
# ============================================================
@api.post("/auth/session", response_model=SessionResponse)
async def auth_session(payload: SessionRequest):
    """Exchange Emergent one-time session_id for a session_token, upsert user, create session row, return token."""
    async with httpx.AsyncClient(timeout=15.0) as http:
        resp = await http.get(
            EMERGENT_SESSION_URL,
            headers={"X-Session-ID": payload.session_id},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Session tidak valid")
        data = resp.json()

    email = data["email"]
    name = data.get("name") or email.split("@")[0]
    picture = data.get("picture")
    session_token = data["session_token"]

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"picture": picture, "last_login_at": datetime.now(timezone.utc)}},
        )
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "gelar": None,
            "reminder_hour": 20,
            "created_at": datetime.now(timezone.utc),
            "last_login_at": datetime.now(timezone.utc),
        }
        await db.users.insert_one(user.copy())
        await seed_default_categories(user_id)

    # Upsert session row (idempotent on token)
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {
            "$set": {
                "session_token": session_token,
                "user_id": user_id,
                "created_at": datetime.now(timezone.utc),
                "expires_at": datetime.now(timezone.utc) + timedelta(days=SESSION_TTL_DAYS),
            }
        },
        upsert=True,
    )
    return SessionResponse(user=user_public(user), token=session_token)


@api.get("/auth/me", response_model=UserOut)
async def auth_me(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    return user_public(user)


@api.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


@api.post("/auth/gelar", response_model=UserOut)
async def set_gelar(payload: GelarRequest, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    update = {"gelar": payload.gelar}
    if payload.name and payload.name.strip():
        update["name"] = payload.name.strip()
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    user = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return user_public(user)


@api.post("/auth/reminder", response_model=UserOut)
async def set_reminder(payload: ReminderRequest, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    await db.users.update_one(
        {"user_id": user["user_id"]}, {"$set": {"reminder_hour": payload.reminder_hour}}
    )
    user = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return user_public(user)


# ============================================================
# Categories
# ============================================================
@api.get("/categories", response_model=List[CategoryOut])
async def list_categories(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    docs = await db.categories.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(500)
    return [
        CategoryOut(
            id=d["id"],
            name=d["name"],
            type=d["type"],
            icon=d.get("icon", "tag"),
            is_default=d.get("is_default", False),
        )
        for d in docs
    ]


@api.post("/categories", response_model=CategoryOut)
async def create_category(payload: CategoryIn, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nama kategori tidak boleh kosong")
    dupe = await db.categories.find_one(
        {"user_id": user["user_id"], "name": name, "type": payload.type}
    )
    if dupe:
        raise HTTPException(status_code=400, detail="Kategori sudah ada")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "name": name,
        "type": payload.type,
        "icon": payload.icon or "tag",
        "is_default": False,
        "created_at": datetime.now(timezone.utc),
    }
    await db.categories.insert_one(doc.copy())
    return CategoryOut(id=doc["id"], name=doc["name"], type=doc["type"], icon=doc["icon"], is_default=False)


@api.delete("/categories/{cat_id}")
async def delete_category(cat_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    cat = await db.categories.find_one({"id": cat_id, "user_id": user["user_id"]})
    if not cat:
        raise HTTPException(status_code=404, detail="Kategori tidak ditemukan")
    if cat.get("is_default"):
        raise HTTPException(status_code=400, detail="Kategori default tidak bisa dihapus")
    await db.categories.delete_one({"id": cat_id, "user_id": user["user_id"]})
    return {"ok": True}


# ============================================================
# Transactions
# ============================================================
def _tx_out(d: dict) -> TransactionOut:
    return TransactionOut(
        id=d["id"],
        type=d["type"],
        amount=d["amount"],
        category=d["category"],
        date=d["date"],
        note=d.get("note", ""),
        voice_note_base64=d.get("voice_note_base64"),
        voice_note_mime=d.get("voice_note_mime"),
    )


@api.get("/transactions", response_model=List[TransactionOut])
async def list_transactions(
    authorization: Optional[str] = Header(None),
    year: Optional[int] = None,
    month: Optional[int] = None,
    type: Optional[Literal["income", "expense"]] = None,
    category: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 500,
):
    user = await get_current_user(authorization)
    query: dict = {"user_id": user["user_id"]}
    if year and month:
        prefix = f"{year:04d}-{month:02d}"
        query["date"] = {"$regex": f"^{prefix}"}
    elif year:
        query["date"] = {"$regex": f"^{year:04d}"}
    if type:
        query["type"] = type
    if category:
        query["category"] = category
    if q:
        query["$or"] = [
            {"note": {"$regex": q, "$options": "i"}},
            {"category": {"$regex": q, "$options": "i"}},
        ]
    docs = await db.transactions.find(query, {"_id": 0}).sort("date", -1).to_list(limit)
    return [_tx_out(d) for d in docs]


@api.post("/transactions", response_model=TransactionOut)
async def create_transaction(payload: TransactionIn, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    # Validate date
    try:
        datetime.strptime(payload.date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Format tanggal salah (YYYY-MM-DD)")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "type": payload.type,
        "amount": float(payload.amount),
        "category": payload.category,
        "date": payload.date,
        "note": payload.note or "",
        "voice_note_base64": payload.voice_note_base64,
        "voice_note_mime": payload.voice_note_mime,
        "created_at": datetime.now(timezone.utc),
    }
    await db.transactions.insert_one(doc.copy())
    return _tx_out(doc)


@api.get("/transactions/{tx_id}", response_model=TransactionOut)
async def get_transaction(tx_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    d = await db.transactions.find_one({"id": tx_id, "user_id": user["user_id"]}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")
    return _tx_out(d)


@api.put("/transactions/{tx_id}", response_model=TransactionOut)
async def update_transaction(
    tx_id: str, payload: TransactionIn, authorization: Optional[str] = Header(None)
):
    user = await get_current_user(authorization)
    try:
        datetime.strptime(payload.date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Format tanggal salah (YYYY-MM-DD)")
    result = await db.transactions.update_one(
        {"id": tx_id, "user_id": user["user_id"]},
        {
            "$set": {
                "type": payload.type,
                "amount": float(payload.amount),
                "category": payload.category,
                "date": payload.date,
                "note": payload.note or "",
                "voice_note_base64": payload.voice_note_base64,
                "voice_note_mime": payload.voice_note_mime,
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")
    d = await db.transactions.find_one({"id": tx_id, "user_id": user["user_id"]}, {"_id": 0})
    return _tx_out(d)


@api.delete("/transactions/{tx_id}")
async def delete_transaction(tx_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    result = await db.transactions.delete_one({"id": tx_id, "user_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")
    return {"ok": True}


# ============================================================
# Reports
# ============================================================
async def _aggregate_for_month(user_id: str, year: int, month: int) -> dict:
    prefix = f"{year:04d}-{month:02d}"
    docs = await db.transactions.find(
        {"user_id": user_id, "date": {"$regex": f"^{prefix}"}}, {"_id": 0}
    ).to_list(2000)
    income = sum(d["amount"] for d in docs if d["type"] == "income")
    expense = sum(d["amount"] for d in docs if d["type"] == "expense")
    cat_breakdown: dict = {}
    for d in docs:
        if d["type"] == "expense":
            cat_breakdown[d["category"]] = cat_breakdown.get(d["category"], 0) + d["amount"]
    return {
        "year": year,
        "month": month,
        "total_income": income,
        "total_expense": expense,
        "balance": income - expense,
        "expense_by_category": [
            {"category": k, "amount": v} for k, v in sorted(cat_breakdown.items(), key=lambda x: -x[1])
        ],
    }


@api.get("/reports/summary")
async def report_summary(
    authorization: Optional[str] = Header(None),
    year: Optional[int] = None,
    month: Optional[int] = None,
):
    user = await get_current_user(authorization)
    now = datetime.now(timezone.utc)
    y = year or now.year
    m = month or now.month
    agg = await _aggregate_for_month(user["user_id"], y, m)
    # Recent transactions (all-time, top 10)
    recent = await db.transactions.find({"user_id": user["user_id"]}, {"_id": 0}).sort(
        "date", -1
    ).to_list(10)
    return {
        **agg,
        "recent": [_tx_out(d).dict() for d in recent],
    }


@api.get("/reports/range")
async def report_range(
    authorization: Optional[str] = Header(None),
    from_year: int = Query(...),
    from_month: int = Query(...),
    to_year: int = Query(...),
    to_month: int = Query(...),
):
    user = await get_current_user(authorization)
    months: List[dict] = []
    y, m = from_year, from_month
    safety = 0
    while (y, m) <= (to_year, to_month) and safety < 60:
        months.append(await _aggregate_for_month(user["user_id"], y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1
        safety += 1

    # Aggregated expense by category across range
    cat_total: dict = {}
    total_income = 0.0
    total_expense = 0.0
    for mo in months:
        total_income += mo["total_income"]
        total_expense += mo["total_expense"]
        for c in mo["expense_by_category"]:
            cat_total[c["category"]] = cat_total.get(c["category"], 0) + c["amount"]
    biggest_cat = max(cat_total.items(), key=lambda x: x[1])[0] if cat_total else None

    return {
        "months": months,
        "total_income": total_income,
        "total_expense": total_expense,
        "balance": total_income - total_expense,
        "expense_by_category": [
            {"category": k, "amount": v} for k, v in sorted(cat_total.items(), key=lambda x: -x[1])
        ],
        "biggest_expense_category": biggest_cat,
    }


@api.get("/reports/comparison")
async def report_comparison(
    authorization: Optional[str] = Header(None),
    year: Optional[int] = None,
    month: Optional[int] = None,
):
    """Bandingkan bulan yang dipilih (default: bulan berjalan) dengan bulan sebelumnya."""
    user = await get_current_user(authorization)
    now = datetime.now(timezone.utc)
    cur_y = year or now.year
    cur_m = month or now.month
    prev_y, prev_m = (cur_y, cur_m - 1) if cur_m > 1 else (cur_y - 1, 12)

    cur = await _aggregate_for_month(user["user_id"], cur_y, cur_m)
    prev = await _aggregate_for_month(user["user_id"], prev_y, prev_m)

    def pct(a: float, b: float) -> Optional[float]:
        if b <= 0:
            return None
        return round(((a - b) / b) * 100.0, 1)

    cur_cats = {c["category"]: c["amount"] for c in cur["expense_by_category"]}
    prev_cats = {c["category"]: c["amount"] for c in prev["expense_by_category"]}
    all_cats = sorted(set(list(cur_cats.keys()) + list(prev_cats.keys())))
    categories = []
    for name in all_cats:
        c = cur_cats.get(name, 0.0)
        p = prev_cats.get(name, 0.0)
        categories.append({
            "category": name,
            "current": c,
            "previous": p,
            "delta": c - p,
            "delta_pct": pct(c, p),
        })
    # sort by absolute delta desc (biggest movers first)
    categories.sort(key=lambda x: abs(x["delta"]), reverse=True)

    return {
        "current": {"year": cur_y, "month": cur_m, **{k: cur[k] for k in ("total_income", "total_expense", "balance")}},
        "previous": {"year": prev_y, "month": prev_m, **{k: prev[k] for k in ("total_income", "total_expense", "balance")}},
        "delta": {
            "income": cur["total_income"] - prev["total_income"],
            "income_pct": pct(cur["total_income"], prev["total_income"]),
            "expense": cur["total_expense"] - prev["total_expense"],
            "expense_pct": pct(cur["total_expense"], prev["total_expense"]),
            "balance": cur["balance"] - prev["balance"],
        },
        "categories": categories,
    }


@api.get("/reports/export/json")
async def export_json(authorization: Optional[str] = Header(None)):
    """Backup semua data user dalam JSON."""
    user = await get_current_user(authorization)
    txs = await db.transactions.find({"user_id": user["user_id"]}, {"_id": 0, "user_id": 0, "voice_note_base64": 0}).to_list(20000)
    cats = await db.categories.find({"user_id": user["user_id"]}, {"_id": 0, "user_id": 0}).to_list(500)
    payload = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "user": {
            "name": user["name"],
            "gelar": user.get("gelar"),
            "email": user["email"],
        },
        "categories": cats,
        "transactions": [
            {
                "id": t["id"],
                "type": t["type"],
                "amount": t["amount"],
                "category": t["category"],
                "date": t["date"],
                "note": t.get("note", ""),
            }
            for t in txs
        ],
    }
    body = json.dumps(payload, ensure_ascii=False, indent=2, default=str)
    fname = f"backup_asatidz_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M')}.json"
    return StreamingResponse(
        io.BytesIO(body.encode("utf-8")),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )


@api.get("/reminder/status")
async def reminder_status(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    count = await db.transactions.count_documents(
        {"user_id": user["user_id"], "date": today}
    )
    return {
        "logged_today": count > 0,
        "reminder_hour": user.get("reminder_hour", 20),
        "date": today,
    }


# ============================================================
# Voice (Whisper STT + LLM extraction)
# ============================================================
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

VOICE_SYSTEM_PROMPT = """Kamu adalah asisten pencatat keuangan. Diberi sebuah kalimat dalam Bahasa Indonesia yang diucapkan oleh seorang ustadz/ustadzah, ekstrak data transaksi keuangan menjadi JSON.

Format JSON yang HARUS kamu kembalikan (tanpa penjelasan, tanpa markdown):
{"type":"income"|"expense","amount":<angka>,"category":"<salah satu dari daftar>","note":"<ringkas dari kalimat>"}

Aturan:
- type: "expense" untuk pengeluaran/beli/bayar; "income" untuk pemasukan/honor/gaji/dapat.
- amount: ekstrak angka rupiah (mis. "lima puluh ribu"->50000, "dua ratus ribu"->200000, "1.5 juta"->1500000). HANYA angka, tanpa Rp, tanpa titik.
- category: pilih SATU dari daftar berikut:
  Pemasukan: "Honor/Gaji Pondok","Infaq/Sedekah Diterima","Pendapatan Lain"
  Pengeluaran: "Konsumsi","Transportasi","Kebutuhan Pribadi","Infaq/Sedekah","Pendidikan/Buku","Kesehatan","Lain-lain"
- Jika ambigu, pilih yang paling masuk akal.
- note: ringkas singkat (maks 60 karakter) dari kalimat aslinya.

Contoh:
Input: "Pengeluaran lima puluh ribu untuk makan siang"
Output: {"type":"expense","amount":50000,"category":"Konsumsi","note":"makan siang"}

Input: "Dapat honor mengajar 1.5 juta"
Output: {"type":"income","amount":1500000,"category":"Honor/Gaji Pondok","note":"honor mengajar"}

Jika kalimat tidak bisa diekstrak sebagai transaksi, kembalikan: {"error":"tidak_jelas"}
"""

_EXT_BY_MIME = {
    "audio/m4a": "m4a",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aac": "m4a",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/webm": "webm",
    "audio/ogg": "ogg",  # not in Whisper list but try
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
}


def _extract_json(text: str) -> Optional[dict]:
    # Strip markdown fences if any
    text = text.strip()
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to find first { ... } block
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                return None
    return None


@api.post("/voice/parse", response_model=VoiceParseOut)
async def voice_parse(payload: VoiceParseIn, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key belum dikonfigurasi")

    try:
        audio_bytes = base64.b64decode(payload.audio_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="audio_base64 tidak valid")
    if len(audio_bytes) < 1000:
        raise HTTPException(status_code=400, detail="Rekaman terlalu pendek")
    if len(audio_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Rekaman terlalu besar")

    ext = _EXT_BY_MIME.get(payload.mime.lower(), "m4a")
    # Whisper requires a file-like with a name; write to temp.
    with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
        result = await stt.transcribe(file=Path(tmp_path), model="whisper-1", language="id", response_format="json")
        transcription = result.text if hasattr(result, "text") else (result.get("text") if isinstance(result, dict) else str(result))
        transcription = (transcription or "").strip()
    except Exception as e:
        logger.exception("Whisper error")
        raise HTTPException(status_code=500, detail=f"Gagal transkripsi: {e}")
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    draft: Optional[dict] = None
    if transcription:
        try:
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"voice-{user['user_id']}-{uuid.uuid4().hex[:8]}",
                system_message=VOICE_SYSTEM_PROMPT,
            ).with_model("openai", "gpt-4o")
            reply = await chat.send_message(UserMessage(text=transcription))
            parsed = _extract_json(reply if isinstance(reply, str) else str(reply))
            if parsed and "error" not in parsed:
                # Add date = today
                parsed["date"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
                # Coerce
                try:
                    parsed["amount"] = int(round(float(parsed.get("amount", 0))))
                except (TypeError, ValueError):
                    parsed["amount"] = 0
                if parsed.get("type") not in ("income", "expense"):
                    parsed["type"] = "expense"
                draft = parsed
        except Exception as e:
            logger.warning(f"LLM parse failed: {e}")

    return VoiceParseOut(transcription=transcription, draft=draft)


# ============================================================
# Exports
# ============================================================
def _format_rupiah(n: float) -> str:
    return f"Rp {int(round(n)):,}".replace(",", ".")


@api.get("/reports/export/excel")
async def export_excel(
    authorization: Optional[str] = Header(None),
    from_year: int = Query(...),
    from_month: int = Query(...),
    to_year: int = Query(...),
    to_month: int = Query(...),
):
    from openpyxl import Workbook
    user = await get_current_user(authorization)
    from_prefix = f"{from_year:04d}-{from_month:02d}"
    to_prefix = f"{to_year:04d}-{to_month:02d}"
    docs = await db.transactions.find(
        {
            "user_id": user["user_id"],
            "date": {"$gte": from_prefix + "-01", "$lte": to_prefix + "-31"},
        },
        {"_id": 0},
    ).sort("date", 1).to_list(5000)

    wb = Workbook()
    ws = wb.active
    ws.title = "Transaksi"
    ws.append(["Tanggal", "Jenis", "Kategori", "Jumlah (Rp)", "Catatan"])
    total_in = 0.0
    total_out = 0.0
    for d in docs:
        ws.append([
            d["date"],
            "Pemasukan" if d["type"] == "income" else "Pengeluaran",
            d["category"],
            float(d["amount"]),
            d.get("note", ""),
        ])
        if d["type"] == "income":
            total_in += d["amount"]
        else:
            total_out += d["amount"]
    ws.append([])
    ws.append(["", "", "Total Pemasukan", total_in, ""])
    ws.append(["", "", "Total Pengeluaran", total_out, ""])
    ws.append(["", "", "Saldo", total_in - total_out, ""])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = f"laporan_{from_prefix}_to_{to_prefix}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )


@api.get("/reports/export/pdf")
async def export_pdf(
    authorization: Optional[str] = Header(None),
    from_year: int = Query(...),
    from_month: int = Query(...),
    to_year: int = Query(...),
    to_month: int = Query(...),
):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer

    user = await get_current_user(authorization)
    from_prefix = f"{from_year:04d}-{from_month:02d}"
    to_prefix = f"{to_year:04d}-{to_month:02d}"
    docs = await db.transactions.find(
        {
            "user_id": user["user_id"],
            "date": {"$gte": from_prefix + "-01", "$lte": to_prefix + "-31"},
        },
        {"_id": 0},
    ).sort("date", 1).to_list(5000)

    total_in = sum(d["amount"] for d in docs if d["type"] == "income")
    total_out = sum(d["amount"] for d in docs if d["type"] == "expense")
    cat_breakdown: dict = {}
    for d in docs:
        if d["type"] == "expense":
            cat_breakdown[d["category"]] = cat_breakdown.get(d["category"], 0) + d["amount"]

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=36, rightMargin=36, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("title", parent=styles["Title"], textColor=colors.HexColor("#4A6B53"))
    story = []

    gelar = user.get("gelar") or "Ustadz"
    name = user.get("name", "")
    story.append(Paragraph(f"Laporan Keuangan - {gelar} {name}", title_style))
    story.append(Paragraph(f"Periode: {from_prefix} s.d. {to_prefix}", styles["Normal"]))
    story.append(Spacer(1, 12))

    summary_data = [
        ["Total Pemasukan", _format_rupiah(total_in)],
        ["Total Pengeluaran", _format_rupiah(total_out)],
        ["Saldo Akhir", _format_rupiah(total_in - total_out)],
    ]
    if cat_breakdown:
        biggest = max(cat_breakdown.items(), key=lambda x: x[1])
        summary_data.append(["Pengeluaran Terbesar", f"{biggest[0]} ({_format_rupiah(biggest[1])})"])
    t = Table(summary_data, colWidths=[200, 200])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#E8EBE6")),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#1A241B")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E4DF")),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E2E4DF")),
                ("FONTSIZE", (0, 0), (-1, -1), 11),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(t)
    story.append(Spacer(1, 18))

    # Detail
    story.append(Paragraph("Rincian Transaksi", styles["Heading2"]))
    tbl_data = [["Tanggal", "Jenis", "Kategori", "Jumlah", "Catatan"]]
    for d in docs:
        tbl_data.append([
            d["date"],
            "Pemasukan" if d["type"] == "income" else "Pengeluaran",
            d["category"],
            _format_rupiah(d["amount"]),
            (d.get("note") or "")[:40],
        ])
    if len(tbl_data) == 1:
        tbl_data.append(["-", "-", "-", "-", "Tidak ada transaksi"])
    detail = Table(tbl_data, colWidths=[70, 75, 110, 90, 140])
    detail.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4A6B53")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#E2E4DF")),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E2E4DF")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAF9F6")]),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(detail)

    doc.build(story)
    buf.seek(0)
    fname = f"laporan_{from_prefix}_to_{to_prefix}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )


# ============================================================
# App boot
# ============================================================
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.transactions.create_index([("user_id", 1), ("date", -1)])
    await db.categories.create_index([("user_id", 1), ("name", 1), ("type", 1)])
    logger.info("Indexes ready")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


@api.get("/")
async def root():
    return {"ok": True, "app": "Catatan Keuangan Asatidz"}
