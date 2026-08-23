"""Iteration 6 backend tests — withdrawal rules + trading board."""
import os, uuid, pytest, requests

def _read_env(path, key):
    for line in open(path):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"')
    raise RuntimeError(f"{key} not in {path}")

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _read_env("/app/frontend/.env", "REACT_APP_BACKEND_URL")).rstrip("/") + "/api"
STU = {"Authorization": "Bearer stu_real"}          # PGP41071
STU2 = {"Authorization": "Bearer stu_pgp41473"}     # PGP41473
ADM = {"Authorization": "Bearer admintest_session"}


@pytest.fixture(autouse=True)
def _restore():
    # Ensure window open + trading enabled before every test, and cleanup after
    requests.put(f"{BASE}/admin/window", json={"enabled": True}, headers=ADM)
    requests.put(f"{BASE}/admin/trading/settings", json={"enabled": True}, headers=ADM)
    yield
    requests.put(f"{BASE}/admin/window", json={"enabled": True}, headers=ADM)
    requests.put(f"{BASE}/admin/trading/settings", json={"enabled": True}, headers=ADM)


def _me_courses():
    r = requests.get(f"{BASE}/student/dashboard", headers=STU); r.raise_for_status()
    return r.data if False else r.json()["courses"]


def _cleanup_requests():
    # No API to purge; delete via Mongo cli
    os.system("mongosh test_database --quiet --eval 'db.requests.deleteMany({student_pgpid:\"PGP41071\"})' >/dev/null 2>&1")


def _cleanup_posts():
    os.system("mongosh test_database --quiet --eval 'db.trading_posts.deleteMany({pgpid:{$in:[\"PGP41071\",\"PGP41473\"]}})' >/dev/null 2>&1")


# -------------------------------- WITHDRAWAL ---------------------------------
class TestWithdrawal:
    def setup_method(self):
        _cleanup_requests()

    def teardown_method(self):
        _cleanup_requests()

    def _submit_add(self):
        av = requests.get(f"{BASE}/student/available-courses", headers=STU).json()
        owned = {c["course_id"] for c in _me_courses()}
        target = next(c for c in av if c["course_id"] not in owned and c.get("sections"))
        sec = target["sections"][0]
        r = requests.post(f"{BASE}/student/requests", headers=STU, json={
            "request_type": "ADD",
            "add_course_id": target["course_id"],
            "add_section_id": sec["section_id"],
        })
        assert r.status_code == 200, r.text
        return r.json()["request_id"]

    def test_add_withdraw_success(self):
        rid = self._submit_add()
        r = requests.post(f"{BASE}/student/requests/{rid}/cancel", headers=STU)
        assert r.status_code == 200, r.text
        detail = requests.get(f"{BASE}/student/requests/{rid}", headers=STU).json()
        assert detail["status"] == "CANCELLED"

    def test_add_withdraw_frees_quota(self):
        self._submit_add()
        # quota consumed
        # withdraw last submitted
        reqs = requests.get(f"{BASE}/student/requests", headers=STU).json()
        rid = reqs[0]["request_id"]
        assert requests.post(f"{BASE}/student/requests/{rid}/cancel", headers=STU).status_code == 200
        # now able to submit another ADD -> should succeed
        rid2 = self._submit_add()
        assert rid2

    def test_swap_withdraw_forbidden(self):
        # Build a COURSE_SWAP with partner PGP41473; find a course they own that we don't
        my = _me_courses()
        my_ids = {c["course_id"] for c in my}
        partner_dash = requests.get(f"{BASE}/student/dashboard", headers=STU2).json()["courses"]
        want = next((c for c in partner_dash if c["course_id"] not in my_ids), None)
        give = next((c for c in my if c["course_id"] not in {p["course_id"] for p in partner_dash}), my[0])
        if not want:
            pytest.skip("no differing course to form swap")
        r = requests.post(f"{BASE}/student/requests", headers=STU, json={
            "request_type": "COURSE_SWAP",
            "partner_pgpid": "PGP41473",
            "give_course_id": give["course_id"], "give_section_id": give["section_id"],
            "want_course_id": want["course_id"], "want_section_id": want["section_id"],
        })
        if r.status_code != 200:
            pytest.skip(f"swap not creatable in seed: {r.text}")
        rid = r.json()["request_id"]
        c = requests.post(f"{BASE}/student/requests/{rid}/cancel", headers=STU)
        assert c.status_code == 403
        assert "Swap" in c.json()["detail"]

    def test_withdraw_blocked_when_window_closed(self):
        rid = self._submit_add()
        assert requests.put(f"{BASE}/admin/window", json={"enabled": False}, headers=ADM).status_code == 200
        try:
            c = requests.post(f"{BASE}/student/requests/{rid}/cancel", headers=STU)
            assert c.status_code == 403
            assert "window has closed" in c.json()["detail"].lower()
        finally:
            requests.put(f"{BASE}/admin/window", json={"enabled": True}, headers=ADM)


