"""
Iteration 8 tests:
  - Admin Clear-All trading board (DELETE /api/admin/trading)
  - Credit-sum COURSE_SWAP end-to-end (multi-give / single-get, credits summing)
  - Credit-mismatch guard (400)
  - RequestDetail data completeness for multi-give swap (arrays populated)
  - Legacy 1:1 COURSE_SWAP + SECTION_SWAP quick regression (submit->confirm->approve->execute)
  - Full timetable exposes no capacity/strength
  - Request-quota + window-closed gate
"""

import os
import io
import time
import requests
import pytest
import pymongo

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL missing"
API = f"{BASE}/api"

STU = "stu_real"              # PGP41071 (initiator)
STU_PGPID = "PGP41071"
STU2 = "stu_pgp41473"         # PGP41473
STU2_PGPID = "PGP41473"
ADMIN = "admintest_session"

PARTNER_PGPID = "PGP41409"    # Has BPIM-J, no Algo.Invt/Beh.Fin (chosen from master data)
PARTNER_TOKEN = "stu_41409_iter8"
PARTNER2_PGPID = "PGP41034"
PARTNER2_TOKEN = "stu_41034_iter8"

TERMV_XLSX = "/tmp/termv.xlsx"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
mclient = pymongo.MongoClient(MONGO_URL)
mdb = mclient[DB_NAME]


def h(tok):
    return {"Authorization": f"Bearer {tok}"}


def cid(code):
    c = mdb.courses.find_one({"course_code": code})
    assert c, f"course {code} missing"
    return c["course_id"]


def sec(course_id, section_name):
    s = mdb.sections.find_one({"course_id": course_id, "section_name": section_name})
    assert s, f"section {section_name} of {course_id} missing"
    return s["section_id"]


def any_sec(course_id):
    s = mdb.sections.find_one({"course_id": course_id})
    assert s, f"no section for {course_id}"
    return s["section_id"], s["section_name"]


def inject_session(pgpid, tok):
    """Create or reuse user and inject session token."""
    stu = mdb.students.find_one({"pgpid": pgpid})
    assert stu, f"student {pgpid} not seeded"
    email = stu["email"].lower()
    existing = mdb.users.find_one({"email": email})
    if existing:
        uid = existing["user_id"]
        mdb.users.update_one({"user_id": uid}, {"$set": {"role": "student", "pgpid": pgpid, "active": True}})
    else:
        uid = f"user_iter8_{pgpid.lower()}"
        mdb.users.insert_one({"user_id": uid, "email": email, "name": stu["name"],
                              "role": "student", "pgpid": pgpid, "active": True})
    mdb.user_sessions.delete_many({"session_token": tok})
    mdb.user_sessions.insert_one({"user_id": uid, "session_token": tok,
                                  "expires_at": "2099-01-01T00:00:00+00:00"})


def cleanup_reqs(pgpids):
    mdb.requests.delete_many({"$or": [
        {"student_pgpid": {"$in": pgpids}},
        {"swap.partner_pgpid": {"$in": pgpids}},
    ]})


