from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import io
import logging
import uuid
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import httpx
import pandas as pd
import openpyxl

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="PGP Course Change Request Portal")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ------------------------------------------------------------------
# Constants
# ------------------------------------------------------------------
ADMIN_EMAILS = {"pgp41473@iiml.ac.in", "secy.academics@iiml.ac.in"}
ALLOWED_DOMAINS = {"iim.ac.in", "iiml.ac.in"}
TERM_V_MIN_CREDITS = 5.0
TERM_V_MAX_CREDITS = 6.0
EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

REQUEST_TYPES = {"ADD", "DROP", "ADD_DROP", "COURSE_SWAP", "SECTION_SWAP"}
TERMINAL_STATUSES = {"REJECTED", "PARTNER_REJECTED", "CANCELLED", "EXECUTED"}

def now_utc():
    return datetime.now(timezone.utc)

def iso(dt: datetime) -> str:
    return dt.isoformat()

# ------------------------------------------------------------------
# Auth helpers
# ------------------------------------------------------------------
async def get_session_token(request: Request) -> Optional[str]:
    token = request.cookies.get("session_token")
    if token:
        return token
    auth = request.headers.get("Authorization")
    if auth and auth.startswith("Bearer "):
        return auth.split(" ", 1)[1]
    return None

async def get_current_user(request: Request) -> Dict[str, Any]:
    token = await get_session_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now_utc():
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user or not user.get("active", True):
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user

async def require_admin(request: Request) -> Dict[str, Any]:
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

async def require_student(request: Request) -> Dict[str, Any]:
    user = await get_current_user(request)
    if user.get("role") != "student":
        raise HTTPException(status_code=403, detail="Student access required")
    return user

# ------------------------------------------------------------------
# Audit
# ------------------------------------------------------------------
async def audit(action: str, actor: str, detail: str, request_id: Optional[str] = None):
    await db.audit_logs.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:12]}",
        "action": action,
        "actor": actor,
        "detail": detail,
        "request_id": request_id,
        "at": iso(now_utc()),
    })

# ------------------------------------------------------------------
# Auth endpoints
# ------------------------------------------------------------------
class SessionInput(BaseModel):
    session_id: str

@api_router.post("/auth/session")
async def create_session(payload: SessionInput, response: Response):
    async with httpx.AsyncClient(timeout=30) as hc:
        r = await hc.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": payload.session_id})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Failed to validate session")
    data = r.json()
    email = data["email"].lower()
    domain = email.split("@")[-1]
    if domain not in ALLOWED_DOMAINS:
        raise HTTPException(status_code=403, detail=f"Only institutional accounts ({', '.join(ALLOWED_DOMAINS)}) are permitted.")

    # Determine role and pgpid
    is_admin = email in ADMIN_EMAILS
    role = "admin" if is_admin else "student"
    pgpid = None
    if not is_admin:
        student = await db.students.find_one({"email": email}, {"_id": 0})
        if student:
            pgpid = student["pgpid"]
        else:
            pgpid = email.split("@")[0].upper()

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {
            "name": data.get("name", existing.get("name")),
            "picture": data.get("picture"),
            "role": role,
            "pgpid": pgpid,
            "active": True,
        }})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data.get("name", email),
            "picture": data.get("picture"),
            "role": role,
            "pgpid": pgpid,
            "active": True,
            "created_at": iso(now_utc()),
        })

    session_token = data["session_token"]
    expires_at = now_utc() + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": iso(expires_at),
        "created_at": iso(now_utc()),
    })

    response.set_cookie(key="session_token", value=session_token, httponly=True,
                        secure=True, samesite="none", path="/", max_age=7*24*60*60)
    await audit("LOGIN", pgpid or email, f"{role} logged in")
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    user["session_token"] = session_token  # returned once so frontend can use Authorization fallback
    return user

@api_router.get("/auth/me")
async def auth_me(request: Request):
    return await get_current_user(request)

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = await get_session_token(request)
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}

# ------------------------------------------------------------------
# Request Window
# ------------------------------------------------------------------
async def get_window_doc():
    doc = await db.settings.find_one({"key": "request_window"}, {"_id": 0})
    if not doc:
        doc = {"key": "request_window", "enabled": False, "opens_at": None, "closes_at": None}
        await db.settings.insert_one(doc)
        doc.pop("_id", None)
    return doc

def compute_window_state(doc):
    if not doc.get("enabled"):
        return {"is_open": False, "message": "Course change requests are currently closed.", "phase": "disabled"}
    now = now_utc()
    opens = doc.get("opens_at")
    closes = doc.get("closes_at")
    opens_dt = datetime.fromisoformat(opens) if opens else None
    closes_dt = datetime.fromisoformat(closes) if closes else None
    if opens_dt and opens_dt.tzinfo is None:
        opens_dt = opens_dt.replace(tzinfo=timezone.utc)
    if closes_dt and closes_dt.tzinfo is None:
        closes_dt = closes_dt.replace(tzinfo=timezone.utc)
    if opens_dt and now < opens_dt:
        return {"is_open": False, "message": "Course change requests are currently closed.", "phase": "before"}
    if closes_dt and now > closes_dt:
        return {"is_open": False, "message": "The request window has closed.", "phase": "after"}
    return {"is_open": True, "message": "Course change requests are open.", "phase": "open"}

@api_router.get("/window")
async def window_status(request: Request):
    await get_current_user(request)
    doc = await get_window_doc()
    state = compute_window_state(doc)
    return {**state, "opens_at": doc.get("opens_at"), "closes_at": doc.get("closes_at"), "enabled": doc.get("enabled")}

class WindowInput(BaseModel):
    enabled: bool
    opens_at: Optional[str] = None
    closes_at: Optional[str] = None

@api_router.put("/admin/window")
async def update_window(payload: WindowInput, admin=Depends(require_admin)):
    await db.settings.update_one({"key": "request_window"}, {"$set": {
        "enabled": payload.enabled,
        "opens_at": payload.opens_at,
        "closes_at": payload.closes_at,
    }}, upsert=True)
    await audit("WINDOW_UPDATE", admin.get("email"), f"enabled={payload.enabled} opens={payload.opens_at} closes={payload.closes_at}")
    doc = await get_window_doc()
    return {**compute_window_state(doc), "opens_at": doc.get("opens_at"), "closes_at": doc.get("closes_at"), "enabled": doc.get("enabled")}

