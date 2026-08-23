"""RBAC bug-fix verification: student email must not get admin.
Bug: pgp41473@iiml.ac.in (real student) had been in the admin allowlist and
was granted admin role. Fix restricts ADMIN_EMAILS to secy.academics@iiml.ac.in.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://pgp-request-portal.preview.emergentagent.com").rstrip("/")

STUDENT_TOKENS = ["stu_pgp41473", "stu_real"]
ADMIN_TOKEN = "admintest_session"

ADMIN_GET_ENDPOINTS = [
    "/api/admin/dashboard",
    "/api/admin/requests",
    "/api/admin/capacity",
    "/api/admin/feasibility",
    "/api/admin/students",
    "/api/admin/audit",
    "/api/admin/export",
]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.mark.parametrize("token", STUDENT_TOKENS)
def test_student_me_role(token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(token))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["role"] == "student", f"{token} got role={data['role']}"


def test_admin_me_role():
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(ADMIN_TOKEN))
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "admin"


@pytest.mark.parametrize("token", STUDENT_TOKENS)
@pytest.mark.parametrize("path", ADMIN_GET_ENDPOINTS)
def test_student_blocked_from_admin_get(token, path):
    r = requests.get(f"{BASE_URL}{path}", headers=_h(token))
    assert r.status_code == 403, f"{token} {path} -> {r.status_code} {r.text[:120]}"


@pytest.mark.parametrize("token", STUDENT_TOKENS)
def test_student_blocked_put_window(token):
    r = requests.put(f"{BASE_URL}/api/admin/window", headers=_h(token),
                     json={"open": True, "opens_at": None, "closes_at": None})
    assert r.status_code == 403


@pytest.mark.parametrize("token", STUDENT_TOKENS)
def test_student_blocked_put_section(token):
    # pick any section id string; auth guard runs before body validation
    r = requests.put(f"{BASE_URL}/api/admin/sections/SEC_TEST", headers=_h(token),
                     json={"min_capacity": None, "max_capacity": None})
    assert r.status_code == 403


@pytest.mark.parametrize("token", STUDENT_TOKENS)
def test_student_blocked_import_termv(token):
    r = requests.post(f"{BASE_URL}/api/admin/import/termv", headers=_h(token),
                      files={"file": ("x.xlsx", b"x", "application/octet-stream")})
    assert r.status_code == 403


def test_admin_dashboard_ok():
    r = requests.get(f"{BASE_URL}/api/admin/dashboard", headers=_h(ADMIN_TOKEN))
    assert r.status_code == 200, r.text
    data = r.json()
    # Sanity: dashboard returns some counters
    assert isinstance(data, dict)


# ---- Regression: student flows still work ----

def test_student_dashboard_content():
    r = requests.get(f"{BASE_URL}/api/student/dashboard", headers=_h("stu_pgp41473"))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("pgpid") == "PGP41473"
    # 6 courses / 5.0 credits per spec
    enrollments = data.get("enrollments") or data.get("courses") or []
    assert len(enrollments) == 6, f"expected 6 courses, got {len(enrollments)}"


def test_student_timetable():
    r = requests.get(f"{BASE_URL}/api/student/timetable", headers=_h("stu_pgp41473"))
    assert r.status_code == 200, r.text


def test_student_my_requests():
    r = requests.get(f"{BASE_URL}/api/student/requests", headers=_h("stu_pgp41473"))
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)
