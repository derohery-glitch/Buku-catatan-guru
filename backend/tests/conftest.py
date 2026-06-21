"""Shared fixtures: seed two test users with sessions before tests run."""
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8001").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

USER_A_ID = "user_test_asatidz"
USER_A_TOKEN = "test_token_asatidz_v1"
USER_A_EMAIL = "test.ustadz@asatidz.test"

USER_B_ID = "user_test_asatidzah"
USER_B_TOKEN = "test_token_asatidzah_v1"
USER_B_EMAIL = "test.ustadzah@asatidz.test"

DEFAULTS = [
    ("Honor/Gaji Pondok", "income", "wallet"),
    ("Infaq/Sedekah Diterima", "income", "hand-heart"),
    ("Pendapatan Lain", "income", "plus-circle"),
    ("Konsumsi", "expense", "utensils"),
    ("Transportasi", "expense", "car"),
    ("Kebutuhan Pribadi", "expense", "shopping-bag"),
    ("Infaq/Sedekah", "expense", "heart"),
    ("Pendidikan/Buku", "expense", "book-open"),
    ("Kesehatan", "expense", "activity"),
    ("Lain-lain", "expense", "more-horizontal"),
]


def _seed_user(db, user_id, email, name, gelar, token):
    now = datetime.now(timezone.utc)
    db.users.update_one(
        {"user_id": user_id},
        {"$set": {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": None,
            "gelar": gelar,
            "reminder_hour": 20,
            "created_at": now,
        }},
        upsert=True,
    )
    db.user_sessions.update_one(
        {"session_token": token},
        {"$set": {
            "session_token": token,
            "user_id": user_id,
            "created_at": now,
            "expires_at": now + timedelta(days=7),
        }},
        upsert=True,
    )
    existing = db.categories.count_documents({"user_id": user_id})
    if existing == 0:
        db.categories.insert_many([
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "name": n, "type": t, "icon": i,
                "is_default": True,
                "created_at": now,
            }
            for (n, t, i) in DEFAULTS
        ])


@pytest.fixture(scope="session", autouse=True)
def seed_db():
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=2000)
    try:
        client.admin.command('ping')
    except Exception as e:
        pytest.skip(f"MongoDB not available at {MONGO_URL}: {e}")

    db = client[DB_NAME]
    # Clean any previous test transactions for both users
    db.transactions.delete_many({"user_id": {"$in": [USER_A_ID, USER_B_ID]}})
    # Wipe custom (non-default) categories
    db.categories.delete_many({"user_id": {"$in": [USER_A_ID, USER_B_ID]}, "is_default": False})
    _seed_user(db, USER_A_ID, USER_A_EMAIL, "Ahmad", "Ustadz", USER_A_TOKEN)
    _seed_user(db, USER_B_ID, USER_B_EMAIL, "Fatimah", "Ustadzah", USER_B_TOKEN)
    yield
    # Cleanup transactions after suite
    db.transactions.delete_many({"user_id": {"$in": [USER_A_ID, USER_B_ID]}})
    db.categories.delete_many({"user_id": {"$in": [USER_A_ID, USER_B_ID]}, "is_default": False})
    client.close()


@pytest.fixture
def base_url():
    return BASE_URL


@pytest.fixture
def auth_a():
    return {"Authorization": f"Bearer {USER_A_TOKEN}"}


@pytest.fixture
def auth_b():
    return {"Authorization": f"Bearer {USER_B_TOKEN}"}


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s