# ------------------------------------------------------------------
# Master data lookups
# ------------------------------------------------------------------
async def build_course_section_maps():
    courses = await db.courses.find({}, {"_id": 0}).to_list(1000)
    sections = await db.sections.find({}, {"_id": 0}).to_list(2000)
    cmap = {c["course_id"]: c for c in courses}
    smap = {s["section_id"]: s for s in sections}
    return cmap, smap

async def enrich_enrollment(e, cmap, smap):
    c = cmap.get(e["course_id"], {})
    s = smap.get(e["section_id"], {})
    return {
        "course_id": e["course_id"],
        "section_id": e["section_id"],
        "course_code": c.get("course_code"),
        "course_name": c.get("course_name"),
        "credits": c.get("credits"),
        "area": c.get("area"),
        "section_name": s.get("section_name"),
        "day": s.get("day"),
        "time_slot": s.get("time_slot"),
        "mid_tag": s.get("mid_tag"),
    }

# ------------------------------------------------------------------
# Student endpoints
# ------------------------------------------------------------------
@api_router.get("/student/dashboard")
async def student_dashboard(student=Depends(require_student)):
    pgpid = student["pgpid"]
    cmap, smap = await build_course_section_maps()
    enrolls = await db.enrollments.find({"pgpid": pgpid}, {"_id": 0}).to_list(1000)
    courses = [await enrich_enrollment(e, cmap, smap) for e in enrolls]
    total_credits = round(sum((c.get("credits") or 0) for c in courses), 1)
    master = await db.students.find_one({"pgpid": pgpid}, {"_id": 0}) or {}
    program = master.get("program", "PGP")
    stex = bool(master.get("stex", False))
    rule_applies = (program == "PGP") and not stex
    credit_status = "ok"
    credit_message = f"Your total Term V credits: {total_credits}"
    if rule_applies:
        if total_credits < TERM_V_MIN_CREDITS:
            credit_status = "under"
            credit_message = f"You have {total_credits} credits. Term V requires between {TERM_V_MIN_CREDITS} and {TERM_V_MAX_CREDITS} credits — you are below the minimum."
        elif total_credits > TERM_V_MAX_CREDITS:
            credit_status = "over"
            credit_message = f"You have {total_credits} credits. Term V allows a maximum of {TERM_V_MAX_CREDITS} credits — you are above the limit."
        else:
            credit_message = f"You have {total_credits} credits — within the Term V range ({TERM_V_MIN_CREDITS}–{TERM_V_MAX_CREDITS})."
    doc = await get_window_doc()
    return {
        "name": student["name"],
        "pgpid": pgpid,
        "email": student["email"],
        "program": program,
        "stex": stex,
        "courses": courses,
        "total_credits": total_credits,
        "credit_status": credit_status,
        "credit_message": credit_message,
        "credit_min": TERM_V_MIN_CREDITS,
        "credit_max": TERM_V_MAX_CREDITS,
        "window": compute_window_state(doc),
    }

@api_router.get("/student/timetable")
async def student_timetable(student=Depends(require_student)):
    pgpid = student["pgpid"]
    cmap, smap = await build_course_section_maps()
    enrolls = await db.enrollments.find({"pgpid": pgpid}, {"_id": 0}).to_list(1000)
    entries = [await enrich_enrollment(e, cmap, smap) for e in enrolls]
    return {"entries": entries}

@api_router.get("/student/available-courses")
async def available_courses(student=Depends(require_student)):
    """Courses & sections WITHOUT any capacity/strength information (credits & schedule are allowed)."""
    courses = await db.courses.find({}, {"_id": 0}).to_list(1000)
    sections = await db.sections.find({}, {"_id": 0, "min_capacity": 0, "max_capacity": 0}).to_list(2000)
    by_course = {}
    for s in sections:
        by_course.setdefault(s["course_id"], []).append({
            "section_id": s["section_id"], "section_name": s["section_name"],
            "day": s.get("day"), "time_slot": s.get("time_slot"), "mid_tag": s.get("mid_tag"),
        })
    result = []
    for c in courses:
        secs = sorted(by_course.get(c["course_id"], []), key=lambda x: x["section_name"])
        result.append({"course_id": c["course_id"], "course_code": c["course_code"], "course_name": c["course_name"],
                       "credits": c.get("credits"), "area": c.get("area"), "sections": secs})
    return sorted(result, key=lambda x: x["course_name"])

@api_router.get("/student/lookup-partner")
async def lookup_partner(pgpid: str, student=Depends(require_student)):
    pgpid = pgpid.strip().upper()
    if pgpid == student["pgpid"]:
        raise HTTPException(status_code=400, detail="You cannot swap with yourself.")
    partner = await db.students.find_one({"pgpid": pgpid}, {"_id": 0})
    if not partner:
        raise HTTPException(status_code=404, detail="No student found with that PGPID.")
    cmap, smap = await build_course_section_maps()
    enrolls = await db.enrollments.find({"pgpid": pgpid}, {"_id": 0}).to_list(1000)
    courses = [await enrich_enrollment(e, cmap, smap) for e in enrolls]
    return {"pgpid": pgpid, "name": partner["name"], "courses": courses}

async def get_student_active_courses(pgpid: str) -> set:
    """course_ids referenced by student's non-terminal requests."""
    active = set()
    cursor = db.requests.find({"$or": [{"student_pgpid": pgpid}, {"swap.partner_pgpid": pgpid}], "status": {"$nin": list(TERMINAL_STATUSES)}}, {"_id": 0})
    async for req in cursor:
        for a in req.get("actions", []):
            if a.get("course_id"):
                active.add(a["course_id"])
        sw = req.get("swap")
        if sw:
            for key in ["initiator_current", "initiator_requested", "partner_current", "partner_requested"]:
                reg = sw.get(key)
                if reg and reg.get("course_id"):
                    active.add(reg["course_id"])
    return active