def restore_termv():
    if os.path.exists(TERMV_XLSX):
        try:
            with open(TERMV_XLSX, "rb") as f:
                requests.post(f"{API}/admin/import/termv", headers=h(ADMIN),
                              files={"file": ("termv.xlsx", f,
                                              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
                              timeout=180)
        except Exception:
            pass


@pytest.fixture(scope="module", autouse=True)
def module_setup():
    # ensure window open + trading enabled
    requests.put(f"{API}/admin/window", headers=h(ADMIN), json={"enabled": True}, timeout=15)
    requests.put(f"{API}/admin/trading/settings", headers=h(ADMIN), json={"enabled": True}, timeout=15)
    inject_session(PARTNER_PGPID, PARTNER_TOKEN)
    inject_session(PARTNER2_PGPID, PARTNER2_TOKEN)
    cleanup_reqs([STU_PGPID, STU2_PGPID, PARTNER_PGPID, PARTNER2_PGPID])
    yield
    cleanup_reqs([STU_PGPID, STU2_PGPID, PARTNER_PGPID, PARTNER2_PGPID])
    mdb.trading_posts.delete_many({})
    mdb.user_sessions.delete_many({"session_token": {"$in": [PARTNER_TOKEN, PARTNER2_TOKEN]}})
    restore_termv()


# ================================================================
# Admin Clear-All Trading
# ================================================================
class TestAdminClearTrading:
    def setup_method(self):
        mdb.trading_posts.delete_many({})
        # Create 2 posts via API to be realistic
        c = cid("Algo.Invt.")
        r1 = requests.post(f"{API}/trading/posts", headers=h(STU),
                           json={"drop_course_ids": [c], "add_section_ids": [], "note": "iter8"}, timeout=15)
        assert r1.status_code == 200, r1.text
        c2 = cid("Beh.Fin")
        r2 = requests.post(f"{API}/trading/posts", headers=h(STU2),
                           json={"drop_course_ids": [c2], "add_section_ids": [], "note": "iter8"}, timeout=15)
        assert r2.status_code == 200, r2.text

    def teardown_method(self):
        mdb.trading_posts.delete_many({})

    def test_student_forbidden(self):
        r = requests.delete(f"{API}/admin/trading", headers=h(STU), timeout=15)
        assert r.status_code == 403, r.text

    def test_admin_clears_all(self):
        r = requests.delete(f"{API}/admin/trading", headers=h(ADMIN), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert data.get("deleted") >= 2, data
        # Verify persistence -> board empty
        r2 = requests.get(f"{API}/admin/trading", headers=h(ADMIN), timeout=15)
        assert r2.status_code == 200
        assert r2.json()["posts"] == []


# ================================================================
# Credit-sum COURSE_SWAP end-to-end
# ================================================================
class TestCreditSumSwap:
    def setup_method(self):
        cleanup_reqs([STU_PGPID, PARTNER_PGPID])
        self.ALGO = cid("Algo.Invt.")
        self.BEH = cid("Beh.Fin")
        self.BPIM = cid("BPIM-J")
        # Snapshot enrollments for restore
        self.snap = {
            STU_PGPID: list(mdb.enrollments.find({"pgpid": STU_PGPID}, {"_id": 0})),
            PARTNER_PGPID: list(mdb.enrollments.find({"pgpid": PARTNER_PGPID}, {"_id": 0})),
        }
        # Verify starting state
        self.stu_algo_sec = mdb.enrollments.find_one({"pgpid": STU_PGPID, "course_id": self.ALGO})["section_id"]
        self.stu_beh_sec = mdb.enrollments.find_one({"pgpid": STU_PGPID, "course_id": self.BEH})["section_id"]
        par_bpim = mdb.enrollments.find_one({"pgpid": PARTNER_PGPID, "course_id": self.BPIM})
        assert par_bpim, "PGP41409 must have BPIM-J"
        self.par_bpim_sec = par_bpim["section_id"]
        # Verify partner does NOT already hold algo/beh (would corrupt execution)
        assert not mdb.enrollments.find_one({"pgpid": PARTNER_PGPID, "course_id": {"$in": [self.ALGO, self.BEH]}}), \
            "partner already holds a give-course, test fixture invalid"

    def teardown_method(self):
        cleanup_reqs([STU_PGPID, PARTNER_PGPID])
        # restore enrollments
        for pgp, rows in self.snap.items():
            mdb.enrollments.delete_many({"pgpid": pgp})
            if rows:
                mdb.enrollments.insert_many(rows)

    def test_credit_mismatch_returns_400(self):
        # Offering only Algo (0.5), wanting BPIM (1.0) => mismatch
        r = requests.post(f"{API}/student/requests", headers=h(STU), json={
            "request_type": "COURSE_SWAP", "partner_pgpid": PARTNER_PGPID,
            "give_section_ids": [self.stu_algo_sec],
            "want_section_ids": [self.par_bpim_sec],
        }, timeout=30)
        assert r.status_code == 400, r.text
        assert "credit" in r.text.lower()

    def test_credit_sum_swap_full_lifecycle(self):
        # Submit credit-sum swap: give Algo (0.5) + Beh (0.5) = 1.0, want BPIM (1.0)
        r = requests.post(f"{API}/student/requests", headers=h(STU), json={
            "request_type": "COURSE_SWAP", "partner_pgpid": PARTNER_PGPID,
            "give_section_ids": [self.stu_algo_sec, self.stu_beh_sec],
            "want_section_ids": [self.par_bpim_sec],
        }, timeout=30)
        assert r.status_code == 200, r.text
        rid = r.json()["request_id"]
        assert r.json()["status"] == "AWAITING_PARTNER_CONFIRMATION"

        # Verify arrays stored
        req_doc = mdb.requests.find_one({"request_id": rid}, {"_id": 0})
        assert len(req_doc["swap"]["initiator_gives"]) == 2
        assert len(req_doc["swap"]["initiator_gets"]) == 1
        given_courses = {g["course_id"] for g in req_doc["swap"]["initiator_gives"]}
        assert given_courses == {self.ALGO, self.BEH}
        # legacy single fields present (backward compat)
        assert req_doc["swap"]["initiator_current"]["course_id"] in {self.ALGO, self.BEH}

        # RequestDetail (initiator) returns full arrays
        r2 = requests.get(f"{API}/student/requests/{rid}", headers=h(STU), timeout=15)
        assert r2.status_code == 200
        det = r2.json()
        assert len(det["swap"]["initiator_gives"]) == 2
        assert len(det["swap"]["initiator_gets"]) == 1
        for g in det["swap"]["initiator_gives"]:
            assert "course_name" in g and "section_name" in g

        # Partner sees pending swap with FULL gives array
        pend = requests.get(f"{API}/student/pending-swaps", headers=h(PARTNER_TOKEN), timeout=15)
        assert pend.status_code == 200
        pend_list = pend.json()
        assert any(p["request_id"] == rid for p in pend_list)
        our = next(p for p in pend_list if p["request_id"] == rid)
        assert len(our["swap"]["initiator_gives"]) == 2, our["swap"]

        # Partner confirms
        rr = requests.post(f"{API}/student/swaps/{rid}/respond", headers=h(PARTNER_TOKEN),
                           json={"action": "accept"}, timeout=15)
        assert rr.status_code == 200, rr.text
        assert rr.json()["status"] == "BOTH_CONFIRMED"

        # Admin approves
        ad = requests.post(f"{API}/admin/requests/{rid}/decision", headers=h(ADMIN),
                           json={"decision": "approve"}, timeout=15)
        assert ad.status_code == 200, ad.text

        # Enrollments must remain unchanged after approval only
        assert mdb.enrollments.find_one({"pgpid": STU_PGPID, "course_id": self.ALGO}) is not None
        assert mdb.enrollments.find_one({"pgpid": STU_PGPID, "course_id": self.BEH}) is not None
        assert mdb.enrollments.find_one({"pgpid": STU_PGPID, "course_id": self.BPIM}) is None
        assert mdb.enrollments.find_one({"pgpid": PARTNER_PGPID, "course_id": self.BPIM}) is not None

        # Admin executes
        ex = requests.post(f"{API}/admin/requests/{rid}/decision", headers=h(ADMIN),
                           json={"decision": "executed"}, timeout=15)
        assert ex.status_code == 200, ex.text

        # Initiator: lost Algo + Beh, gained BPIM
        assert mdb.enrollments.find_one({"pgpid": STU_PGPID, "course_id": self.ALGO}) is None, "initiator should have lost Algo"
        assert mdb.enrollments.find_one({"pgpid": STU_PGPID, "course_id": self.BEH}) is None, "initiator should have lost Beh"
        stu_bpim = mdb.enrollments.find_one({"pgpid": STU_PGPID, "course_id": self.BPIM})
        assert stu_bpim is not None, "initiator should have gained BPIM"
        assert stu_bpim["section_id"] == self.par_bpim_sec

        # Partner: lost BPIM, gained Algo + Beh
        assert mdb.enrollments.find_one({"pgpid": PARTNER_PGPID, "course_id": self.BPIM}) is None, "partner should have lost BPIM"
        par_algo = mdb.enrollments.find_one({"pgpid": PARTNER_PGPID, "course_id": self.ALGO})
        par_beh = mdb.enrollments.find_one({"pgpid": PARTNER_PGPID, "course_id": self.BEH})
        assert par_algo is not None and par_algo["section_id"] == self.stu_algo_sec
        assert par_beh is not None and par_beh["section_id"] == self.stu_beh_sec


# ================================================================
# Legacy 1:1 COURSE_SWAP regression (single give/get fields)
# ================================================================
class TestLegacyCourseSwapRegression:
    def setup_method(self):
        cleanup_reqs([STU_PGPID, PARTNER2_PGPID])
        self.ACDM = cid("ACDM"); self.acdm_sec = sec(self.ACDM, "A")
        self.BPIM = cid("BPIM-J"); self.bpim_sec = sec(self.BPIM, "A")
        self.snap = {
            STU_PGPID: list(mdb.enrollments.find({"pgpid": STU_PGPID}, {"_id": 0})),
            PARTNER2_PGPID: list(mdb.enrollments.find({"pgpid": PARTNER2_PGPID}, {"_id": 0})),
        }
        # Ensure clean starting state: STU has ACDM, PARTNER2 has BPIM, no cross-holdings
        mdb.enrollments.delete_many({"pgpid": {"$in": [STU_PGPID, PARTNER2_PGPID]},
                                     "course_id": {"$in": [self.ACDM, self.BPIM]}})
        mdb.enrollments.insert_one({"pgpid": STU_PGPID, "course_id": self.ACDM, "section_id": self.acdm_sec})
        mdb.enrollments.insert_one({"pgpid": PARTNER2_PGPID, "course_id": self.BPIM, "section_id": self.bpim_sec})

    def teardown_method(self):
        cleanup_reqs([STU_PGPID, PARTNER2_PGPID])
        for pgp, rows in self.snap.items():
            mdb.enrollments.delete_many({"pgpid": pgp})
            if rows:
                mdb.enrollments.insert_many(rows)

    def test_legacy_1to1_course_swap_executes(self):
        # legacy fields
        r = requests.post(f"{API}/student/requests", headers=h(STU), json={
            "request_type": "COURSE_SWAP", "partner_pgpid": PARTNER2_PGPID,
            "give_course_id": self.ACDM, "give_section_id": self.acdm_sec,
            "want_course_id": self.BPIM, "want_section_id": self.bpim_sec,
        }, timeout=30)
        assert r.status_code == 200, r.text
        rid = r.json()["request_id"]
        # arrays should still be populated (single item) — this is the compat contract
        req_doc = mdb.requests.find_one({"request_id": rid}, {"_id": 0})
        assert len(req_doc["swap"]["initiator_gives"]) == 1
        assert len(req_doc["swap"]["initiator_gets"]) == 1

        # partner accept
        rr = requests.post(f"{API}/student/swaps/{rid}/respond", headers=h(PARTNER2_TOKEN),
                           json={"action": "accept"}, timeout=15)
        assert rr.status_code == 200, rr.text
        requests.post(f"{API}/admin/requests/{rid}/decision", headers=h(ADMIN),
                      json={"decision": "approve"}, timeout=15)
        ex = requests.post(f"{API}/admin/requests/{rid}/decision", headers=h(ADMIN),
                           json={"decision": "executed"}, timeout=15)
        assert ex.status_code == 200, ex.text
        assert mdb.enrollments.find_one({"pgpid": STU_PGPID, "course_id": self.BPIM}) is not None
        assert mdb.enrollments.find_one({"pgpid": PARTNER2_PGPID, "course_id": self.ACDM}) is not None


# ================================================================
# Legacy SECTION_SWAP regression
# ================================================================
class TestLegacySectionSwapRegression:
    def setup_method(self):
        cleanup_reqs([STU_PGPID, PARTNER2_PGPID])
        self.COURSE = cid("Beh.Fin")
        self.STU_SEC = sec(self.COURSE, "POST-A")
        self.PAR_SEC = sec(self.COURSE, "POST-B")
        self.snap = {
            STU_PGPID: list(mdb.enrollments.find({"pgpid": STU_PGPID}, {"_id": 0})),
            PARTNER2_PGPID: list(mdb.enrollments.find({"pgpid": PARTNER2_PGPID}, {"_id": 0})),
        }
        mdb.enrollments.delete_many({"pgpid": {"$in": [STU_PGPID, PARTNER2_PGPID]}, "course_id": self.COURSE})
        mdb.enrollments.insert_one({"pgpid": STU_PGPID, "course_id": self.COURSE, "section_id": self.STU_SEC})
        mdb.enrollments.insert_one({"pgpid": PARTNER2_PGPID, "course_id": self.COURSE, "section_id": self.PAR_SEC})

    def teardown_method(self):
        cleanup_reqs([STU_PGPID, PARTNER2_PGPID])
        for pgp, rows in self.snap.items():
            mdb.enrollments.delete_many({"pgpid": pgp})
            if rows:
                mdb.enrollments.insert_many(rows)

    def test_section_swap_executes(self):
        r = requests.post(f"{API}/student/requests", headers=h(STU), json={
            "request_type": "SECTION_SWAP", "partner_pgpid": PARTNER2_PGPID,
            "swap_course_id": self.COURSE, "my_section_id": self.STU_SEC,
            "requested_section_id": self.PAR_SEC,
        }, timeout=30)
        assert r.status_code == 200, r.text
        rid = r.json()["request_id"]
        assert requests.post(f"{API}/student/swaps/{rid}/respond", headers=h(PARTNER2_TOKEN),
                             json={"action": "accept"}, timeout=15).status_code == 200
        assert requests.post(f"{API}/admin/requests/{rid}/decision", headers=h(ADMIN),
                             json={"decision": "approve"}, timeout=15).status_code == 200
        assert requests.post(f"{API}/admin/requests/{rid}/decision", headers=h(ADMIN),
                             json={"decision": "executed"}, timeout=15).status_code == 200
        stu_row = mdb.enrollments.find_one({"pgpid": STU_PGPID, "course_id": self.COURSE})
        par_row = mdb.enrollments.find_one({"pgpid": PARTNER2_PGPID, "course_id": self.COURSE})
        assert stu_row["section_id"] == self.PAR_SEC
        assert par_row["section_id"] == self.STU_SEC


# ================================================================
# Full Timetable exposes no capacity
# ================================================================
class TestFullTimetablePrivacy:
    FORBIDDEN_KEYS = {"min_capacity", "max_capacity", "strength", "capacity", "seats", "available_seats"}

    def _walk(self, obj, path=""):
        if isinstance(obj, dict):
            for k, v in obj.items():
                assert k not in self.FORBIDDEN_KEYS, f"forbidden key {k} at {path}"
                self._walk(v, f"{path}.{k}")
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                self._walk(v, f"{path}[{i}]")

    def test_full_timetable_no_capacity(self):
        r = requests.get(f"{API}/student/timetable/all", headers=h(STU), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "sections" in data
        assert len(data["sections"]) > 0
        # sample first section shape
        s0 = data["sections"][0]
        assert "section_id" in s0 and "course_code" in s0 and "section_name" in s0
        self._walk(data)

    def test_courses_endpoint_no_capacity(self):
        r = requests.get(f"{API}/student/available-courses", headers=h(STU), timeout=30)
        assert r.status_code == 200
        self._walk(r.json())


# ================================================================
# Window closed + Quotas
# ================================================================
class TestWindowAndQuotas:
    def test_window_closed_gate(self):
        # Close, attempt submit, expect 403, then reopen
        r = requests.put(f"{API}/admin/window", headers=h(ADMIN), json={"enabled": False}, timeout=15)
        assert r.status_code == 200, r.text
        try:
            add_course = cid("PS")  # unlikely to be enrolled
            sid, _ = any_sec(add_course)
            r2 = requests.post(f"{API}/student/requests", headers=h(STU), json={
                "request_type": "ADD", "add_course_id": add_course, "add_section_id": sid
            }, timeout=15)
            assert r2.status_code == 403, r2.text
        finally:
            requests.put(f"{API}/admin/window", headers=h(ADMIN), json={"enabled": True}, timeout=15)

    def test_quota_limits(self):
        r = requests.get(f"{API}/student/quota", headers=h(STU), timeout=15)
        assert r.status_code == 200
        q = r.json()
        assert q["add_limit"] == 1
        assert q["drop_limit"] == 1
        assert q["course_swap_limit"] == 2
        assert q["section_swap_limit"] == 2
