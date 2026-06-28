# PROGRESS.md — SAT-MAKON Rating Platform

## Phase 5 — Auth, RBAC, Editable Rosters ✅

**Date:** 2026-06-27

### What's done

**Change 1 — Real Staff Authentication**
- Created `src/services/AuthProvider.tsx`: React context with `login()` / `logout()`, sessionStorage persistence (stores `staffId`, re-hydrates on mount), archived staff blocked by mock.
- Created `src/pages/LoginPage.tsx`: username + password form, error display, no self-signup.
- Created `src/components/RequireRole.tsx`: route guard — no session → login screen; wrong role → redirect or access-denied; correct role → renders children.
- Updated `src/App.tsx`: `<DataProvider><AuthProvider><RouterProvider/></AuthProvider></DataProvider>`.
- Updated `src/router.tsx`: `/staff` requires `teacher` (admin/super_admin redirect to `/admin`); `/admin` requires `admin|super_admin`.
- Updated `src/pages/staff/StaffShell.tsx`: removed click-to-select teacher grid; reads session from `useAuth()`.
- Updated `src/components/Layout.tsx`: nav links filtered by role; global Sign Out button.

**Change 2 — Role-Based Access Control**
- Created `src/services/permissions.ts`: `canAccessAdmin`, `canManageStaff`, `canArchiveStaff` (blocks self-archive + last super_admin).
- Updated `src/services/interfaces.ts`: `addTeacher` / `updateTeacher` / `archiveTeacher` now take `actor: Teacher`; added `assignStudentToTeacher` returning `AssignResult`.
- Updated `src/services/mock/index.ts`: all three teacher mutations enforce `canManageStaff` / `canArchiveStaff`, throw on violation.
- Updated `src/pages/admin/AdminShell.tsx` TeachersView: Teachers table shows only `role === 'teacher'`; Administrators section visible only to `super_admin`; Add Teacher creates teacher only; Add Administrator creates admin/super_admin; archive buttons gated by `canArchiveStaff`.

**Change 3 — Editable Rosters from Teacher List**
- Created `src/pages/admin/RosterModal.tsx`: per-subject assignment panel; searchable add (upsert with reassignment warning); remove sets `teacher_id = null`; all changes logged to audit log.
- `assignStudentToTeacher` in mock: upserts — creates enrollment if missing, reassigns if different teacher.

### Verification
- `tsc --noEmit`: clean (no errors).
- `vitest run`: 45/45 engine tests pass.

### Acceptance criteria
- [x] Cannot reach `/admin` without logging in as admin/super_admin.
- [x] Teacher login cannot open admin dashboard (redirected if goes to `/admin`).
- [x] Refresh keeps session (sessionStorage).
- [x] Logout returns to login screen.
- [x] `admin` can manage teachers but cannot see Administrators section.
- [x] `super_admin` sees and manages both tables; cannot archive self or last super_admin.
- [x] Manage roster modal: add creates/reassigns enrollment; remove returns to Unassigned; both sides consistent.

---

## Phase 4 — Admin Platform ✅

**Date:** 2026-06-26

### What's done
Implemented the `AdminShell` to resolve active system issues and view top-level rating engine parametrics.

- **Organizational Alerts:** Fetches enrollments using `getUnassignedEnrollments()` (representing students waiting for teacher assignment) and renders them in a visual queue.
- **Interactive Mutations:** Enables admins to select a teacher from the dropdown, triggering the `setEnrollmentTeacher` mutation, live-updating the system. Handles the "Clear Deck" success state automatically.
- **Engine Configuration Viewer:** Styled specifically in a dark UI aesthetic, parsing `config` limits directly from the mock layer (`alpha=0.4`, max students, throttle day settings).
- **Responsive Layout:** The UI shifts natively utilizing a 3-column desktop layout that wraps efficiently on smaller horizontal spaces.

### Acceptance criteria
- [x] Interactive Teacher Assignment.
- [x] Unassigned alerts.
- [x] Interactive dropdown element.
- [x] Config dashboard implementation.

---

## Phase 3 — Teacher Platform ✅
(Swipeable Assessment Deck, history Prefill, Mock Authenticator).

---

## Phase 2 — Student Platform ✅
(Live leaderboard podium logic, search masking, top-3 logic).

---

## Phase 1 — Rating Engine ✅
(Implemented pure TS Engine, stream calculation, gate verification and tiebreaks -> 45 tests pass).

---

## Phase 0 — Foundation & Conventions ✅
(Initial Tailwind v4 setup, Typescript scaffolding, and JSON mock layer).
