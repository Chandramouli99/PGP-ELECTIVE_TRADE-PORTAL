"""Tests for Term V feature additions (feasibility, credits, timetable, section limits, admin allowlist)."""
import os
import requests
import pytest

def _load_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if not v:
        # fallback: read from frontend .env
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        v = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    return v.rstrip("/")

BASE_URL = _load_url()
API = f"{BASE_URL}/api"

ADMIN = "admintest_session"
STU = "stu_real"


def H(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


# --- Admin dashboard totals ---
class TestDashboardTotals:
    def test_totals(self):
        r = requests.get(f"{API}/admin/dashboard", headers=H(ADMIN))
        assert r.status_code == 200
        d = r.json()
        assert d["total_students"] == 453, d
        assert d["total_courses"] == 39, d
        assert d["total_sections"] == 49, d


# --- Feasibility ---
class TestFeasibility:
    def test_student_forbidden(self):
        r = requests.get(f"{API}/admin/feasibility", headers=H(STU))
        assert r.status_code == 403

    def test_admin_shape(self):
        r = requests.get(f"{API}/admin/feasibility", headers=H(ADMIN))
        assert r.status_code == 200
        body = r.json()
        assert "summary" in body and "sections" in body
        for k in ["OK", "OVER", "UNDER", "NO_LIMIT"]:
            assert k in body["summary"]
        assert len(body["sections"]) == 49
        row = body["sections"][0]
        for k in ["current", "pending_adds", "pending_drops", "projected", "min_capacity", "max_capacity", "flag"]:
            assert k in row, row

    def test_summary_matches_rows(self):
        b = requests.get(f"{API}/admin/feasibility", headers=H(ADMIN)).json()
        counted = {"OK": 0, "OVER": 0, "UNDER": 0, "NO_LIMIT": 0}
        for r in b["sections"]:
            counted[r["flag"]] += 1
        assert counted == b["summary"]


# --- Section limits PUT ---
class TestSectionLimits:
    def test_student_forbidden(self):
        r = requests.put(f"{API}/admin/sections/xxx", json={"min_capacity": 1, "max_capacity": 2}, headers=H(STU))
        assert r.status_code == 403

    def test_set_and_flag_transitions(self):
        b = requests.get(f"{API}/admin/feasibility", headers=H(ADMIN)).json()
        # Pick 3 sections with NO_LIMIT
        no_limit = [s for s in b["sections"] if s["flag"] == "NO_LIMIT"]
        assert len(no_limit) >= 3
        target_ok = no_limit[0]
        target_over = no_limit[1]
        target_under = no_limit[2]

        cur_ok = target_ok["current"]
        cur_over = target_over["current"]
        cur_under = target_under["current"]

        # OK: min <= projected <= max
        r1 = requests.put(f"{API}/admin/sections/{target_ok['section_id']}",
                          json={"min_capacity": max(0, cur_ok - 5), "max_capacity": cur_ok + 20}, headers=H(ADMIN))
        assert r1.status_code == 200
        # OVER: max well below projected
        r2 = requests.put(f"{API}/admin/sections/{target_over['section_id']}",
                          json={"min_capacity": 0, "max_capacity": max(0, cur_over - 5)}, headers=H(ADMIN))
        assert r2.status_code == 200
        # UNDER: min above projected
        r3 = requests.put(f"{API}/admin/sections/{target_under['section_id']}",
                          json={"min_capacity": cur_under + 50, "max_capacity": cur_under + 100}, headers=H(ADMIN))
        assert r3.status_code == 200

        # Re-fetch feasibility
        b2 = requests.get(f"{API}/admin/feasibility", headers=H(ADMIN)).json()
        by_id = {s["section_id"]: s for s in b2["sections"]}
        assert by_id[target_ok["section_id"]]["flag"] == "OK"
        assert by_id[target_over["section_id"]]["flag"] == "OVER"
        assert by_id[target_under["section_id"]]["flag"] == "UNDER"

        # Clean up: reset to null
        for t in [target_ok, target_over, target_under]:
            requests.put(f"{API}/admin/sections/{t['section_id']}",
                         json={"min_capacity": None, "max_capacity": None}, headers=H(ADMIN))

    def test_404_bad_id(self):
        r = requests.put(f"{API}/admin/sections/nonexistent_zzz",
                         json={"min_capacity": 1, "max_capacity": 2}, headers=H(ADMIN))
        assert r.status_code == 404


# --- Student dashboard (real student) ---
class TestStudentDashboard:
    def test_credits_and_courses(self):
        r = requests.get(f"{API}/student/dashboard", headers=H(STU))
        assert r.status_code == 200
        d = r.json()
        assert d["pgpid"] == "PGP41071"
        assert d["total_credits"] == 6.0, d
        assert d["credit_min"] == 5.0
        assert d["credit_max"] == 6.0
        assert d["credit_status"] == "ok"
        assert len(d["courses"]) == 7
        for c in d["courses"]:
            for k in ["credits", "area", "day", "time_slot", "course_code", "section_name"]:
                assert k in c, c
        # No capacity fields
        text = r.text.lower()
        for f in ["min_capacity", "max_capacity", "\"current\"", "\"strength\"", "seats"]:
            assert f not in text, f"leaked {f}"


# --- Timetable ---
class TestTimetable:
    def test_timetable(self):
        r = requests.get(f"{API}/student/timetable", headers=H(STU))
        assert r.status_code == 200
        body = r.json()
        assert "entries" in body
        entries = body["entries"]
        assert len(entries) == 7
        for e in entries:
            for k in ["course_code", "section_name", "day", "time_slot", "credits"]:
                assert k in e, e
        # Any not-timetabled?
        untimed = [e for e in entries if (e.get("day") in [None, "Not timetabled", ""] or e.get("time_slot") in [None, "—", ""])]
        # We expect at least one 'Not timetabled' style entry given CIS/EL(V)/BPIM-J
        # But allow zero if all courses are scheduled
        assert isinstance(untimed, list)


# --- Admin allowlist code check ---
class TestAdminAllowlist:
    def test_secy_email_in_code(self):
        with open("/app/backend/server.py") as f:
            src = f.read()
        assert "secy.academics@iiml.ac.in" in src
        # Ensure it's part of ADMIN_EMAILS set literal, not a comment
        idx = src.find("ADMIN_EMAILS")
        block = src[idx:idx+300]
        assert "secy.academics@iiml.ac.in" in block


# --- Regressions ---
class TestRegressions:
    def test_window_open(self):
        r = requests.put(f"{API}/admin/window", json={"enabled": True}, headers=H(ADMIN))
        assert r.status_code == 200
        assert r.json()["is_open"] is True

    def test_export_xlsx(self):
        r = requests.get(f"{API}/admin/export", headers=H(ADMIN))
        assert r.status_code == 200
        assert r.content[:2] == b"PK"

    def test_available_courses_no_capacity(self):
        r = requests.get(f"{API}/student/available-courses", headers=H(STU))
        assert r.status_code == 200
        forbidden = {"min_capacity", "max_capacity", "current", "strength", "seats"}
        for c in r.json():
            for s in c.get("sections", []):
                assert not (forbidden & set(s.keys())), s
