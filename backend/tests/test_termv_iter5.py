"""Iteration 5 tests: per-student quotas, non-blocking clash notes, no-withdrawal cancel."""
import os
import requests
import pytest
from dotenv import load_dotenv
from pymongo import MongoClient
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
STU_REAL = "stu_real"   # PGP41071
STU_5 = "stu_pgp41473"  # PGP41473

# Real Term V snapshot (PGP41071 does NOT own these)
GIVE_COURSE_1CR = "course_5ba8cf77d6"      # PGP41071 owns (Mon/Tue 14:30-16:00)
GIVE_SECTION_1CR = "section_4ea1351e07"

# CLASH: Fri/Sat 10:30-12:00 matches PGP41071's BEHAVIORAL FINANCE
CLASH_COURSE = "course_14c5fd75e9"          # BUSINESS TO BUSINESS MARKETING 1.0cr
CLASH_SECTION = "section_bf327f43d0"

# NO-CLASH: Mon/Tue 18:00-19:30 (not owned)
NOCLASH_COURSE = "course_5d822e2445"
NOCLASH_SECTION = "section_1843cd011d"

# Partner who owns CLASH_COURSE — used for COURSE_SWAP clash test
PARTNER_1CR = "ABM22041"


def H(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def _mongo():
    mc = MongoClient(os.environ["MONGO_URL"])
    return mc, mc[os.environ["DB_NAME"]]


def _wipe(pgpid):
    mc, db = _mongo()
    db.requests.delete_many({"student_pgpid": pgpid})
    # swap-partner requests where they are the partner
    db.requests.delete_many({"swap.partner_pgpid": pgpid})
    db.notifications.delete_many({"pgpid": pgpid})
    mc.close()


@pytest.fixture(autouse=True)
def _clean():
    _wipe("PGP41071")
    _wipe("PGP41473")
    yield
    _wipe("PGP41071")
    _wipe("PGP41473")


# ---------- Quota endpoint shape ----------
class TestQuotaEndpoint:
    def test_quota_shape_and_defaults(self):
        r = requests.get(f"{API}/student/quota", headers=H(STU_REAL))
        assert r.status_code == 200, r.text
        q = r.json()
        for k in ["add_used", "add_limit", "drop_used", "drop_limit",
                  "course_swap_used", "course_swap_limit",
                  "section_swap_used", "section_swap_limit"]:
            assert k in q, f"missing {k}"
        assert q["add_limit"] == 1
        assert q["drop_limit"] == 1
        assert q["course_swap_limit"] == 2
        assert q["section_swap_limit"] == 2
        assert q["add_used"] == 0
        assert q["drop_used"] == 0
        assert q["course_swap_used"] == 0
        assert q["section_swap_used"] == 0

    def test_quota_requires_student_auth(self):
        r = requests.get(f"{API}/student/quota")
        assert r.status_code in (401, 403)


# ---------- Quota enforcement ----------
class TestQuotaEnforcement:
    def _submit_add(self, section=NOCLASH_SECTION, course=NOCLASH_COURSE, token=STU_REAL):
        return requests.post(f"{API}/student/requests", headers=H(token), json={
            "request_type": "ADD", "comment": "TEST", "add_course_id": course, "add_section_id": section,
        })

    def test_second_add_blocked(self):
        r1 = self._submit_add()
        assert r1.status_code == 200, r1.text
        # quota should now reflect 1
        q = requests.get(f"{API}/student/quota", headers=H(STU_REAL)).json()
        assert q["add_used"] == 1
        r2 = self._submit_add(section=CLASH_SECTION, course=CLASH_COURSE)
        assert r2.status_code == 403, r2.text
        assert "limit of 1 Add" in r2.text

    def test_second_drop_blocked(self):
        payload = {"request_type": "DROP", "comment": "TEST",
                   "drop_course_id": GIVE_COURSE_1CR, "drop_section_id": GIVE_SECTION_1CR}
        r1 = requests.post(f"{API}/student/requests", headers=H(STU_REAL), json=payload)
        assert r1.status_code == 200, r1.text
        # Try a second DROP on a different course
        payload2 = {"request_type": "DROP", "comment": "TEST",
                    "drop_course_id": "course_f5bc482e50", "drop_section_id": "section_76f1901cda"}
        r2 = requests.post(f"{API}/student/requests", headers=H(STU_REAL), json=payload2)
        assert r2.status_code == 403
        assert "limit of 1 Drop" in r2.text

    def test_add_drop_blocked_if_add_used(self):
        # First an ADD
        r1 = self._submit_add()
        assert r1.status_code == 200
        # Now ADD_DROP should be blocked
        r2 = requests.post(f"{API}/student/requests", headers=H(STU_REAL), json={
            "request_type": "ADD_DROP", "comment": "TEST",
            "add_course_id": CLASH_COURSE, "add_section_id": CLASH_SECTION,
            "drop_course_id": GIVE_COURSE_1CR, "drop_section_id": GIVE_SECTION_1CR,
        })
        assert r2.status_code == 403
        assert "Add/Drop" in r2.text or "limit" in r2.text.lower()

    def test_third_course_swap_blocked(self):
        # Seed 2 pretend-active COURSE_SWAP requests directly for PGP41071 to test enforcement only
        mc, db = _mongo()
        from datetime import datetime, timezone
        for i in range(2):
            db.requests.insert_one({
                "request_id": f"seed_cs_{i}", "student_pgpid": "PGP41071",
                "request_type": "COURSE_SWAP", "status": "AWAITING_PARTNER_CONFIRMATION",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "history": [], "actions": [], "swap": {"kind": "COURSE", "partner_pgpid": "X"},
                "clash_note": None, "credit_note": None,
            })
        mc.close()

        q = requests.get(f"{API}/student/quota", headers=H(STU_REAL)).json()
        assert q["course_swap_used"] == 2

        # 3rd must be blocked by quota BEFORE any validation
        r3 = requests.post(f"{API}/student/requests", headers=H(STU_REAL), json={
            "request_type": "COURSE_SWAP", "comment": "TEST3", "partner_pgpid": PARTNER_1CR,
            "give_course_id": GIVE_COURSE_1CR, "give_section_id": GIVE_SECTION_1CR,
            "want_course_id": CLASH_COURSE, "want_section_id": CLASH_SECTION,
        })
        assert r3.status_code == 403, r3.text
        assert "Course Swap" in r3.text

    def test_third_section_swap_blocked(self):
        mc, db = _mongo()
        from datetime import datetime, timezone
        for i in range(2):
            db.requests.insert_one({
                "request_id": f"seed_ss_{i}", "student_pgpid": "PGP41071",
                "request_type": "SECTION_SWAP", "status": "AWAITING_PARTNER_CONFIRMATION",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "history": [], "actions": [], "swap": {"kind": "SECTION", "partner_pgpid": "X"},
                "clash_note": None, "credit_note": None,
            })
        mc.close()
        r3 = requests.post(f"{API}/student/requests", headers=H(STU_REAL), json={
            "request_type": "SECTION_SWAP", "comment": "TEST",
            "partner_pgpid": "X", "swap_course_id": "course_23647c32e8",
            "my_section_id": "section_54649c621c", "requested_section_id": "section_bf327f43d0",
        })
        assert r3.status_code == 403, r3.text
        assert "Section Swap" in r3.text

    def test_rejected_does_not_consume(self):
        # Submit ADD then mark it REJECTED directly in DB, then submit another ADD → should succeed.
        r1 = requests.post(f"{API}/student/requests", headers=H(STU_REAL), json={
            "request_type": "ADD", "comment": "TESTr1",
            "add_course_id": NOCLASH_COURSE, "add_section_id": NOCLASH_SECTION,
        })
        assert r1.status_code == 200, r1.text
        rid = r1.json()["request_id"]
        mc, db = _mongo()
        db.requests.update_one({"request_id": rid}, {"$set": {"status": "REJECTED"}})
        mc.close()
        q = requests.get(f"{API}/student/quota", headers=H(STU_REAL)).json()
        assert q["add_used"] == 0
        r2 = requests.post(f"{API}/student/requests", headers=H(STU_REAL), json={
            "request_type": "ADD", "comment": "TESTr2",
            "add_course_id": CLASH_COURSE, "add_section_id": CLASH_SECTION,
        })
        assert r2.status_code == 200, r2.text


# ---------- Clash detection (non-blocking) ----------
class TestClashNote:
    def test_add_clash_sets_note(self):
        r = requests.post(f"{API}/student/requests", headers=H(STU_REAL), json={
            "request_type": "ADD", "comment": "TEST clash",
            "add_course_id": CLASH_COURSE, "add_section_id": CLASH_SECTION,
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "SUBMITTED"
        assert body.get("clash_note"), f"expected clash_note, got {body}"
        note = body["clash_note"]
        assert "Fri / Sat" in note and "10:30-12:00" in note and "BEHAVIORAL FINANCE" in note

    def test_add_noclash_note_null(self):
        r = requests.post(f"{API}/student/requests", headers=H(STU_REAL), json={
            "request_type": "ADD", "comment": "TEST noclash",
            "add_course_id": NOCLASH_COURSE, "add_section_id": NOCLASH_SECTION,
        })
        assert r.status_code == 200, r.text
        assert r.json().get("clash_note") is None

    def test_course_swap_clash_excludes_given(self):
        # Give AGRICULTURAL (Mon/Tue 14:30-16:00), want CLASH_COURSE (Fri/Sat 10:30-12:00, clashes with BEHAVIORAL)
        r = requests.post(f"{API}/student/requests", headers=H(STU_REAL), json={
            "request_type": "COURSE_SWAP", "comment": "TEST cs clash",
            "partner_pgpid": PARTNER_1CR,
            "give_course_id": GIVE_COURSE_1CR, "give_section_id": GIVE_SECTION_1CR,
            "want_course_id": CLASH_COURSE, "want_section_id": CLASH_SECTION,
        })
        assert r.status_code == 200, r.text
        note = r.json().get("clash_note")
        assert note and "BEHAVIORAL FINANCE" in note

    def test_section_swap_clash_excludes_same_course(self):
        # Section swap of BEHAVIORAL: request its own section, keeping same course_id excluded
        # Behavioral course_23647c32e8, currently owned in POST-A section? Get owned section
        mc, db = _mongo()
        en = db.enrollments.find_one({"pgpid": "PGP41071", "course_id": "course_23647c32e8"})
        # pick a different section of same course
        alt = db.sections.find_one({"course_id": "course_23647c32e8", "section_id": {"$ne": en["section_id"]}})
        mc.close()
        if not alt:
            pytest.skip("no alt section for BEHAVIORAL FINANCE")
        # Need a partner who owns alt section
        mc, db = _mongo()
        partner = db.enrollments.find_one({"course_id": "course_23647c32e8", "section_id": alt["section_id"], "pgpid": {"$ne": "PGP41071"}})
        mc.close()
        if not partner:
            pytest.skip("no partner for section swap")
        r = requests.post(f"{API}/student/requests", headers=H(STU_REAL), json={
            "request_type": "SECTION_SWAP", "comment": "TEST ss",
            "partner_pgpid": partner["pgpid"],
            "swap_course_id": "course_23647c32e8",
            "my_section_id": en["section_id"],
            "requested_section_id": alt["section_id"],
        })
        # Should be 200 (may or may not clash based on section slot). We only assert
        # that own-course (course_23647c32e8) is EXCLUDED from clashes — i.e., no self clash reported.
        assert r.status_code == 200, r.text
        note = r.json().get("clash_note")
        if note:
            assert "BEHAVIORAL FINANCE" not in note


# ---------- No-withdrawal ----------
class TestNoWithdrawal:
    def test_cancel_always_403(self):
        r = requests.post(f"{API}/student/requests", headers=H(STU_REAL), json={
            "request_type": "ADD", "comment": "TEST nc",
            "add_course_id": NOCLASH_COURSE, "add_section_id": NOCLASH_SECTION,
        })
        assert r.status_code == 200
        rid = r.json()["request_id"]
        c = requests.post(f"{API}/student/requests/{rid}/cancel", headers=H(STU_REAL))
        assert c.status_code == 403
        assert "cannot be withdrawn" in c.text.lower()

    def test_cancel_non_owner_also_403(self):
        # random id also 403 (endpoint always 403 for students)
        c = requests.post(f"{API}/student/requests/does-not-exist/cancel", headers=H(STU_REAL))
        assert c.status_code == 403


# ---------- Regression sanity ----------
class TestRegression:
    def test_admin_rbac_blocks_student(self):
        r = requests.get(f"{API}/admin/dashboard", headers=H(STU_REAL))
        assert r.status_code == 403

    def test_notifications_unread_count(self):
        r = requests.get(f"{API}/student/notifications/unread-count", headers=H(STU_REAL))
        assert r.status_code == 200
        assert "count" in r.json()

    def test_excel_export(self):
        r = requests.get(f"{API}/admin/export", headers=H(ADMIN))
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith(
            "application/vnd.openxmlformats-officedocument.spreadsheetml"
        )
        assert len(r.content) > 100
