"""Backend API tests for Catatan Keuangan Asatidz."""
import base64
import uuid
from datetime import datetime, timezone

import pytest

from conftest import USER_A_ID, USER_B_ID  # noqa


# ============================================================
# Auth
# ============================================================
class TestAuth:
    def test_me_without_token_returns_401(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/auth/me")
        assert r.status_code == 401

    def test_me_with_invalid_token_returns_401(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/auth/me", headers={"Authorization": "Bearer bogus"})
        assert r.status_code == 401

    def test_me_with_valid_token(self, api_client, base_url, auth_a):
        r = api_client.get(f"{base_url}/api/auth/me", headers=auth_a)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["user_id"] == USER_A_ID
        assert d["email"] == "test.ustadz@asatidz.test"
        assert d["gelar"] in ("Ustadz", "Ustadzah")
        assert isinstance(d["reminder_hour"], int)

    def test_set_gelar_updates_name(self, api_client, base_url, auth_a):
        r = api_client.post(
            f"{base_url}/api/auth/gelar",
            json={"gelar": "Ustadz", "name": "Ahmad Fauzi"},
            headers=auth_a,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["gelar"] == "Ustadz"
        assert d["name"] == "Ahmad Fauzi"
        # Verify via GET
        me = api_client.get(f"{base_url}/api/auth/me", headers=auth_a).json()
        assert me["name"] == "Ahmad Fauzi"

    def test_set_reminder(self, api_client, base_url, auth_a):
        r = api_client.post(
            f"{base_url}/api/auth/reminder", json={"reminder_hour": 21}, headers=auth_a
        )
        assert r.status_code == 200, r.text
        assert r.json()["reminder_hour"] == 21
        me = api_client.get(f"{base_url}/api/auth/me", headers=auth_a).json()
        assert me["reminder_hour"] == 21

    def test_set_reminder_invalid_range_rejected(self, api_client, base_url, auth_a):
        r = api_client.post(
            f"{base_url}/api/auth/reminder", json={"reminder_hour": 25}, headers=auth_a
        )
        assert r.status_code == 422


# ============================================================
# Categories
# ============================================================
class TestCategories:
    def test_list_default_categories(self, api_client, base_url, auth_a):
        r = api_client.get(f"{base_url}/api/categories", headers=auth_a)
        assert r.status_code == 200, r.text
        cats = r.json()
        defaults = [c for c in cats if c["is_default"]]
        assert len(defaults) == 10, f"Expected 10 defaults, got {len(defaults)}"
        names = {c["name"] for c in defaults}
        assert "Honor/Gaji Pondok" in names
        assert "Konsumsi" in names

    def test_create_and_delete_custom_category(self, api_client, base_url, auth_a):
        unique = f"TEST_Pulsa_{uuid.uuid4().hex[:6]}"
        r = api_client.post(
            f"{base_url}/api/categories",
            json={"name": unique, "type": "expense", "icon": "tag"},
            headers=auth_a,
        )
        assert r.status_code == 200, r.text
        new = r.json()
        assert new["name"] == unique
        assert new["is_default"] is False
        cat_id = new["id"]
        # Verify it appears in list
        cats = api_client.get(f"{base_url}/api/categories", headers=auth_a).json()
        assert any(c["id"] == cat_id for c in cats)
        # Delete it
        d = api_client.delete(f"{base_url}/api/categories/{cat_id}", headers=auth_a)
        assert d.status_code == 200, d.text
        # Verify gone
        cats2 = api_client.get(f"{base_url}/api/categories", headers=auth_a).json()
        assert not any(c["id"] == cat_id for c in cats2)

    def test_cannot_delete_default_category(self, api_client, base_url, auth_a):
        cats = api_client.get(f"{base_url}/api/categories", headers=auth_a).json()
        default = next(c for c in cats if c["is_default"])
        r = api_client.delete(f"{base_url}/api/categories/{default['id']}", headers=auth_a)
        assert r.status_code == 400, r.text


# ============================================================
# Transactions
# ============================================================
class TestTransactions:
    def test_create_tx_valid(self, api_client, base_url, auth_a):
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        r = api_client.post(
            f"{base_url}/api/transactions",
            json={
                "type": "expense", "amount": 50000, "category": "Konsumsi",
                "date": today, "note": "TEST_makan_siang",
            },
            headers=auth_a,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert "id" in d
        assert d["amount"] == 50000
        assert d["date"] == today
        # Verify via GET
        g = api_client.get(f"{base_url}/api/transactions/{d['id']}", headers=auth_a)
        assert g.status_code == 200
        assert g.json()["category"] == "Konsumsi"

    def test_create_tx_amount_must_be_positive(self, api_client, base_url, auth_a):
        r = api_client.post(
            f"{base_url}/api/transactions",
            json={"type": "expense", "amount": 0, "category": "Konsumsi", "date": "2026-01-15"},
            headers=auth_a,
        )
        assert r.status_code == 422

    def test_create_tx_invalid_date(self, api_client, base_url, auth_a):
        r = api_client.post(
            f"{base_url}/api/transactions",
            json={"type": "expense", "amount": 1000, "category": "Konsumsi", "date": "15-01-2026"},
            headers=auth_a,
        )
        assert r.status_code == 400

    def test_filters_year_month_type_category_q(self, api_client, base_url, auth_a):
        # Seed multiple
        api_client.post(f"{base_url}/api/transactions",
            json={"type": "income", "amount": 1000000, "category": "Honor/Gaji Pondok",
                  "date": "2026-01-10", "note": "TEST_honor_jan"}, headers=auth_a)
        api_client.post(f"{base_url}/api/transactions",
            json={"type": "expense", "amount": 20000, "category": "Transportasi",
                  "date": "2026-01-12", "note": "TEST_ojek"}, headers=auth_a)
        api_client.post(f"{base_url}/api/transactions",
            json={"type": "expense", "amount": 30000, "category": "Konsumsi",
                  "date": "2025-12-31", "note": "TEST_kopi"}, headers=auth_a)

        # year + month
        r = api_client.get(f"{base_url}/api/transactions?year=2026&month=1", headers=auth_a)
        assert r.status_code == 200
        rows = r.json()
        assert all(t["date"].startswith("2026-01") for t in rows)
        assert len(rows) >= 2

        # type filter
        r = api_client.get(f"{base_url}/api/transactions?type=income", headers=auth_a)
        assert all(t["type"] == "income" for t in r.json())

        # category filter
        r = api_client.get(f"{base_url}/api/transactions?category=Transportasi", headers=auth_a)
        assert all(t["category"] == "Transportasi" for t in r.json())

        # q search (note)
        r = api_client.get(f"{base_url}/api/transactions?q=ojek", headers=auth_a)
        assert any("ojek" in (t.get("note") or "").lower() for t in r.json())

        # year only
        r = api_client.get(f"{base_url}/api/transactions?year=2025", headers=auth_a)
        assert all(t["date"].startswith("2025") for t in r.json())

    def test_update_transaction(self, api_client, base_url, auth_a):
        c = api_client.post(f"{base_url}/api/transactions",
            json={"type": "expense", "amount": 5000, "category": "Konsumsi",
                  "date": "2026-01-15", "note": "TEST_initial"}, headers=auth_a).json()
        u = api_client.put(
            f"{base_url}/api/transactions/{c['id']}",
            json={"type": "expense", "amount": 7500, "category": "Konsumsi",
                  "date": "2026-01-15", "note": "TEST_updated"},
            headers=auth_a,
        )
        assert u.status_code == 200, u.text
        assert u.json()["amount"] == 7500
        assert u.json()["note"] == "TEST_updated"
        g = api_client.get(f"{base_url}/api/transactions/{c['id']}", headers=auth_a).json()
        assert g["note"] == "TEST_updated"

    def test_delete_transaction(self, api_client, base_url, auth_a):
        c = api_client.post(f"{base_url}/api/transactions",
            json={"type": "expense", "amount": 1234, "category": "Konsumsi",
                  "date": "2026-01-16", "note": "TEST_del"}, headers=auth_a).json()
        d = api_client.delete(f"{base_url}/api/transactions/{c['id']}", headers=auth_a)
        assert d.status_code == 200
        g = api_client.get(f"{base_url}/api/transactions/{c['id']}", headers=auth_a)
        assert g.status_code == 404


# ============================================================
# Data isolation between users
# ============================================================
class TestDataIsolation:
    def test_user_b_cannot_see_user_a_tx(self, api_client, base_url, auth_a, auth_b):
        # Create one in user A
        c = api_client.post(f"{base_url}/api/transactions",
            json={"type": "expense", "amount": 8888, "category": "Konsumsi",
                  "date": "2026-01-17", "note": "TEST_isolation"}, headers=auth_a).json()
        # User B cannot GET it
        g = api_client.get(f"{base_url}/api/transactions/{c['id']}", headers=auth_b)
        assert g.status_code == 404
        # User B list should not include it
        lst = api_client.get(f"{base_url}/api/transactions?q=TEST_isolation", headers=auth_b).json()
        assert not any(t["id"] == c["id"] for t in lst)
        # User B cannot update / delete
        u = api_client.put(
            f"{base_url}/api/transactions/{c['id']}",
            json={"type": "expense", "amount": 1, "category": "Konsumsi",
                  "date": "2026-01-17", "note": "hijack"},
            headers=auth_b,
        )
        assert u.status_code == 404
        d = api_client.delete(f"{base_url}/api/transactions/{c['id']}", headers=auth_b)
        assert d.status_code == 404


# ============================================================
# Reports
# ============================================================
class TestReports:
    def test_summary_current_month(self, api_client, base_url, auth_a):
        r = api_client.get(f"{base_url}/api/reports/summary", headers=auth_a)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("year", "month", "total_income", "total_expense", "balance",
                  "expense_by_category", "recent"):
            assert k in d
        assert isinstance(d["expense_by_category"], list)
        assert isinstance(d["recent"], list)

    def test_summary_specific_month(self, api_client, base_url, auth_a):
        # Has data in 2026-01 from earlier tests
        r = api_client.get(f"{base_url}/api/reports/summary?year=2026&month=1", headers=auth_a)
        assert r.status_code == 200
        d = r.json()
        assert d["year"] == 2026 and d["month"] == 1
        assert d["total_income"] >= 1000000  # honor from earlier test
        assert d["total_expense"] > 0

    def test_range_report(self, api_client, base_url, auth_a):
        r = api_client.get(
            f"{base_url}/api/reports/range?from_year=2025&from_month=12&to_year=2026&to_month=1",
            headers=auth_a,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert "months" in d and len(d["months"]) == 2
        assert d["months"][0]["year"] == 2025 and d["months"][0]["month"] == 12
        assert d["months"][1]["year"] == 2026 and d["months"][1]["month"] == 1
        assert "biggest_expense_category" in d
        assert d["total_expense"] > 0

    def test_export_excel(self, api_client, base_url, auth_a):
        r = api_client.get(
            f"{base_url}/api/reports/export/excel?from_year=2025&from_month=12&to_year=2026&to_month=12",
            headers=auth_a,
        )
        assert r.status_code == 200, r.text
        assert "spreadsheetml" in r.headers.get("content-type", "")
        assert r.content[:2] == b"PK"  # xlsx is a zip
        assert len(r.content) > 500

    def test_export_pdf(self, api_client, base_url, auth_a):
        r = api_client.get(
            f"{base_url}/api/reports/export/pdf?from_year=2025&from_month=12&to_year=2026&to_month=12",
            headers=auth_a,
        )
        assert r.status_code == 200, r.text
        assert "application/pdf" in r.headers.get("content-type", "")
        assert r.content[:4] == b"%PDF"


# ============================================================
# Reminder
# ============================================================
class TestReminder:
    def test_reminder_status_flow(self, api_client, base_url, auth_b):
        # User B has no transactions yet for today
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        r = api_client.get(f"{base_url}/api/reminder/status", headers=auth_b)
        assert r.status_code == 200
        d = r.json()
        assert d["date"] == today
        assert d["logged_today"] is False
        # Add a tx for today
        api_client.post(f"{base_url}/api/transactions",
            json={"type": "expense", "amount": 100, "category": "Konsumsi",
                  "date": today, "note": "TEST_today"}, headers=auth_b)
        r = api_client.get(f"{base_url}/api/reminder/status", headers=auth_b)
        assert r.json()["logged_today"] is True


# ============================================================
# Voice endpoint (validation only)
# ============================================================
class TestVoice:
    def test_voice_requires_auth(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/voice/parse",
            json={"audio_base64": "AAAA", "mime": "audio/m4a"})
        assert r.status_code == 401

    def test_voice_invalid_base64(self, api_client, base_url, auth_a):
        # Invalid b64 string with bad chars
        r = api_client.post(
            f"{base_url}/api/voice/parse",
            json={"audio_base64": "@@@not_base64@@@", "mime": "audio/m4a"},
            headers=auth_a,
        )
        # Should reject as invalid b64 OR too short. Either way client error 400.
        assert r.status_code == 400, r.text

    def test_voice_too_short(self, api_client, base_url, auth_a):
        # Valid b64 but tiny payload (<1000 bytes)
        small = base64.b64encode(b"x" * 100).decode()
        r = api_client.post(
            f"{base_url}/api/voice/parse",
            json={"audio_base64": small, "mime": "audio/m4a"},
            headers=auth_a,
        )
        assert r.status_code == 400
