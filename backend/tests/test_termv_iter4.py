"""Iteration 4 tests: swap sanity, credit warnings, window default 24h, notifications counters."""
import os
import time
import requests
import pytest
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

def _base():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if not v:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    v = line.split("=", 1)[1].strip()
                    break
    return v.rstrip("/")

BASE = _base()
API = f"{BASE}/api"

ADMIN = "admintest_session"
STU_REAL = "stu_real"          # PGP41071, 6.0 credits, 7 courses
STU_5 = "stu_pgp41473"          # PGP41473, 5.0 credits

# Real data snapshot from Mongo
GIVE_COURSE_1CR = "course_5ba8cf77d6"          # AGRICULTURAL COMMODITY DERIVATIVES MARKETS (PGP41071 owns) 1.0cr
GIVE_SECTION_1CR = "section_4ea1351e07"
WANT_COURSE_1CR = "course_14c5fd75e9"          # BUSINESS TO BUSINESS MARKETING (partner ABM22041 owns) 1.0cr
WANT_SECTION_1CR = "section_bf327f43d0"
PARTNER_1CR = "ABM22041"

WANT_COURSE_05 = "course_aaf9afce28"           # EXPERIENTIAL LEARNING (partner PGP41034 owns) 0.5cr
WANT_SECTION_05 = "section_c27032e337"
PARTNER_05 = "PGP41034"

# Own course (already have) — partner ABM22011 has same course/section
ALREADY_COURSE = "course_f5bc482e50"           # ADVANCED ORAL COMMUNICATION (PGP41071 also owns)
ALREADY_SECTION = "section_76f1901cda"
PARTNER_ALREADY = "ABM22011"

# ADD test course (PGP41071 doesn't have; 1.0cr)
ADD_COURSE = WANT_COURSE_1CR
ADD_SECTION = WANT_SECTION_1CR


