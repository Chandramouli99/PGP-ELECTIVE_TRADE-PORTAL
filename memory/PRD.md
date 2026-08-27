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

## Update — 2026-08-23 (UX + rules iteration)
- Submit page reordered: Course Swap & Section Swap shown first, then Add / Drop / Add+Drop.
- Swap sanity (server-enforced): cannot request a course you already have; no cross-credit swaps (1.0↔1.0, 0.5↔0.5 only). Frontend want-course dropdown filters to same-credit, not-owned courses.
- Non-blocking credit warnings (PGP non-STEX, 5.0–6.0): Add/Add+Drop above 6 or Drop/Add+Drop below 5 shows an inline warning + confirm dialog ("Submit Anyway"); request still submits with a credit_note visible to admin.
- Mobile-friendly Layout: sidebar collapses to a hamburger Sheet drawer on <lg; desktop keeps fixed sidebar.
- Notifications: red unread-count badge on nav (30s poll); opening Notifications marks all read.
- Request window: default 24h when enabled with no closing time; admin Quick Actions (Open 24h / Extend +12h / +24h / Close now); student header + admin page show live countdown.
- Verified: iter4 8/8 + RBAC 27/27 + 8/8 frontend scenarios pass.

## Update — 2026-08-23 (quotas + clash + no-withdrawal)
- Timetable clash alerts: non-blocking warning when an Add/Course-Swap/Section-Swap would place a class in a day+time slot the student already occupies (excludes the course being dropped/given up). Stored as clash_note, shown to student (inline + confirm dialog) and to admin.
- Per-student request quotas: Add 1, Drop 1, Course Swap 2, Section Swap 2 (Add+Drop consumes one Add and one Drop). Enforced server-side (403) and reflected on the Submit page (usage labels + disabled 'Limit reached' cards). Rejected/partner-rejected requests don't consume quota. GET /student/quota.
- No withdrawal: cancellation removed — POST /student/requests/{id}/cancel now always 403; the Cancel button is gone and replaced with a notice.
- Verified: iter5 17/17 backend + 5/5 frontend surfaces pass, zero issues.

## Update — 2026-08-23 (withdrawal + trading board)
- Withdrawal: Add/Drop/Add+Drop can be withdrawn while the request window is OPEN (status Submitted/Under Review), locked once the window closes; Course/Section swaps can never be withdrawn (warned at submit). Withdraw frees quota.
- Trading Board (public marketplace): students post one editable "case" — courses they want to DROP (from current) and ADD (not owned) + optional note; posts show Name + PGPID to all logged-in students (informational only; actual swaps via existing flow). Create/edit/delete own case. Visible only when request window open AND admin toggle on. Admin page: enable/disable toggle + view/remove any post. No capacity/strength exposed.
- Verified: iter6 15/15 backend + all frontend surfaces pass, zero issues.

