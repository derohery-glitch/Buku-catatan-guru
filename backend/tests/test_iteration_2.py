"""Iteration 2 — New endpoint tests:
- GET /api/reports/comparison (default + explicit year/month incl. cross-year prev)
- GET /api/reports/export/json (auth gate, content-type, payload shape, isolation)
- POST /api/categories with custom icon round-trip
- Quick regression sanity for previously-passing endpoints.
"""
import io
import json
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8001").rstrip("/")


# ============================================================
# Helpers: insert transactions directly via API
# ============================================================
def _post_tx(api_client, auth, **kwargs):
    payload = {
        "type": kwargs.get("type", "expense"),
        "amount": kwargs["amount"],
        "category": kwargs["category"],
        "date": kwargs["date"],
        "note": kwargs.get("note", ""),
    }
    r = api_client.post(f"{BASE_URL}/api/transactions", json=payload, headers=auth)
    assert r.status_code == 200, r.text
    return r.json()


def _delete_tx(api_client, auth, tx_id):
    api_client.delete(f"{BASE_URL}/api/transactions/{tx_id}", headers=auth)


# ============================================================
# Auth guard on new endpoints
# ============================================================
class TestAuthGuardsNewEndpoints:
    def test_comparison_requires_bearer(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/reports/comparison")
        assert r.status_code == 401

    def test_comparison_rejects_bad_bearer(self, api_client):
        r = api_client.get(
            f"{BASE_URL}/api/reports/comparison",
            headers={"Authorization": "Bearer not_a_real_token_xyz"},
        )
        assert r.status_code == 401

    def test_export_json_requires_bearer(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/reports/export/json")
        assert r.status_code == 401

    def test_export_json_rejects_bad_bearer(self, api_client):
        r = api_client.get(
            f"{BASE_URL}/api/reports/export/json",
            headers={"Authorization": "Bearer not_a_real_token_xyz"},
        )
        assert r.status_code == 401


# ============================================================
# Comparison endpoint
# ============================================================
class TestReportComparison:
    @pytest.fixture(scope="class")
    def seed_cmp(self):
        """Seed transactions for User A in Jan 2025 (prev) and Feb 2025 (cur) so we can pin
        an explicit year/month and verify deltas deterministically."""
        api_client = requests.Session()
        api_client.headers.update({"Content-Type": "application/json"})
        auth = {"Authorization": "Bearer test_token_asatidz_v1"}
        created = []
        # Previous month: Jan 2025
        created.append(_post_tx(api_client, auth, type="income", amount=1000000,
                                category="Honor/Gaji Pondok", date="2025-01-10",
                                note="ITER2_prev_income"))
        created.append(_post_tx(api_client, auth, type="expense", amount=200000,
                                category="Konsumsi", date="2025-01-12",
                                note="ITER2_prev_konsumsi"))
        created.append(_post_tx(api_client, auth, type="expense", amount=50000,
                                category="Transportasi", date="2025-01-15",
                                note="ITER2_prev_transport"))
        # Current month: Feb 2025
        created.append(_post_tx(api_client, auth, type="income", amount=1500000,
                                category="Honor/Gaji Pondok", date="2025-02-05",
                                note="ITER2_cur_income"))
        created.append(_post_tx(api_client, auth, type="expense", amount=300000,
                                category="Konsumsi", date="2025-02-08",
                                note="ITER2_cur_konsumsi"))
        created.append(_post_tx(api_client, auth, type="expense", amount=100000,
                                category="Kesehatan", date="2025-02-20",
                                note="ITER2_cur_kesehatan"))
        yield {"auth": auth, "tx": created}
        for t in created:
            _delete_tx(api_client, auth, t["id"])

    def test_comparison_explicit_year_month_math(self, api_client, seed_cmp):
        r = api_client.get(
            f"{BASE_URL}/api/reports/comparison?year=2025&month=2",
            headers=seed_cmp["auth"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Structure
        for key in ("current", "previous", "delta", "categories"):
            assert key in data, f"missing key {key}"
        assert data["current"]["year"] == 2025 and data["current"]["month"] == 2
        assert data["previous"]["year"] == 2025 and data["previous"]["month"] == 1
        # Math (Feb vs Jan)
        assert data["current"]["total_income"] == 1500000
        assert data["current"]["total_expense"] == 400000  # 300k konsumsi + 100k kesehatan
        assert data["current"]["balance"] == 1100000
        assert data["previous"]["total_income"] == 1000000
        assert data["previous"]["total_expense"] == 250000  # 200k konsumsi + 50k transport
        assert data["previous"]["balance"] == 750000
        # Delta
        assert data["delta"]["income"] == 500000
        assert data["delta"]["expense"] == 150000
        assert data["delta"]["balance"] == 350000
        assert data["delta"]["income_pct"] == 50.0
        assert data["delta"]["expense_pct"] == 60.0

    def test_comparison_categories_sorted_by_abs_delta(self, api_client, seed_cmp):
        r = api_client.get(
            f"{BASE_URL}/api/reports/comparison?year=2025&month=2",
            headers=seed_cmp["auth"],
        )
        data = r.json()
        cats = data["categories"]
        # Expected categories: Konsumsi (delta 100k), Kesehatan (delta 100k), Transportasi (delta -50k)
        names = [c["category"] for c in cats]
        assert "Konsumsi" in names
        assert "Kesehatan" in names
        assert "Transportasi" in names
        # Sorted desc by abs(delta)
        abs_deltas = [abs(c["delta"]) for c in cats]
        assert abs_deltas == sorted(abs_deltas, reverse=True)
        # Per-category math
        by_name = {c["category"]: c for c in cats}
        assert by_name["Konsumsi"]["current"] == 300000
        assert by_name["Konsumsi"]["previous"] == 200000
        assert by_name["Konsumsi"]["delta"] == 100000
        assert by_name["Konsumsi"]["delta_pct"] == 50.0
        # Kesehatan had no prev -> delta_pct must be null (handles 0-prev case)
        assert by_name["Kesehatan"]["previous"] == 0
        assert by_name["Kesehatan"]["delta"] == 100000
        assert by_name["Kesehatan"]["delta_pct"] is None
        # Transportasi disappeared -> negative delta, pct based on b=50000
        assert by_name["Transportasi"]["current"] == 0
        assert by_name["Transportasi"]["previous"] == 50000
        assert by_name["Transportasi"]["delta"] == -50000
        assert by_name["Transportasi"]["delta_pct"] == -100.0

    def test_comparison_cross_year_prev(self, api_client):
        """year=2026 month=1 -> prev should be year=2025 month=12."""
        auth = {"Authorization": "Bearer test_token_asatidz_v1"}
        # Seed dec 2025 + jan 2026 specifically for this test
        seeded = []
        seeded.append(_post_tx(api_client, auth, type="expense", amount=77777,
                               category="Konsumsi", date="2025-12-20",
                               note="ITER2_cross_dec"))
        seeded.append(_post_tx(api_client, auth, type="expense", amount=88888,
                               category="Konsumsi", date="2026-01-15",
                               note="ITER2_cross_jan"))
        try:
            r = api_client.get(
                f"{BASE_URL}/api/reports/comparison?year=2026&month=1",
                headers=auth,
            )
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["current"]["year"] == 2026 and data["current"]["month"] == 1
            assert data["previous"]["year"] == 2025 and data["previous"]["month"] == 12
            assert data["current"]["total_expense"] == 88888
            assert data["previous"]["total_expense"] == 77777
        finally:
            for t in seeded:
                _delete_tx(api_client, auth, t["id"])

    def test_comparison_default_no_params(self, api_client):
        auth = {"Authorization": "Bearer test_token_asatidz_v1"}
        r = api_client.get(f"{BASE_URL}/api/reports/comparison", headers=auth)
        assert r.status_code == 200, r.text
        data = r.json()
        now = datetime.now(timezone.utc)
        assert data["current"]["year"] == now.year
        assert data["current"]["month"] == now.month
        # Prev month math
        prev_y, prev_m = (now.year, now.month - 1) if now.month > 1 else (now.year - 1, 12)
        assert data["previous"]["year"] == prev_y
        assert data["previous"]["month"] == prev_m
        # Delta keys present
        for k in ("income", "income_pct", "expense", "expense_pct", "balance"):
            assert k in data["delta"]

    def test_comparison_zero_prev_returns_null_pct(self, api_client):
        """When previous month has 0 income/expense, *_pct must be None (not divide-by-zero)."""
        auth = {"Authorization": "Bearer test_token_asatidz_v1"}
        # Use a far-past month combo where we know there's no data: March 2019 cur vs Feb 2019 prev
        seeded = []
        seeded.append(_post_tx(api_client, auth, type="income", amount=100,
                               category="Honor/Gaji Pondok", date="2019-03-05",
                               note="ITER2_zero_prev"))
        try:
            r = api_client.get(
                f"{BASE_URL}/api/reports/comparison?year=2019&month=3",
                headers=auth,
            )
            assert r.status_code == 200
            data = r.json()
            assert data["previous"]["total_income"] == 0
            assert data["previous"]["total_expense"] == 0
            assert data["delta"]["income_pct"] is None
            assert data["delta"]["expense_pct"] is None
        finally:
            for t in seeded:
                _delete_tx(api_client, auth, t["id"])


# ============================================================
# JSON Backup Export
# ============================================================
class TestExportJson:
    def test_export_json_content_type_and_shape(self, api_client):
        auth = {"Authorization": "Bearer test_token_asatidz_v1"}
        # Insert a tagged tx
        tx = _post_tx(api_client, auth, type="expense", amount=12345,
                      category="Konsumsi", date="2025-02-15",
                      note="ITER2_export_tag")
        try:
            r = api_client.get(f"{BASE_URL}/api/reports/export/json", headers=auth)
            assert r.status_code == 200
            assert r.headers["content-type"].startswith("application/json")
            assert "attachment" in r.headers.get("content-disposition", "").lower()
            payload = json.loads(r.content.decode("utf-8"))
            # Shape
            for key in ("exported_at", "user", "categories", "transactions"):
                assert key in payload, f"missing {key}"
            # exported_at is ISO
            datetime.fromisoformat(payload["exported_at"].replace("Z", "+00:00"))
            # user shape
            assert payload["user"]["email"] == "test.ustadz@asatidz.test"
            assert payload["user"]["name"] == "Ahmad"
            assert payload["user"]["gelar"] in ("Ustadz", None)
            # Categories: list of dicts, includes the 10 defaults at minimum
            assert isinstance(payload["categories"], list)
            assert len(payload["categories"]) >= 10
            # Transactions match
            assert isinstance(payload["transactions"], list)
            ids = [t["id"] for t in payload["transactions"]]
            assert tx["id"] in ids
            mine = next(t for t in payload["transactions"] if t["id"] == tx["id"])
            assert mine["amount"] == 12345
            assert mine["category"] == "Konsumsi"
            assert mine["date"] == "2025-02-15"
            assert mine["note"] == "ITER2_export_tag"
            # No user_id leaked, no voice blob leaked
            for t in payload["transactions"]:
                assert "user_id" not in t
                assert "voice_note_base64" not in t
        finally:
            _delete_tx(api_client, auth, tx["id"])

    def test_export_json_isolation_between_users(self, api_client):
        auth_a = {"Authorization": "Bearer test_token_asatidz_v1"}
        auth_b = {"Authorization": "Bearer test_token_asatidzah_v1"}
        marker = f"ITER2_iso_{uuid.uuid4().hex[:8]}"
        tx_a = _post_tx(api_client, auth_a, type="expense", amount=99999,
                        category="Konsumsi", date="2025-03-01", note=marker)
        try:
            r = api_client.get(f"{BASE_URL}/api/reports/export/json", headers=auth_b)
            assert r.status_code == 200
            payload = r.json()
            # User B export must not contain User A's tx id or marker note
            ids = {t["id"] for t in payload["transactions"]}
            notes = {t.get("note", "") for t in payload["transactions"]}
            assert tx_a["id"] not in ids
            assert marker not in notes
            assert payload["user"]["email"] == "test.ustadzah@asatidz.test"
        finally:
            _delete_tx(api_client, auth_a, tx_a["id"])


# ============================================================
# Custom Category icon round-trip
# ============================================================
class TestCategoryCustomIcon:
    def test_create_category_with_custom_icon_persists(self, api_client):
        auth = {"Authorization": "Bearer test_token_asatidz_v1"}
        cat_name = f"ITER2_Pulsa_{uuid.uuid4().hex[:6]}"
        r = api_client.post(
            f"{BASE_URL}/api/categories",
            json={"name": cat_name, "type": "expense", "icon": "smartphone"},
            headers=auth,
        )
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["icon"] == "smartphone"
        assert created["name"] == cat_name
        assert created["is_default"] is False
        cid = created["id"]
        try:
            # Round-trip via GET /api/categories
            r2 = api_client.get(f"{BASE_URL}/api/categories", headers=auth)
            assert r2.status_code == 200
            cats = r2.json()
            mine = next((c for c in cats if c["id"] == cid), None)
            assert mine is not None, "Created category not returned by GET"
            assert mine["icon"] == "smartphone"
            assert mine["type"] == "expense"
        finally:
            api_client.delete(f"{BASE_URL}/api/categories/{cid}", headers=auth)

    def test_create_category_default_icon_when_omitted(self, api_client):
        auth = {"Authorization": "Bearer test_token_asatidz_v1"}
        cat_name = f"ITER2_NoIcon_{uuid.uuid4().hex[:6]}"
        r = api_client.post(
            f"{BASE_URL}/api/categories",
            json={"name": cat_name, "type": "expense"},
            headers=auth,
        )
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["icon"] == "tag"  # default
        api_client.delete(f"{BASE_URL}/api/categories/{created['id']}", headers=auth)


# ============================================================
# Regression sanity (quick)
# ============================================================
class TestRegressionSanity:
    def test_auth_me(self, api_client):
        r = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": "Bearer test_token_asatidz_v1"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == "test.ustadz@asatidz.test"
        assert data["user_id"] == "user_test_asatidz"

    def test_transactions_crud(self, api_client):
        auth = {"Authorization": "Bearer test_token_asatidz_v1"}
        r = api_client.post(
            f"{BASE_URL}/api/transactions",
            json={"type": "expense", "amount": 1234, "category": "Konsumsi",
                  "date": "2025-04-01", "note": "ITER2_reg"},
            headers=auth,
        )
        assert r.status_code == 200
        tx = r.json()
        # GET
        g = api_client.get(f"{BASE_URL}/api/transactions/{tx['id']}", headers=auth)
        assert g.status_code == 200
        assert g.json()["amount"] == 1234
        # PUT
        p = api_client.put(
            f"{BASE_URL}/api/transactions/{tx['id']}",
            json={"type": "expense", "amount": 4321, "category": "Konsumsi",
                  "date": "2025-04-02", "note": "ITER2_reg_upd"},
            headers=auth,
        )
        assert p.status_code == 200
        assert p.json()["amount"] == 4321
        # DELETE
        d = api_client.delete(f"{BASE_URL}/api/transactions/{tx['id']}", headers=auth)
        assert d.status_code == 200
        # GET → 404
        g2 = api_client.get(f"{BASE_URL}/api/transactions/{tx['id']}", headers=auth)
        assert g2.status_code == 404

    def test_reports_summary(self, api_client):
        auth = {"Authorization": "Bearer test_token_asatidz_v1"}
        r = api_client.get(f"{BASE_URL}/api/reports/summary", headers=auth)
        assert r.status_code == 200
        data = r.json()
        for k in ("year", "month", "total_income", "total_expense", "balance",
                  "expense_by_category", "recent"):
            assert k in data

    def test_reports_export_excel_sanity(self, api_client):
        auth = {"Authorization": "Bearer test_token_asatidz_v1"}
        r = api_client.get(
            f"{BASE_URL}/api/reports/export/excel?from_year=2025&from_month=1&to_year=2025&to_month=12",
            headers=auth,
        )
        assert r.status_code == 200
        assert "spreadsheetml" in r.headers["content-type"]
        assert r.content[:2] == b"PK"  # xlsx zip magic

    def test_reports_export_pdf_sanity(self, api_client):
        auth = {"Authorization": "Bearer test_token_asatidz_v1"}
        r = api_client.get(
            f"{BASE_URL}/api/reports/export/pdf?from_year=2025&from_month=1&to_year=2025&to_month=12",
            headers=auth,
        )
        assert r.status_code == 200
        assert "application/pdf" in r.headers["content-type"]
        assert r.content[:4] == b"%PDF"