class RequestInput(BaseModel):
    request_type: str
    comment: Optional[str] = None
    # add / drop / add_drop
    drop_course_id: Optional[str] = None
    drop_section_id: Optional[str] = None
    add_course_id: Optional[str] = None
    add_section_id: Optional[str] = None
    # swaps
    partner_pgpid: Optional[str] = None
    # course swap: initiator gives own course, wants partner's course
    give_course_id: Optional[str] = None
    give_section_id: Optional[str] = None
    want_course_id: Optional[str] = None
    want_section_id: Optional[str] = None
    # section swap: same course, own section -> requested section
    swap_course_id: Optional[str] = None
    my_section_id: Optional[str] = None
    requested_section_id: Optional[str] = None

async def ensure_window_open():
    doc = await get_window_doc()
    state = compute_window_state(doc)
    if not state["is_open"]:
        raise HTTPException(status_code=403, detail=state["message"])

def new_request_base(student, request_type, comment):
    return {
        "request_id": f"R{uuid.uuid4().hex[:8].upper()}",
        "student_pgpid": student["pgpid"],
        "student_name": student["name"],
        "student_email": student["email"],
        "request_type": request_type,
        "comment": comment,
        "admin_comment": None,
        "actions": [],
        "swap": None,
        "created_at": iso(now_utc()),
        "updated_at": iso(now_utc()),
        "history": [],
    }

def add_history(req, status, by, note=""):
    req["status"] = status
    req["updated_at"] = iso(now_utc())
    req["history"].append({"status": status, "by": by, "note": note, "at": iso(now_utc())})

async def check_conflicts(pgpid, course_ids: set):
    active = await get_student_active_courses(pgpid)
    clash = active.intersection(course_ids)
    if clash:
        cmap, _ = await build_course_section_maps()
        names = [cmap.get(cid, {}).get("course_name", cid) for cid in clash]
        raise HTTPException(status_code=409, detail=f"You already have an active request involving: {', '.join(names)}. Please cancel it before submitting a conflicting request.")

