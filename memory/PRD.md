# PGP Course Change Request Portal — PRD

## Original Problem
Secure request-collection & administration system for PGP course Add/Drop, Course Swap, Section Swap for ~400+ students, 30+ courses, 45+ sections. Admin evaluates the full request pool collectively; the system never auto-rejects individual add/drop requests on capacity. Students must never see capacity/strength/demand. Swaps are two-sided (both students confirm) before admin approval. Approval does not auto-execute enrollment changes.

## Architecture
- Backend: FastAPI + MongoDB (motor). All routes under /api. Auth via Emergent Google OAuth (cookie `session_token` + `Authorization: Bearer` fallback from localStorage). Server-side RBAC (require_admin / require_student).
- Frontend: React (CRA/craco), Tailwind + shadcn/ui, sonner toasts, recharts. Academic navy/cream theme (Cormorant Garamond + IBM Plex Sans).
- Collections: users, user_sessions, students, courses, sections, enrollments, requests (embeds actions[] + swap{} + history[]), notifications, audit_logs, settings (request_window), import_staging.

## User Personas
- Student: institutional Google account; views own courses; submits Add/Drop/Add+Drop/Course Swap/Section Swap; confirms/rejects swaps; tracks own history.
- Admin (pgp41473@iiml.ac.in): manages window, reviews all requests, sees capacity, approves/rejects, marks executed, imports master data (CSV/Excel), exports Excel, views audit log.

## Core Requirements (static)
1. No capacity/strength/demand exposed to students (UI or API). 2. No per-request auto-feasibility. 3. Two-sided swap confirmation before admin approval. 4. Admin is final authority. 5. Approval => "Approved — Pending Execution"; enrollments changed manually then marked "Executed". 6. Baseline enrollment kept separate from requests. 7. Students only see own data + swaps involving them. 8. Full audit trail. 9. Excel export. 10. Conflict prevention for contradictory active requests.

## Implemented (2026-08-23)
- Emergent Google OAuth (domains @iim.ac.in / @iiml.ac.in), admin auto-assign by email, server-side RBAC.
- Student: dashboard (welcome, PGPID, current courses, window banner), Submit (5 request types), My Requests + detail with status-history timeline, cancel, Notifications with swap Accept/Reject, Profile.
- Swap workflow: AWAITING_PARTNER_CONFIRMATION -> BOTH_CONFIRMED / PARTNER_REJECTED -> admin APPROVED_PENDING_EXECUTION -> EXECUTED; in-app notifications.
- Conflict prevention (409) on overlapping active-request courses. Request window (enable + open/close dates, manual open/close).
- Admin: dashboard stats + recharts, filterable/searchable requests table with decision dialog, Swaps view, Capacity table (current/min/max/pending adds/drops/net/projected — admin only), Students/Courses/Sections views, Master Data import (preview + validation + commit for students/courses/sections/enrollments), Request Window management, Audit Log.
- Excel export of all requests (openpyxl), no secrets exported.
- Master data seeded via sample CSVs (8 students, 6 courses, 10 sections, 21 enrollments).
- Verified: 22/22 backend tests pass; frontend smoke passed. Test cases 1-8 all validated.

## Backlog
- P1: Email notifications (Resend) for swaps; in-app notification bell badge/count.
- P2: Built-in global feasibility engine (read-only, no auto-execute); capacity visualization charts; admin "revoke approval" endpoint; re-validate import on commit; split server.py into modules; tighten CORS to explicit origins.

## Next Tasks
- Await user feedback; consider real full Google OAuth walkthrough; optional feasibility engine.
