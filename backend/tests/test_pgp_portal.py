"""
PGP Course Change Request Portal - comprehensive backend tests.
Uses pre-injected Emergent sessions in Mongo (see /app/memory/test_credentials.md).
"""
import os
import io
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://pgp-request-portal.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_TOKEN = "admintest_session"
S1_TOKEN = "stu_PGP001"
S2_TOKEN = "stu_PGP002"


def H(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ------------------ Auth & RBAC ------------------
class TestAuthRBAC:
    def test_me_admin(self):
        r = requests.get(f"{API}/auth/me", headers=H(ADMIN_TOKEN))
        assert r.status_code == 200
        data = r.json()
        assert data["role"] == "admin"
        assert data["email"] == "pgp41473@iiml.ac.in"

    def test_me_student(self):
        r = requests.get(f"{API}/auth/me", headers=H(S1_TOKEN))
        assert r.status_code == 200
        data = r.json()
        assert data["role"] == "student"
        assert data["pgpid"] == "PGP001"

    def test_no_token_401(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_invalid_token_401(self):
        r = requests.get(f"{API}/auth/me", headers=H("garbage_token_xyz"))
        assert r.status_code == 401

    def test_student_cannot_access_admin(self):
        for path in ["/admin/dashboard", "/admin/requests", "/admin/capacity",
                     "/admin/students", "/admin/courses", "/admin/sections",
                     "/admin/audit", "/admin/export"]:
            r = requests.get(f"{API}{path}", headers=H(S1_TOKEN))
            assert r.status_code == 403, f"{path} expected 403 got {r.status_code}"


# ------------------ Capacity Privacy ------------------
class TestCapacityPrivacy:
    def test_available_courses_no_capacity(self):
        r = requests.get(f"{API}/student/available-courses", headers=H(S1_TOKEN))
        assert r.status_code == 200
        body = r.json()
        forbidden = {"min_capacity", "max_capacity", "current", "seats", "capacity", "strength", "demand"}
        for c in body:
            for s in c.get("sections", []):
                assert not (forbidden & set(s.keys())), f"Capacity field leaked in section: {s}"

    def test_student_capacity_endpoint_403(self):
        r = requests.get(f"{API}/admin/capacity", headers=H(S1_TOKEN))
        assert r.status_code == 403


# ------------------ Window ------------------
class TestWindow:
    def test_open_window(self):
        r = requests.put(f"{API}/admin/window",
                         json={"enabled": True, "opens_at": None, "closes_at": None},
                         headers=H(ADMIN_TOKEN))
        assert r.status_code == 200
        assert r.json()["is_open"] is True

    def test_close_window_blocks_submission(self):
        # close
        r = requests.put(f"{API}/admin/window", json={"enabled": False}, headers=H(ADMIN_TOKEN))
        assert r.status_code == 200
        assert r.json()["is_open"] is False
        # student view
        w = requests.get(f"{API}/window", headers=H(S1_TOKEN)).json()
        assert w["is_open"] is False
        # attempt submit -> 403
        r = requests.post(f"{API}/student/requests", json={
            "request_type": "ADD", "add_course_id": "x", "add_section_id": "y"
        }, headers=H(S1_TOKEN))
        assert r.status_code == 403
        # reopen
        r = requests.put(f"{API}/admin/window", json={"enabled": True}, headers=H(ADMIN_TOKEN))
        assert r.status_code == 200
        assert r.json()["is_open"] is True


# ------------------ Helpers to lookup course/section ids ------------------
@pytest.fixture(scope="module")
def master():
    """Return course_code->course_id map and section (course_code, name)->section_id"""
    courses = requests.get(f"{API}/admin/courses", headers=H(ADMIN_TOKEN)).json()
    sections = requests.get(f"{API}/admin/sections", headers=H(ADMIN_TOKEN)).json()
    c_by_code = {c["course_code"]: c for c in courses}
    s_by = {(s["course_code"], s["section_name"]): s for s in sections}
    return {"courses": c_by_code, "sections": s_by}


@pytest.fixture(scope="module", autouse=True)
def ensure_window_open():
    requests.put(f"{API}/admin/window", json={"enabled": True}, headers=H(ADMIN_TOKEN))
    yield
    requests.put(f"{API}/admin/window", json={"enabled": True}, headers=H(ADMIN_TOKEN))


@pytest.fixture(autouse=True)
def cleanup_active_requests():
    """Cancel any active requests owned by PGP001 / PGP002 before each test to avoid 409."""
    for tok, pgpid in [(S1_TOKEN, "PGP001"), (S2_TOKEN, "PGP002")]:
        reqs = requests.get(f"{API}/student/requests", headers=H(tok)).json()
        if isinstance(reqs, list):
            for r in reqs:
                if r["status"] not in {"REJECTED", "PARTNER_REJECTED", "CANCELLED", "EXECUTED", "APPROVED_PENDING_EXECUTION"}:
                    requests.post(f"{API}/student/requests/{r['request_id']}/cancel", headers=H(tok))
    yield


# ------------------ Submissions ------------------
class TestSubmissions:
    def test_add_submission(self, master):
        add_course = master["courses"]["STR201"]["course_id"]
        add_section = master["sections"][("STR201", "A")]["section_id"]
        r = requests.post(f"{API}/student/requests", headers=H(S1_TOKEN), json={
            "request_type": "ADD",
            "add_course_id": add_course,
            "add_section_id": add_section,
            "comment": "TEST_add"
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "SUBMITTED"
        assert len(d["actions"]) == 1 and d["actions"][0]["action"] == "ADD"
        # no capacity info anywhere
        text = r.text.lower()
        for f in ["min_capacity", "max_capacity", "\"current\"", "seats"]:
            assert f not in text

    def test_drop_submission(self, master):
        drop_course = master["courses"]["OPS101"]["course_id"]
        drop_section = master["sections"][("OPS101", "A")]["section_id"]
        r = requests.post(f"{API}/student/requests", headers=H(S1_TOKEN), json={
            "request_type": "DROP",
            "drop_course_id": drop_course,
            "drop_section_id": drop_section,
            "comment": "TEST_drop"
        })
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "SUBMITTED"

    def test_add_drop_submission(self, master):
        drop_course = master["courses"]["OPS101"]["course_id"]
        drop_section = master["sections"][("OPS101", "A")]["section_id"]
        add_course = master["courses"]["ECO101"]["course_id"]
        # find a valid section for ECO101
        sec = next(v for (cc, _), v in master["sections"].items() if cc == "ECO101")
        r = requests.post(f"{API}/student/requests", headers=H(S1_TOKEN), json={
            "request_type": "ADD_DROP",
            "drop_course_id": drop_course, "drop_section_id": drop_section,
            "add_course_id": add_course, "add_section_id": sec["section_id"],
            "comment": "TEST_add_drop"
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "SUBMITTED"
        assert len(d["actions"]) == 2


# ------------------ Privacy Test 1 ------------------
class TestPrivacy:
    def test_cannot_read_others_request(self, master):
        # PGP002 submits ADD for STR201 B (uninvolved with PGP001)
        add_course = master["courses"]["STR201"]["course_id"]
        add_section = master["sections"][("STR201", "B")]["section_id"] if ("STR201", "B") in master["sections"] else master["sections"][("STR201", "A")]["section_id"]
        # If PGP002 already has STR201 A, use different course they don't have. PGP002 has FIN101 B, MKT101 A, STR201 A. Use ECO101.
        add_course = master["courses"]["ECO101"]["course_id"]
        eco_sec = next(v for (cc, _), v in master["sections"].items() if cc == "ECO101")
        r = requests.post(f"{API}/student/requests", headers=H(S2_TOKEN), json={
            "request_type": "ADD", "add_course_id": add_course, "add_section_id": eco_sec["section_id"], "comment": "TEST_priv"
        })
        assert r.status_code == 200, r.text
        rid = r.json()["request_id"]
        # PGP001 tries to fetch -> 403
        r2 = requests.get(f"{API}/student/requests/{rid}", headers=H(S1_TOKEN))
        assert r2.status_code == 403
        # PGP001 dashboard shows only own data
        dash = requests.get(f"{API}/student/dashboard", headers=H(S1_TOKEN)).json()
        assert dash["pgpid"] == "PGP001"


# ------------------ Conflict ------------------
class TestConflict:
    def test_conflict_409(self, master):
        drop_course = master["courses"]["OPS101"]["course_id"]
        drop_section = master["sections"][("OPS101", "A")]["section_id"]
        # first drop
        r1 = requests.post(f"{API}/student/requests", headers=H(S1_TOKEN), json={
            "request_type": "DROP", "drop_course_id": drop_course, "drop_section_id": drop_section
        })
        assert r1.status_code == 200
        # second involving same course
        r2 = requests.post(f"{API}/student/requests", headers=H(S1_TOKEN), json={
            "request_type": "DROP", "drop_course_id": drop_course, "drop_section_id": drop_section
        })
        assert r2.status_code == 409
        assert "active request" in r2.text.lower() or "conflict" in r2.text.lower()


# ------------------ Swap workflows ------------------
class TestSwapReject:
    def test_swap_partner_rejects_blocks_admin(self, master):
        course = master["courses"]["MKT101"]["course_id"]
        s1_sec = master["sections"][("MKT101", "B")]["section_id"]  # PGP001 has B
        s2_sec = master["sections"][("MKT101", "A")]["section_id"]  # PGP002 has A
        r = requests.post(f"{API}/student/requests", headers=H(S1_TOKEN), json={
            "request_type": "SECTION_SWAP", "partner_pgpid": "PGP002",
            "swap_course_id": course, "my_section_id": s1_sec, "requested_section_id": s2_sec
        })
        assert r.status_code == 200, r.text
        rid = r.json()["request_id"]
        assert r.json()["status"] == "AWAITING_PARTNER_CONFIRMATION"

        # partner sees pending
        pending = requests.get(f"{API}/student/pending-swaps", headers=H(S2_TOKEN)).json()
        assert any(x["request_id"] == rid for x in pending)

        # notification created for partner
        notes = requests.get(f"{API}/student/notifications", headers=H(S2_TOKEN)).json()
        assert any(n.get("request_id") == rid for n in notes)

        # reject
        r2 = requests.post(f"{API}/student/swaps/{rid}/respond", headers=H(S2_TOKEN), json={"action": "reject"})
        assert r2.status_code == 200
        assert r2.json()["status"] == "PARTNER_REJECTED"

        # admin tries approve -> 400
        r3 = requests.post(f"{API}/admin/requests/{rid}/decision", headers=H(ADMIN_TOKEN), json={"decision": "approve"})
        assert r3.status_code == 400


class TestSwapAcceptFlow:
    def test_full_swap_accept_approve_execute(self, master):
        course = master["courses"]["MKT101"]["course_id"]
        s1_sec = master["sections"][("MKT101", "B")]["section_id"]
        s2_sec = master["sections"][("MKT101", "A")]["section_id"]
        r = requests.post(f"{API}/student/requests", headers=H(S1_TOKEN), json={
            "request_type": "SECTION_SWAP", "partner_pgpid": "PGP002",
            "swap_course_id": course, "my_section_id": s1_sec, "requested_section_id": s2_sec
        })
        assert r.status_code == 200, r.text
        rid = r.json()["request_id"]

        # admin approve BEFORE partner confirms -> 400
        r_bad = requests.post(f"{API}/admin/requests/{rid}/decision", headers=H(ADMIN_TOKEN), json={"decision": "approve"})
        assert r_bad.status_code == 400

        # partner accepts
        r2 = requests.post(f"{API}/student/swaps/{rid}/respond", headers=H(S2_TOKEN), json={"action": "accept"})
        assert r2.status_code == 200
        assert r2.json()["status"] == "BOTH_CONFIRMED"

        # admin approve
        r3 = requests.post(f"{API}/admin/requests/{rid}/decision", headers=H(ADMIN_TOKEN),
                           json={"decision": "approve", "comment": "TEST approve"})
        assert r3.status_code == 200
        assert r3.json()["status"] == "APPROVED_PENDING_EXECUTION"

        # verify GET reflects status
        detail = requests.get(f"{API}/admin/requests/{rid}", headers=H(ADMIN_TOKEN)).json()
        assert detail["status"] == "APPROVED_PENDING_EXECUTION"

        # mark executed
        r4 = requests.post(f"{API}/admin/requests/{rid}/decision", headers=H(ADMIN_TOKEN),
                           json={"decision": "executed"})
        assert r4.status_code == 200
        assert r4.json()["status"] == "EXECUTED"


# ------------------ Admin dashboard & capacity ------------------
class TestAdminDashboard:
    def test_dashboard(self):
        r = requests.get(f"{API}/admin/dashboard", headers=H(ADMIN_TOKEN))
        assert r.status_code == 200
        d = r.json()
        for k in ["total_students", "total_courses", "total_sections", "total_requests",
                  "add_requests", "drop_requests", "add_drop_requests", "course_swaps",
                  "section_swaps", "pending_swap_confirmations", "awaiting_admin_review"]:
            assert k in d

    def test_capacity_fields(self):
        r = requests.get(f"{API}/admin/capacity", headers=H(ADMIN_TOKEN))
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) > 0
        row = rows[0]
        for k in ["current", "min_capacity", "max_capacity", "pending_adds", "pending_drops", "net_change", "projected"]:
            assert k in row

    def test_admin_requests_list(self):
        r = requests.get(f"{API}/admin/requests", headers=H(ADMIN_TOKEN))
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ------------------ Export ------------------
class TestExport:
    def test_export_xlsx(self):
        r = requests.get(f"{API}/admin/export", headers=H(ADMIN_TOKEN))
        assert r.status_code == 200
        assert "spreadsheet" in r.headers.get("content-type", "")
        assert r.content[:2] == b"PK"  # zip/xlsx signature
        # no obvious secret words
        low = r.content[:5000].lower()
        assert b"password" not in low
        assert b"session_token" not in low


# ------------------ Import ------------------
class TestImport:
    def test_preview_invalid_and_valid(self):
        csv_content = "pgpid,name,email\nTESTPGPX01,Test Student X,testx@iim.ac.in\n,Bad Row,bad@x.com\n"
        files = {"file": ("students.csv", csv_content, "text/csv")}
        r = requests.post(f"{API}/admin/import/preview",
                          headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
                          data={"kind": "students"}, files=files)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["total"] == 2
        assert body["valid"] == 1
        assert body["errors"] == 1
        token = body["token"]

        # commit
        r2 = requests.post(f"{API}/admin/import/commit", headers=H(ADMIN_TOKEN), json={"token": token})
        assert r2.status_code == 200
        assert r2.json()["inserted"] == 1


# ------------------ Audit ------------------
class TestAudit:
    def test_audit_returns_entries(self):
        r = requests.get(f"{API}/admin/audit", headers=H(ADMIN_TOKEN))
        assert r.status_code == 200
        logs = r.json()
        assert isinstance(logs, list)
        assert len(logs) > 0
        actions = {l.get("action") for l in logs}
        # Some of these should appear given our tests
        assert actions & {"SUBMIT", "ADMIN_DECISION", "SWAP_RESPONSE", "IMPORT", "EXPORT", "WINDOW_UPDATE"}