@api_router.post("/student/requests")
async def submit_request(payload: RequestInput, student=Depends(require_student)):
    await ensure_window_open()
    rtype = payload.request_type
    if rtype not in REQUEST_TYPES:
        raise HTTPException(status_code=400, detail="Invalid request type")
    pgpid = student["pgpid"]
    cmap, smap = await build_course_section_maps()

    async def owns(course_id, section_id):
        e = await db.enrollments.find_one({"pgpid": pgpid, "course_id": course_id, "section_id": section_id}, {"_id": 0})
        return e is not None

    def valid_section(course_id, section_id):
        s = smap.get(section_id)
        return s is not None and s["course_id"] == course_id

    req = new_request_base(student, rtype, payload.comment)

    if rtype == "ADD":
        if not payload.add_course_id or not payload.add_section_id or not valid_section(payload.add_course_id, payload.add_section_id):
            raise HTTPException(status_code=400, detail="Invalid course/section for add.")
        await check_conflicts(pgpid, {payload.add_course_id})
        req["actions"].append({"action": "ADD", "course_id": payload.add_course_id, "section_id": payload.add_section_id,
                               "course_name": cmap[payload.add_course_id]["course_name"], "section_name": smap[payload.add_section_id]["section_name"]})
        add_history(req, "SUBMITTED", pgpid, "Add request submitted")

    elif rtype == "DROP":
        if not payload.drop_course_id or not payload.drop_section_id or not await owns(payload.drop_course_id, payload.drop_section_id):
            raise HTTPException(status_code=400, detail="You are not enrolled in the selected course/section.")
        await check_conflicts(pgpid, {payload.drop_course_id})
        req["actions"].append({"action": "DROP", "course_id": payload.drop_course_id, "section_id": payload.drop_section_id,
                               "course_name": cmap[payload.drop_course_id]["course_name"], "section_name": smap[payload.drop_section_id]["section_name"]})
        add_history(req, "SUBMITTED", pgpid, "Drop request submitted")

    elif rtype == "ADD_DROP":
        if not payload.drop_course_id or not payload.drop_section_id or not await owns(payload.drop_course_id, payload.drop_section_id):
            raise HTTPException(status_code=400, detail="You are not enrolled in the course/section to drop.")
        if not payload.add_course_id or not payload.add_section_id or not valid_section(payload.add_course_id, payload.add_section_id):
            raise HTTPException(status_code=400, detail="Invalid course/section for add.")
        if payload.add_course_id == payload.drop_course_id:
            raise HTTPException(status_code=400, detail="Add and Drop cannot be the same course. Use Section Swap instead.")
        await check_conflicts(pgpid, {payload.add_course_id, payload.drop_course_id})
        req["actions"].append({"action": "DROP", "course_id": payload.drop_course_id, "section_id": payload.drop_section_id,
                               "course_name": cmap[payload.drop_course_id]["course_name"], "section_name": smap[payload.drop_section_id]["section_name"]})
        req["actions"].append({"action": "ADD", "course_id": payload.add_course_id, "section_id": payload.add_section_id,
                               "course_name": cmap[payload.add_course_id]["course_name"], "section_name": smap[payload.add_section_id]["section_name"]})
        add_history(req, "SUBMITTED", pgpid, "Add + Drop request submitted")

    elif rtype in ("COURSE_SWAP", "SECTION_SWAP"):
        partner_pgpid = (payload.partner_pgpid or "").strip().upper()
        if not partner_pgpid or partner_pgpid == pgpid:
            raise HTTPException(status_code=400, detail="Invalid swap partner.")
        partner = await db.students.find_one({"pgpid": partner_pgpid}, {"_id": 0})
        if not partner:
            raise HTTPException(status_code=404, detail="Swap partner PGPID not found.")

        if rtype == "COURSE_SWAP":
            # initiator gives own (give_course/section) -> wants partner's (want_course/section)
            if not await owns(payload.give_course_id, payload.give_section_id):
                raise HTTPException(status_code=400, detail="You are not enrolled in the course you are offering.")
            partner_has = await db.enrollments.find_one({"pgpid": partner_pgpid, "course_id": payload.want_course_id, "section_id": payload.want_section_id}, {"_id": 0})
            if not partner_has:
                raise HTTPException(status_code=400, detail="Swap partner is not enrolled in the course you want.")
            if payload.give_course_id == payload.want_course_id:
                raise HTTPException(status_code=400, detail="Course swap must involve two different courses.")
            await check_conflicts(pgpid, {payload.give_course_id, payload.want_course_id})
            req["swap"] = {
                "kind": "COURSE",
                "partner_pgpid": partner_pgpid,
                "partner_name": partner["name"],
                "initiator_current": {"course_id": payload.give_course_id, "section_id": payload.give_section_id,
                                      "course_name": cmap[payload.give_course_id]["course_name"], "section_name": smap[payload.give_section_id]["section_name"]},
                "initiator_requested": {"course_id": payload.want_course_id, "section_id": payload.want_section_id,
                                        "course_name": cmap[payload.want_course_id]["course_name"], "section_name": smap[payload.want_section_id]["section_name"]},
                "partner_current": {"course_id": payload.want_course_id, "section_id": payload.want_section_id,
                                    "course_name": cmap[payload.want_course_id]["course_name"], "section_name": smap[payload.want_section_id]["section_name"]},
                "partner_requested": {"course_id": payload.give_course_id, "section_id": payload.give_section_id,
                                      "course_name": cmap[payload.give_course_id]["course_name"], "section_name": smap[payload.give_section_id]["section_name"]},
                "initiator_confirmed": True,
                "partner_confirmed": None,
            }
        else:  # SECTION_SWAP
            course_id = payload.swap_course_id
            if not await owns(course_id, payload.my_section_id):
                raise HTTPException(status_code=400, detail="You are not enrolled in the selected course/section.")
            if not valid_section(course_id, payload.requested_section_id) or payload.requested_section_id == payload.my_section_id:
                raise HTTPException(status_code=400, detail="Invalid requested section.")
            partner_has = await db.enrollments.find_one({"pgpid": partner_pgpid, "course_id": course_id, "section_id": payload.requested_section_id}, {"_id": 0})
            if not partner_has:
                raise HTTPException(status_code=400, detail="Swap partner is not in the section you requested.")
            await check_conflicts(pgpid, {course_id})
            req["swap"] = {
                "kind": "SECTION",
                "partner_pgpid": partner_pgpid,
                "partner_name": partner["name"],
                "initiator_current": {"course_id": course_id, "section_id": payload.my_section_id,
                                      "course_name": cmap[course_id]["course_name"], "section_name": smap[payload.my_section_id]["section_name"]},
                "initiator_requested": {"course_id": course_id, "section_id": payload.requested_section_id,
                                        "course_name": cmap[course_id]["course_name"], "section_name": smap[payload.requested_section_id]["section_name"]},
                "partner_current": {"course_id": course_id, "section_id": payload.requested_section_id,
                                    "course_name": cmap[course_id]["course_name"], "section_name": smap[payload.requested_section_id]["section_name"]},
                "partner_requested": {"course_id": course_id, "section_id": payload.my_section_id,
                                      "course_name": cmap[course_id]["course_name"], "section_name": smap[payload.my_section_id]["section_name"]},
                "initiator_confirmed": True,
                "partner_confirmed": None,
            }
        add_history(req, "AWAITING_PARTNER_CONFIRMATION", pgpid, f"Swap request sent to {partner_pgpid}")
        # notification for partner
        await db.notifications.insert_one({
            "notification_id": f"n_{uuid.uuid4().hex[:12]}",
            "pgpid": partner_pgpid,
            "type": "SWAP_REQUEST",
            "request_id": req["request_id"],
            "message": f"{pgpid} has requested a {req['swap']['kind'].lower()} swap with you.",
            "read": False,
            "created_at": iso(now_utc()),
        })

    await db.requests.insert_one({**req})
    await audit("SUBMIT", pgpid, f"submitted {rtype}", req["request_id"])
    req.pop("_id", None)
    return req