## Update — 2026-08-23 (execution applies to enrollments + executed export + trading UX)
- Marking a request EXECUTED now applies the actual enrollment change (ADD inserts, DROP removes, ADD+DROP both, COURSE/SECTION swaps exchange both students' rows) → reflects immediately in student Current Courses + Weekly Timetable. Approval alone still does NOT change enrollments; execution is the manual final step.
- Admin "Download Executed Changes" Excel (PGPID, Name, Change ADD/DROP/SWAP IN/OUT, Course, From/To Section, Request ID, Executed At). Both exports now download via the API client (Bearer) for reliability.
- Master sheet re-upload (Term V workbook import) continues to refresh courses/sections/enrollments/timetable.
- Trading Board redesigned: open cases shown first with a prominent "Create Your Own Case" button; the drop/add course chip editor now opens in a dialog (no longer dominates the page).
- Verified: iter7 11/11 backend + all frontend surfaces pass, zero issues.

## Update — 2026-08-23 (trading add = section-level)
- Trading Board "want to add" is now section-level: each option is a course+section chip. Students can list a DIFFERENT section of a course they already hold (enables section-swap discovery); listing their exact current section is rejected. Board/admin views show add entries as "Course · Sec X". Stored as add_section_ids. Verified via API (post + 400 guard) and compile.

## Update — 2026-06 (Timetable Clash Resolution + admin Clash Tracker)
- Clash detection (mid-aware): a real clash = two enrolled sections in the same day+time-slot whose term-halves overlap (pre-mid `$` vs post-mid `#` do NOT clash; full-term overlaps anything). Matches the uploaded workbook's "Action Items" sheet exactly — 5 students (ABM22032, ABM22036, PGP41438, PGP41506, PGP41173). Detection is dynamic (auto-resolves once fixed; no hardcoded list).
- Student: red clash alert on Dashboard + red-highlighted slot on Weekly Timetable + nav "Resolve Clash" with badge. Dedicated /resolve-clash page (ALWAYS available, independent of request & trading windows): pick which clashing course to drop, then give ≥2 replacement preferences. Each preference must total exactly the dropped course's credits (credit-sum flexibility) and only clash-free, not-owned courses are offered. Does NOT consume normal Add/Drop quotas. Duplicate-per-slot guarded (409).
- Backend: GET /student/clashes, GET /student/clash-options, POST /student/clash/resolve; GET /admin/clashes, GET /admin/clash-tracker, POST /admin/clashes/{id}/approve|reject|execute. Two-step approve→execute; execute drops the chosen course + adds the approved preference to real enrollments, resolving the clash.
- Admin: "Clash Resolutions" page with two tabs — (1) Clash Tracker: one-place overview of every clash with summary counts (Unresolved/In Progress/Resolved) and per-student status; (2) Resolution Requests: high-priority queue to pick a preference, approve, and execute.
- Verified: backend fully curl-tested (detection, options, all submit guards, approve/execute, tracker UNRESOLVED→IN_PROGRESS→RESOLVED); frontend E2E iter9 ~97% (fixed course_code testid bug post-report). No capacity/strength exposed to students.

## Update — 2026-08-24 (credit-sum swaps + Full Timetable + admin Clear-All Trading)
- Credit-sum swaps: COURSE_SWAP now supports many-to-many where sum of give-credits must equal sum of get-credits (e.g. two 0.5cr → one 1.0cr). Stored in swap.initiator_gives[]/initiator_gets[] (legacy single fields still filled for back-compat via swap_pairs helper). Added symmetric guard: partner must not already hold a course the initiator offers.
- Full Timetable: GET /api/student/timetable/all + student Full Timetable page lists all sections with schedule + rosters, verified NO capacity/strength leak.
- Admin Clear-All Trading: DELETE /api/admin/trading wipes all posts (admin-only, 403 for students); AdminTrading.js "Clear All Cases" button with AlertDialog confirmation.
- Fixed RequestDetail/Notifications/MyRequests/AdminRequests/AdminSwaps to render ALL courses in a credit-sum swap (previously showed only the first). Fixed RequestDetail useEffect missing-dep warning (useCallback).
- Verified: iter8 10/10 backend + 4/4 frontend surfaces pass, zero issues.

## Update — 2026-08-23 (Term V feature addition)
- Added 2nd admin email: secy.academics@iiml.ac.in (both admins in allowlist).
- Term V consolidated .xlsx importer (POST /admin/import/termv): parses "Courses & Sections" (credits/area) + "Students by Section" (students/sections/schedule/enrollments); one-click load, replaces master data. Real data loaded: 453 students, 39 courses, 49 sections, 2663 enrollments.
- Courses now carry credits + area; sections carry day/time_slot/mid_tag + editable min/max limits.
- Student: Weekly Timetable tab (grid by day/time, area-colored, Not-Timetabled list); Dashboard now shows credits per course + total credits with Term V rule status (PGP non-STEX: 5.0–6.0).
- Admin: Feasibility Engine (/admin/feasibility) — global current + pending adds/drops/swaps → projected, flags OK/OVER/UNDER/NO_LIMIT with section-fill bars; editable Min/Max on Sections page (min<=max enforced). Window set/extend already available.
- Verified: 13/13 new-feature tests pass + frontend smoke; regression core flows intact.