def H(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def _cleanup_requests():
    """Cleanup any requests created by these tests."""
    from pymongo import MongoClient
    mc = MongoClient(os.environ["MONGO_URL"])
    db = mc[os.environ["DB_NAME"]]
    # Snapshot request_ids present before
    before = {d["request_id"] for d in db.requests.find({}, {"request_id": 1})}
    yield
    after = list(db.requests.find({"request_id": {"$nin": list(before)}}, {"request_id": 1, "student_pgpid": 1}))
    ids = [d["request_id"] for d in after]
    if ids:
        db.requests.delete_many({"request_id": {"$in": ids}})
    mc.close()


# --- Swap validation ---
class TestSwapValidation:
    def test_course_swap_already_owned_want(self):
        r = requests.post(f"{API}/student/requests", headers=H(STU_REAL), json={
            "request_type": "COURSE_SWAP",
            "comment": "TEST already-owned",
            "partner_pgpid": PARTNER_ALREADY,
            "give_course_id": GIVE_COURSE_1CR,
            "give_section_id": GIVE_SECTION_1CR,
            "want_course_id": ALREADY_COURSE,
            "want_section_id": ALREADY_SECTION,
        })
        assert r.status_code == 400, r.text
        assert "already have" in r.text.lower()

    def test_course_swap_cross_credit(self):
        r = requests.post(f"{API}/student/requests", headers=H(STU_REAL), json={
            "request_type": "COURSE_SWAP",
            "comment": "TEST cross-credit",
            "partner_pgpid": PARTNER_05,
            "give_course_id": GIVE_COURSE_1CR,      # 1.0cr
            "give_section_id": GIVE_SECTION_1CR,
            "want_course_id": WANT_COURSE_05,       # 0.5cr
            "want_section_id": WANT_SECTION_05,
        })
        assert r.status_code == 400, r.text
        assert "cross-credit" in r.text.lower()

    def test_course_swap_valid_same_credit(self):
        r = requests.post(f"{API}/student/requests", headers=H(STU_REAL), json={
            "request_type": "COURSE_SWAP",
            "comment": "TEST valid same-credit swap",
            "partner_pgpid": PARTNER_1CR,
            "give_course_id": GIVE_COURSE_1CR,
            "give_section_id": GIVE_SECTION_1CR,
            "want_course_id": WANT_COURSE_1CR,
            "want_section_id": WANT_SECTION_1CR,
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "AWAITING_PARTNER_CONFIRMATION"
        assert body["swap"]["kind"] == "COURSE"
        # cleanup: cancel this request so future runs are idempotent
        rid = body["request_id"]
        requests.post(f"{API}/student/requests/{rid}/cancel", headers=H(STU_REAL))


# --- Credit warnings (non-blocking) ---
class TestCreditWarnings:
    def test_add_above_max_warns(self):
        # PGP41071 has 6.0 credits — adding a 1.0cr course => projected 7.0
        r = requests.post(f"{API}/student/requests", headers=H(STU_REAL), json={
            "request_type": "ADD",
            "comment": "TEST add-above-max",
            "add_course_id": ADD_COURSE,
            "add_section_id": ADD_SECTION,
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "SUBMITTED"
        assert body["credit_note"] is not None
        note = body["credit_note"].lower()
        assert "7.0" in note and "above" in note and "6.0" in note
        # cleanup
        requests.post(f"{API}/student/requests/{body['request_id']}/cancel", headers=H(STU_REAL))

    def test_drop_below_min_warns(self):
        # PGP41473 has 5.0 credits — dropping any course drops below 5
        # Get their enrollments
        d = requests.get(f"{API}/student/dashboard", headers=H(STU_5)).json()
        drop_course = d["courses"][0]
        # Need drop_course_id/section_id — dashboard returns course_code/section_name; need ids from timetable? Use enrollments via a helper endpoint.
        # /student/dashboard courses include ids? check keys
        # Fall back to /student/timetable which returns similar fields; else query DB directly
        from pymongo import MongoClient
        mc = MongoClient(os.environ["MONGO_URL"])
        db = mc[os.environ["DB_NAME"]]
        en = db.enrollments.find_one({"pgpid": "PGP41473"})
        mc.close()
        r = requests.post(f"{API}/student/requests", headers=H(STU_5), json={
            "request_type": "DROP",
            "comment": "TEST drop-below-min",
            "drop_course_id": en["course_id"],
            "drop_section_id": en["section_id"],
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "SUBMITTED"
        assert body["credit_note"] is not None
        assert "below" in body["credit_note"].lower() and "5.0" in body["credit_note"]
        requests.post(f"{API}/student/requests/{body['request_id']}/cancel", headers=H(STU_5))


# --- Window default 24h ---
class TestWindow24h:
    def test_default_24h_when_no_closes_at(self):
        r = requests.put(f"{API}/admin/window", headers=H(ADMIN), json={"enabled": True})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["is_open"] is True
        assert body.get("closes_at")
        # verify GET returns it
        g = requests.get(f"{API}/window", headers=H(ADMIN)).json()
        assert g.get("closes_at")
        # closes_at should be ~ now + 24h
        from datetime import datetime, timezone
        closes = datetime.fromisoformat(body["closes_at"].replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        delta_h = (closes - now).total_seconds() / 3600
        assert 23.5 < delta_h < 24.5, f"expected ~24h, got {delta_h}"

    def test_extend_window(self):
        from datetime import datetime, timezone, timedelta
        new_close = (datetime.now(timezone.utc) + timedelta(hours=48)).isoformat().replace("+00:00", "Z")
        r = requests.put(f"{API}/admin/window", headers=H(ADMIN), json={"enabled": True, "closes_at": new_close})
        assert r.status_code == 200
        body = r.json()
        assert body["closes_at"]
        # cleanup: restore to 24h default
        requests.put(f"{API}/admin/window", headers=H(ADMIN), json={"enabled": True})


# --- Notifications ---
class TestNotifications:
    def test_unread_count_and_read_all(self):
        # ensure baseline for partner - read all first
        requests.post(f"{API}/student/notifications/read-all", headers=H(STU_5))
        c0 = requests.get(f"{API}/student/notifications/unread-count", headers=H(STU_5)).json()
        assert c0.get("count") == 0

        # STU_REAL sends a section swap to STU_5? They aren't in same section — use course swap using a course PGP41473 has that PGP41071 doesnt
        # PGP41473 has course_c415bde864 (BOTTOM OF PYRAMID, 1.0cr), PGP41071 doesn't have it
        # PGP41071 gives GIVE_COURSE_1CR (1.0cr), wants course_c415bde864 from PGP41473
        # Need section_id for PGP41473's enrollment
        from pymongo import MongoClient
        mc = MongoClient(os.environ["MONGO_URL"])
        db = mc[os.environ["DB_NAME"]]
        en = db.enrollments.find_one({"pgpid": "PGP41473", "course_id": "course_c415bde864"})
        mc.close()
        assert en is not None
        r = requests.post(f"{API}/student/requests", headers=H(STU_REAL), json={
            "request_type": "COURSE_SWAP",
            "comment": "TEST notify",
            "partner_pgpid": "PGP41473",
            "give_course_id": GIVE_COURSE_1CR,
            "give_section_id": GIVE_SECTION_1CR,
            "want_course_id": en["course_id"],
            "want_section_id": en["section_id"],
        })
        assert r.status_code == 200, r.text
        rid = r.json()["request_id"]

        c1 = requests.get(f"{API}/student/notifications/unread-count", headers=H(STU_5)).json()
        assert c1["count"] >= 1

        # read-all
        r2 = requests.post(f"{API}/student/notifications/read-all", headers=H(STU_5))
        assert r2.status_code == 200
        c2 = requests.get(f"{API}/student/notifications/unread-count", headers=H(STU_5)).json()
        assert c2["count"] == 0

        # cleanup — cancel request
        requests.post(f"{API}/student/requests/{rid}/cancel", headers=H(STU_REAL))