# --------------------------------- TRADING -----------------------------------
class TestTrading:
    def setup_method(self):
        _cleanup_posts()

    def teardown_method(self):
        _cleanup_posts()

    def test_board_enabled_default(self):
        r = requests.get(f"{BASE}/trading/board", headers=STU)
        assert r.status_code == 200
        assert r.json()["enabled"] is True

    def test_upsert_and_list(self):
        my = _me_courses()
        av = requests.get(f"{BASE}/student/available-courses", headers=STU).json()
        owned = {c["course_id"] for c in my}
        add = next(c for c in av if c["course_id"] not in owned)
        drop = my[0]
        r = requests.post(f"{BASE}/trading/posts", headers=STU, json={
            "drop_course_ids": [drop["course_id"]],
            "add_course_ids": [add["course_id"]],
            "note": "TEST case",
        })
        assert r.status_code == 200, r.text
        mine = requests.get(f"{BASE}/trading/mine", headers=STU).json()
        assert mine["post"] is not None
        assert drop["course_id"] in mine["post"]["drop_course_ids"]

        board = requests.get(f"{BASE}/trading/board", headers=STU).json()
        me_post = [p for p in board["posts"] if p["pgpid"] == "PGP41071"]
        assert me_post and me_post[0]["is_mine"] is True
        assert me_post[0]["student_name"]
        # No section capacity/strength in response
        assert not any("strength" in str(c) or "capacity" in str(c) for c in me_post[0]["drop_courses"] + me_post[0]["add_courses"])

    def test_upsert_replaces(self):
        my = _me_courses()
        av = requests.get(f"{BASE}/student/available-courses", headers=STU).json()
        owned = {c["course_id"] for c in my}
        adds = [c for c in av if c["course_id"] not in owned][:2]
        requests.post(f"{BASE}/trading/posts", headers=STU, json={
            "drop_course_ids": [], "add_course_ids": [adds[0]["course_id"]], "note": "v1"})
        r = requests.post(f"{BASE}/trading/posts", headers=STU, json={
            "drop_course_ids": [], "add_course_ids": [adds[1]["course_id"]], "note": "v2"})
        assert r.status_code == 200
        mine = requests.get(f"{BASE}/trading/mine", headers=STU).json()["post"]
        assert mine["add_course_ids"] == [adds[1]["course_id"]]
        assert mine["note"] == "v2"

    def test_drop_must_be_owned(self):
        # try to drop a course not owned
        av = requests.get(f"{BASE}/student/available-courses", headers=STU).json()
        owned = {c["course_id"] for c in _me_courses()}
        not_owned = next(c["course_id"] for c in av if c["course_id"] not in owned)
        r = requests.post(f"{BASE}/trading/posts", headers=STU, json={
            "drop_course_ids": [not_owned], "add_course_ids": [], "note": None})
        assert r.status_code == 400

    def test_add_must_not_be_owned(self):
        my = _me_courses()
        r = requests.post(f"{BASE}/trading/posts", headers=STU, json={
            "drop_course_ids": [], "add_course_ids": [my[0]["course_id"]], "note": None})
        assert r.status_code == 400

    def test_empty_rejected(self):
        r = requests.post(f"{BASE}/trading/posts", headers=STU, json={
            "drop_course_ids": [], "add_course_ids": [], "note": "x"})
        assert r.status_code == 400

    def test_delete_own_and_others_forbidden(self):
        my = _me_courses()
        r = requests.post(f"{BASE}/trading/posts", headers=STU, json={
            "drop_course_ids": [my[0]["course_id"]], "add_course_ids": [], "note": None})
        pid = r.json()["post_id"]
        # student2 tries to delete
        d = requests.delete(f"{BASE}/trading/posts/{pid}", headers=STU2)
        assert d.status_code == 403
        # owner deletes
        d2 = requests.delete(f"{BASE}/trading/posts/{pid}", headers=STU)
        assert d2.status_code == 200
        assert requests.get(f"{BASE}/trading/mine", headers=STU).json()["post"] is None

    def test_admin_toggle_disables_board(self):
        try:
            requests.put(f"{BASE}/admin/trading/settings", json={"enabled": False}, headers=ADM)
            b = requests.get(f"{BASE}/trading/board", headers=STU).json()
            assert b["enabled"] is False
            # posting blocked
            my = _me_courses()
            r = requests.post(f"{BASE}/trading/posts", headers=STU, json={
                "drop_course_ids": [my[0]["course_id"]], "add_course_ids": [], "note": None})
            assert r.status_code == 403
        finally:
            requests.put(f"{BASE}/admin/trading/settings", json={"enabled": True}, headers=ADM)

    def test_window_closed_hides_board(self):
        try:
            requests.put(f"{BASE}/admin/window", json={"enabled": False}, headers=ADM)
            b = requests.get(f"{BASE}/trading/board", headers=STU).json()
            assert b["enabled"] is False
        finally:
            requests.put(f"{BASE}/admin/window", json={"enabled": True}, headers=ADM)

    def test_admin_view_and_remove(self):
        my = _me_courses()
        r = requests.post(f"{BASE}/trading/posts", headers=STU, json={
            "drop_course_ids": [my[0]["course_id"]], "add_course_ids": [], "note": "adm"})
        pid = r.json()["post_id"]
        a = requests.get(f"{BASE}/admin/trading", headers=ADM)
        assert a.status_code == 200
        d = a.json()
        assert "enabled" in d and "window_open" in d
        assert any(p["post_id"] == pid for p in d["posts"])
        # remove
        rm = requests.delete(f"{BASE}/admin/trading/{pid}", headers=ADM)
        assert rm.status_code == 200
        after = requests.get(f"{BASE}/admin/trading", headers=ADM).json()
        assert not any(p["post_id"] == pid for p in after["posts"])

    def test_student_blocked_from_admin_endpoints(self):
        assert requests.get(f"{BASE}/admin/trading", headers=STU).status_code == 403
        assert requests.put(f"{BASE}/admin/trading/settings", json={"enabled": True}, headers=STU).status_code == 403
        assert requests.delete(f"{BASE}/admin/trading/nonexistent", headers=STU).status_code == 403