@api_router.get("/student/requests")
async def my_requests(student=Depends(require_student)):
    pgpid = student["pgpid"]
    reqs = await db.requests.find({"student_pgpid": pgpid}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return reqs

@api_router.get("/student/requests/{request_id}")
async def my_request_detail(request_id: str, student=Depends(require_student)):
    pgpid = student["pgpid"]
    req = await db.requests.find_one({"request_id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    involved = req["student_pgpid"] == pgpid or (req.get("swap") and req["swap"]["partner_pgpid"] == pgpid)
    if not involved:
        raise HTTPException(status_code=403, detail="Access denied")
    return req

@api_router.post("/student/requests/{request_id}/cancel")
async def cancel_request(request_id: str, student=Depends(require_student)):
    pgpid = student["pgpid"]
    req = await db.requests.find_one({"request_id": request_id}, {"_id": 0})
    if not req or req["student_pgpid"] != pgpid:
        raise HTTPException(status_code=403, detail="Access denied")
    if req["status"] in TERMINAL_STATUSES or req["status"] in ("APPROVED_PENDING_EXECUTION",):
        raise HTTPException(status_code=400, detail="This request can no longer be cancelled.")
    add_history(req, "CANCELLED", pgpid, "Cancelled by student")
    await db.requests.update_one({"request_id": request_id}, {"$set": {"status": req["status"], "updated_at": req["updated_at"], "history": req["history"]}})
    await audit("CANCEL", pgpid, "cancelled request", request_id)
    return {"ok": True}

# ---- Notifications & swap response ----
@api_router.get("/student/notifications")
async def notifications(student=Depends(require_student)):
    pgpid = student["pgpid"]
    notes = await db.notifications.find({"pgpid": pgpid}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return notes

@api_router.post("/student/notifications/{notification_id}/read")
async def mark_read(notification_id: str, student=Depends(require_student)):
    await db.notifications.update_one({"notification_id": notification_id, "pgpid": student["pgpid"]}, {"$set": {"read": True}})
    return {"ok": True}

@api_router.get("/student/pending-swaps")
async def pending_swaps(student=Depends(require_student)):
    pgpid = student["pgpid"]
    reqs = await db.requests.find({"swap.partner_pgpid": pgpid, "status": "AWAITING_PARTNER_CONFIRMATION"}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return reqs

class SwapResponseInput(BaseModel):
    action: str  # accept | reject

@api_router.post("/student/swaps/{request_id}/respond")
async def respond_swap(request_id: str, payload: SwapResponseInput, student=Depends(require_student)):
    pgpid = student["pgpid"]
    req = await db.requests.find_one({"request_id": request_id}, {"_id": 0})
    if not req or not req.get("swap") or req["swap"]["partner_pgpid"] != pgpid:
        raise HTTPException(status_code=403, detail="This swap request is not addressed to you.")
    if req["status"] != "AWAITING_PARTNER_CONFIRMATION":
        raise HTTPException(status_code=400, detail="This swap can no longer be responded to.")
    swap = req["swap"]
    if payload.action == "accept":
        swap["partner_confirmed"] = True
        add_history(req, "BOTH_CONFIRMED", pgpid, "Partner accepted the swap")
        note = "Swap accepted — awaiting admin approval"
        await db.notifications.insert_one({
            "notification_id": f"n_{uuid.uuid4().hex[:12]}", "pgpid": req["student_pgpid"],
            "type": "SWAP_ACCEPTED", "request_id": request_id,
            "message": f"{pgpid} accepted your swap request. Awaiting admin approval.", "read": False, "created_at": iso(now_utc())})
    elif payload.action == "reject":
        swap["partner_confirmed"] = False
        add_history(req, "PARTNER_REJECTED", pgpid, "Partner rejected the swap")
        note = "Swap rejected by partner"
        await db.notifications.insert_one({
            "notification_id": f"n_{uuid.uuid4().hex[:12]}", "pgpid": req["student_pgpid"],
            "type": "SWAP_REJECTED", "request_id": request_id,
            "message": f"{pgpid} rejected your swap request.", "read": False, "created_at": iso(now_utc())})
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
    await db.requests.update_one({"request_id": request_id}, {"$set": {"swap": swap, "status": req["status"], "updated_at": req["updated_at"], "history": req["history"]}})
    await audit("SWAP_RESPONSE", pgpid, note, request_id)
    return {"ok": True, "status": req["status"]}

# ------------------------------------------------------------------
# Admin endpoints
# ------------------------------------------------------------------
@api_router.get("/admin/dashboard")
async def admin_dashboard(admin=Depends(require_admin)):
    students = await db.students.count_documents({})
    courses = await db.courses.count_documents({})
    sections = await db.sections.count_documents({})
    all_reqs = await db.requests.find({}, {"_id": 0}).to_list(10000)
    def count_type(t):
        return sum(1 for r in all_reqs if r["request_type"] == t)
    awaiting_admin = sum(1 for r in all_reqs if r["status"] in ("SUBMITTED", "UNDER_REVIEW", "BOTH_CONFIRMED"))
    pending_swap_conf = sum(1 for r in all_reqs if r["status"] == "AWAITING_PARTNER_CONFIRMATION")
    return {
        "total_students": students,
        "total_courses": courses,
        "total_sections": sections,
        "total_requests": len(all_reqs),
        "add_requests": count_type("ADD"),
        "drop_requests": count_type("DROP"),
        "add_drop_requests": count_type("ADD_DROP"),
        "course_swaps": count_type("COURSE_SWAP"),
        "section_swaps": count_type("SECTION_SWAP"),
        "pending_swap_confirmations": pending_swap_conf,
        "awaiting_admin_review": awaiting_admin,
    }

@api_router.get("/admin/requests")
async def admin_requests(admin=Depends(require_admin)):
    reqs = await db.requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    return reqs

@api_router.get("/admin/requests/{request_id}")
async def admin_request_detail(request_id: str, admin=Depends(require_admin)):
    req = await db.requests.find_one({"request_id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Not found")
    return req

class DecisionInput(BaseModel):
    decision: str  # approve | reject | executed | under_review
    comment: Optional[str] = None

@api_router.post("/admin/requests/{request_id}/decision")
async def admin_decision(request_id: str, payload: DecisionInput, admin=Depends(require_admin)):
    req = await db.requests.find_one({"request_id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Not found")
    is_swap = req.get("swap") is not None
    status = req["status"]
    d = payload.decision
    if is_swap and d == "approve" and status != "BOTH_CONFIRMED":
        raise HTTPException(status_code=400, detail="Swap can only be approved after both students have confirmed.")
    if d == "under_review":
        add_history(req, "UNDER_REVIEW", admin["email"], payload.comment or "Marked under review")
    elif d == "approve":
        add_history(req, "APPROVED_PENDING_EXECUTION", admin["email"], payload.comment or "Approved — pending execution")
    elif d == "reject":
        add_history(req, "REJECTED", admin["email"], payload.comment or "Rejected by admin")
    elif d == "executed":
        if status != "APPROVED_PENDING_EXECUTION":
            raise HTTPException(status_code=400, detail="Only approved requests can be marked executed.")
        add_history(req, "EXECUTED", admin["email"], payload.comment or "Marked executed")
    else:
        raise HTTPException(status_code=400, detail="Invalid decision")
    req["admin_comment"] = payload.comment
    await db.requests.update_one({"request_id": request_id}, {"$set": {"status": req["status"], "admin_comment": req["admin_comment"], "updated_at": req["updated_at"], "history": req["history"]}})
    # notify involved students
    targets = [req["student_pgpid"]]
    if is_swap:
        targets.append(req["swap"]["partner_pgpid"])
    for t in targets:
        await db.notifications.insert_one({"notification_id": f"n_{uuid.uuid4().hex[:12]}", "pgpid": t, "type": "ADMIN_DECISION", "request_id": request_id, "message": f"Request {request_id} is now {req['status'].replace('_',' ').title()}.", "read": False, "created_at": iso(now_utc())})
    await audit("ADMIN_DECISION", admin["email"], f"{d} -> {req['status']}", request_id)
    return {"ok": True, "status": req["status"]}

@api_router.get("/admin/students")
async def admin_students(admin=Depends(require_admin)):
    return await db.students.find({}, {"_id": 0}).sort("pgpid", 1).to_list(5000)

@api_router.get("/admin/courses")
async def admin_courses(admin=Depends(require_admin)):
    return await db.courses.find({}, {"_id": 0}).sort("course_code", 1).to_list(2000)

@api_router.get("/admin/sections")
async def admin_sections(admin=Depends(require_admin)):
    cmap, _ = await build_course_section_maps()
    secs = await db.sections.find({}, {"_id": 0}).to_list(4000)
    for s in secs:
        s["course_name"] = cmap.get(s["course_id"], {}).get("course_name")
        s["course_code"] = cmap.get(s["course_id"], {}).get("course_code")
    return sorted(secs, key=lambda x: (x.get("course_code") or "", x["section_name"]))

async def compute_capacity():
    cmap, smap = await build_course_section_maps()
    sections = await db.sections.find({}, {"_id": 0}).to_list(4000)
    # current enrollment per section
    enrolls = await db.enrollments.find({}, {"_id": 0}).to_list(50000)
    current = {}
    for e in enrolls:
        current[e["section_id"]] = current.get(e["section_id"], 0) + 1
    # pending adds/drops per section from non-terminal requests
    adds = {}
    drops = {}
    cursor = db.requests.find({"status": {"$nin": list(TERMINAL_STATUSES)}}, {"_id": 0})
    async for r in cursor:
        for a in r.get("actions", []):
            if a["action"] == "ADD":
                adds[a["section_id"]] = adds.get(a["section_id"], 0) + 1
            elif a["action"] == "DROP":
                drops[a["section_id"]] = drops.get(a["section_id"], 0) + 1
        sw = r.get("swap")
        if sw:
            # section change: partner moves reflected too; count net moves as add to requested, drop from current for both
            for reg_from, reg_to in [(sw["initiator_current"], sw["initiator_requested"]), (sw["partner_current"], sw["partner_requested"])]:
                drops[reg_from["section_id"]] = drops.get(reg_from["section_id"], 0) + 1
                adds[reg_to["section_id"]] = adds.get(reg_to["section_id"], 0) + 1
    rows = []
    for s in sorted(sections, key=lambda x: (cmap.get(x["course_id"], {}).get("course_code") or "", x["section_name"])):
        sid = s["section_id"]
        cur = current.get(sid, 0)
        pa = adds.get(sid, 0)
        pd = drops.get(sid, 0)
        rows.append({
            "section_id": sid,
            "course_code": cmap.get(s["course_id"], {}).get("course_code"),
            "course_name": cmap.get(s["course_id"], {}).get("course_name"),
            "section_name": s["section_name"],
            "current": cur,
            "min_capacity": s.get("min_capacity"),
            "max_capacity": s.get("max_capacity"),
            "pending_adds": pa,
            "pending_drops": pd,
            "net_change": pa - pd,
            "projected": cur + pa - pd,
        })
    return rows

@api_router.get("/admin/capacity")
async def admin_capacity(admin=Depends(require_admin)):
    return await compute_capacity()

@api_router.get("/admin/audit")
async def admin_audit(admin=Depends(require_admin)):
    return await db.audit_logs.find({}, {"_id": 0}).sort("at", -1).to_list(2000)

# ---- Export ----
@api_router.get("/admin/export")
async def admin_export(admin=Depends(require_admin)):
    reqs = await db.requests.find({}, {"_id": 0}).sort("created_at", 1).to_list(20000)
    rows = []
    for r in reqs:
        actions = {a["action"]: a for a in r.get("actions", [])}
        sw = r.get("swap") or {}
        drop = actions.get("DROP", {})
        add = actions.get("ADD", {})
        current_course = current_section = ""
        add_course = add_section = ""
        drop_course = drop_section = ""
        if sw:
            current_course = sw.get("initiator_current", {}).get("course_name", "")
            current_section = sw.get("initiator_current", {}).get("section_name", "")
            add_course = sw.get("initiator_requested", {}).get("course_name", "")
            add_section = sw.get("initiator_requested", {}).get("section_name", "")
        rows.append({
            "Request ID": r["request_id"],
            "PGPID": r["student_pgpid"],
            "Student Name": r["student_name"],
            "Student Email": r["student_email"],
            "Request Type": r["request_type"],
            "Current Course": current_course,
            "Current Section": current_section,
            "Course to Drop": drop.get("course_name", ""),
            "Section to Drop": drop.get("section_name", ""),
            "Course to Add": add.get("course_name", "") or add_course,
            "Preferred Add Section": add.get("section_name", "") or add_section,
            "Swap Partner PGPID": sw.get("partner_pgpid", ""),
            "Swap Partner Name": sw.get("partner_name", ""),
            "Partner Confirmation": ("" if not sw else ("Accepted" if sw.get("partner_confirmed") is True else ("Rejected" if sw.get("partner_confirmed") is False else "Pending"))),
            "Request Status": r["status"],
            "Student Comment": r.get("comment", ""),
            "Admin Comment": r.get("admin_comment", ""),
            "Submitted At": r["created_at"],
            "Updated At": r["updated_at"],
        })
    df = pd.DataFrame(rows)
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Requests")
    buf.seek(0)
    await audit("EXPORT", admin["email"], f"exported {len(rows)} requests")
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": "attachment; filename=course_change_requests.xlsx"})

# ---- Master data import ----
def read_upload_to_df(content: bytes, filename: str) -> pd.DataFrame:
    if filename.lower().endswith(".csv"):
        return pd.read_csv(io.BytesIO(content), dtype=str).fillna("")
    return pd.read_excel(io.BytesIO(content), dtype=str).fillna("")

def norm_cols(df):
    df.columns = [str(c).strip().lower() for c in df.columns]
    return df

async def validate_import(kind: str, df: pd.DataFrame):
    df = norm_cols(df)
    rows = []
    valid_count = 0
    error_count = 0
    existing_students = {s["pgpid"]: s for s in await db.students.find({}, {"_id": 0}).to_list(10000)}
    courses = await db.courses.find({}, {"_id": 0}).to_list(2000)
    course_by_code = {c["course_code"].upper(): c for c in courses}
    sections = await db.sections.find({}, {"_id": 0}).to_list(4000)
    section_lookup = {(s["course_id"], s["section_name"].upper()): s for s in sections}

    for _, r in df.iterrows():
        errors = []
        data = {}
        if kind == "students":
            pgpid = (r.get("pgpid") or r.get("pgp id") or "").strip().upper()
            name = (r.get("name") or "").strip()
            email = (r.get("email") or "").strip().lower()
            if not pgpid: errors.append("Missing PGPID")
            if not name: errors.append("Missing Name")
            if not email or "@" not in email: errors.append("Invalid Email")
            data = {"pgpid": pgpid, "name": name, "email": email}
        elif kind == "courses":
            code = (r.get("course_code") or r.get("course code") or r.get("code") or "").strip().upper()
            name = (r.get("course_name") or r.get("course name") or r.get("name") or "").strip()
            if not code: errors.append("Missing Course Code")
            if not name: errors.append("Missing Course Name")
            data = {"course_code": code, "course_name": name}
        elif kind == "sections":
            code = (r.get("course_code") or r.get("course code") or r.get("code") or "").strip().upper()
            section = (r.get("section") or r.get("section_name") or "").strip().upper()
            mn = (r.get("min") or r.get("min_capacity") or r.get("minimum") or "").strip()
            mx = (r.get("max") or r.get("max_capacity") or r.get("maximum") or "").strip()
            if code not in course_by_code: errors.append(f"Course '{code}' not found")
            if not section: errors.append("Missing Section")
            try:
                mn_i = int(float(mn)); mx_i = int(float(mx))
                if mn_i > mx_i: errors.append("Min > Max")
            except Exception:
                errors.append("Invalid Min/Max"); mn_i = 0; mx_i = 0
            data = {"course_code": code, "section_name": section, "min_capacity": mn_i, "max_capacity": mx_i}
        elif kind == "enrollments":
            pgpid = (r.get("pgpid") or r.get("pgp id") or "").strip().upper()
            code = (r.get("course_code") or r.get("course code") or r.get("code") or "").strip().upper()
            section = (r.get("section") or r.get("section_name") or "").strip().upper()
            if pgpid not in existing_students: errors.append(f"Student '{pgpid}' not found")
            course = course_by_code.get(code)
            if not course:
                errors.append(f"Course '{code}' not found")
            elif (course["course_id"], section) not in section_lookup:
                errors.append(f"Section '{section}' not found for {code}")
            data = {"pgpid": pgpid, "course_code": code, "section_name": section}
        else:
            raise HTTPException(status_code=400, detail="Invalid import kind")

        valid = len(errors) == 0
        if valid: valid_count += 1
        else: error_count += 1
        rows.append({"data": data, "valid": valid, "errors": errors})
    return rows, valid_count, error_count

@api_router.post("/admin/import/preview")
async def import_preview(kind: str = Form(...), file: UploadFile = File(...), admin=Depends(require_admin)):
    content = await file.read()
    df = read_upload_to_df(content, file.filename)
    rows, valid_count, error_count = await validate_import(kind, df)
    token = f"imp_{uuid.uuid4().hex[:12]}"
    await db.import_staging.insert_one({"token": token, "kind": kind, "rows": rows, "created_at": iso(now_utc())})
    return {"token": token, "kind": kind, "total": len(rows), "valid": valid_count, "errors": error_count,
            "columns": list(df.columns), "rows": rows[:200]}

class CommitInput(BaseModel):
    token: str

@api_router.post("/admin/import/commit")
async def import_commit(payload: CommitInput, admin=Depends(require_admin)):
    staging = await db.import_staging.find_one({"token": payload.token}, {"_id": 0})
    if not staging:
        raise HTTPException(status_code=404, detail="Import session expired. Please re-upload.")
    kind = staging["kind"]
    valid_rows = [r["data"] for r in staging["rows"] if r["valid"]]
    inserted = 0
    course_by_code = {c["course_code"].upper(): c for c in await db.courses.find({}, {"_id": 0}).to_list(2000)}

    for d in valid_rows:
        if kind == "students":
            await db.students.update_one({"pgpid": d["pgpid"]}, {"$set": d}, upsert=True)
            inserted += 1
        elif kind == "courses":
            existing = course_by_code.get(d["course_code"])
            if existing:
                await db.courses.update_one({"course_id": existing["course_id"]}, {"$set": {"course_name": d["course_name"]}})
            else:
                cid = f"course_{uuid.uuid4().hex[:10]}"
                await db.courses.insert_one({"course_id": cid, "course_code": d["course_code"], "course_name": d["course_name"]})
                course_by_code[d["course_code"]] = {"course_id": cid, **d}
            inserted += 1
    # re-fetch maps for sections/enrollments
    if kind == "sections":
        course_by_code = {c["course_code"].upper(): c for c in await db.courses.find({}, {"_id": 0}).to_list(2000)}
        for d in valid_rows:
            course = course_by_code.get(d["course_code"])
            if not course: continue
            existing = await db.sections.find_one({"course_id": course["course_id"], "section_name": d["section_name"]}, {"_id": 0})
            payload_s = {"course_id": course["course_id"], "section_name": d["section_name"], "min_capacity": d["min_capacity"], "max_capacity": d["max_capacity"]}
            if existing:
                await db.sections.update_one({"section_id": existing["section_id"]}, {"$set": payload_s})
            else:
                sid = f"section_{uuid.uuid4().hex[:10]}"
                await db.sections.insert_one({"section_id": sid, **payload_s})
            inserted += 1
    if kind == "enrollments":
        course_by_code = {c["course_code"].upper(): c for c in await db.courses.find({}, {"_id": 0}).to_list(2000)}
        for d in valid_rows:
            course = course_by_code.get(d["course_code"])
            if not course: continue
            section = await db.sections.find_one({"course_id": course["course_id"], "section_name": d["section_name"]}, {"_id": 0})
            if not section: continue
            await db.enrollments.update_one({"pgpid": d["pgpid"], "course_id": course["course_id"]},
                                            {"$set": {"pgpid": d["pgpid"], "course_id": course["course_id"], "section_id": section["section_id"]}}, upsert=True)
            inserted += 1

    await db.import_staging.delete_one({"token": payload.token})
    await audit("IMPORT", admin["email"], f"imported {inserted} {kind} records")
    return {"ok": True, "inserted": inserted, "kind": kind}

class SectionLimits(BaseModel):
    min_capacity: Optional[int] = None
    max_capacity: Optional[int] = None

@api_router.put("/admin/sections/{section_id}")
async def update_section_limits(section_id: str, payload: SectionLimits, admin=Depends(require_admin)):
    s = await db.sections.find_one({"section_id": section_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Section not found")
    if payload.min_capacity is not None and payload.max_capacity is not None and payload.min_capacity > payload.max_capacity:
        raise HTTPException(status_code=400, detail="Minimum capacity cannot be greater than maximum capacity.")
    await db.sections.update_one({"section_id": section_id}, {"$set": {"min_capacity": payload.min_capacity, "max_capacity": payload.max_capacity}})
    await audit("SECTION_LIMITS", admin["email"], f"set limits for {section_id}: min={payload.min_capacity} max={payload.max_capacity}")
    return {"ok": True}

@api_router.get("/admin/feasibility")
async def feasibility(admin=Depends(require_admin)):
    rows = await compute_capacity()
    summary = {"OK": 0, "OVER": 0, "UNDER": 0, "NO_LIMIT": 0}
    for r in rows:
        mx, mn, proj = r["max_capacity"], r["min_capacity"], r["projected"]
        if mx is None and mn is None:
            flag = "NO_LIMIT"
        elif mx is not None and proj > mx:
            flag = "OVER"
        elif mn is not None and proj < mn:
            flag = "UNDER"
        else:
            flag = "OK"
        r["flag"] = flag
        summary[flag] += 1
    return {"sections": rows, "summary": summary}

# ---- Term V consolidated workbook import ----
def _clean(v):
    return str(v).strip() if v is not None else ""

@api_router.post("/admin/import/termv")
async def import_termv(file: UploadFile = File(...), admin=Depends(require_admin)):
    content = await file.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read the workbook. Please upload the Term V .xlsx file.")

    # 1) Course metadata (credits, area) from "Courses & Sections"
    course_meta = {}
    if "Courses & Sections" in wb.sheetnames:
        ws = wb["Courses & Sections"]
        for r in ws.iter_rows(min_row=4, values_only=True):
            if r and _clean(r[0]) == "Course":
                short = _clean(r[1])
                if not short:
                    continue
                course_meta[short] = {
                    "course_name": _clean(r[3]),
                    "long_code": _clean(r[2]),
                    "area": _clean(r[5]),
                    "credits": float(r[6]) if r[6] is not None else 0.0,
                }

    if "Students by Section" not in wb.sheetnames:
        raise HTTPException(status_code=400, detail="Missing 'Students by Section' sheet.")

    ws = wb["Students by Section"]
    students = {}       # roll_no -> student dict
    courses = {}        # short_code -> course dict
    sections = {}       # (short_code, section_name) -> section dict
    enrollments = []    # (roll_no, short_code, section_name)

    for r in ws.iter_rows(min_row=4, values_only=True):
        if not r or not _clean(r[0]):
            continue
        short = _clean(r[0]); cname = _clean(r[1]); section = _clean(r[2]); mid = _clean(r[3])
        day = _clean(r[4]); ts = _clean(r[5]); reg = _clean(r[7]); roll = _clean(r[8])
        name = _clean(r[9]); email = _clean(r[10]).lower(); prog = _clean(r[11])
        if not roll:
            continue
        students[roll] = {"pgpid": roll.upper(), "registration_id": reg, "name": name,
                          "email": email or f"{roll.lower()}@iiml.ac.in", "program": prog, "stex": False}
        meta = course_meta.get(short, {})
        courses.setdefault(short, {"course_code": short, "course_name": cname or meta.get("course_name", short),
                                   "credits": meta.get("credits", 0.0), "area": meta.get("area", ""), "long_code": meta.get("long_code", "")})
        skey = (short, section)
        sections.setdefault(skey, {"section_name": section, "day": day, "time_slot": ts, "mid_tag": mid})
        enrollments.append((roll.upper(), short, section))

    # Wipe master data + request data for a clean reload
    for coll in ["students", "courses", "sections", "enrollments", "requests", "notifications", "import_staging"]:
        await db[coll].delete_many({})

    # Insert courses
    course_id_by_short = {}
    for short, c in courses.items():
        cid = f"course_{uuid.uuid4().hex[:10]}"
        course_id_by_short[short] = cid
        await db.courses.insert_one({"course_id": cid, **c})
    # Insert sections
    section_id_by_key = {}
    for (short, section), s in sections.items():
        sid = f"section_{uuid.uuid4().hex[:10]}"
        section_id_by_key[(short, section)] = sid
        await db.sections.insert_one({"section_id": sid, "course_id": course_id_by_short[short],
                                      "min_capacity": None, "max_capacity": None, **s})
    # Insert students
    for roll, st in students.items():
        await db.students.insert_one(st)
    # Insert enrollments
    ecount = 0
    for roll, short, section in enrollments:
        cid = course_id_by_short.get(short); sid = section_id_by_key.get((short, section))
        if not cid or not sid:
            continue
        await db.enrollments.insert_one({"pgpid": roll, "course_id": cid, "section_id": sid})
        ecount += 1

    await audit("IMPORT_TERMV", admin["email"], f"students={len(students)} courses={len(courses)} sections={len(sections)} enrollments={ecount}")
    return {"ok": True, "students": len(students), "courses": len(courses), "sections": len(sections), "enrollments": ecount}

@api_router.get("/")
async def root():
    return {"message": "PGP Course Change Request Portal API"}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
