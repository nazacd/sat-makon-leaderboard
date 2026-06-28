# Fix Prompt — Staff Auth, Role-Based Access, Editable Rosters

Three gaps in the current build need fixing. Read `src/data/SAT-MAKON-spec.md` §6–§7, then the existing code in `src/pages/staff/StaffShell.tsx`, `src/pages/admin/AdminShell.tsx`, `src/services/interfaces.ts`, and `src/services/mock/index.ts` before changing anything. Keep the existing architecture and patterns (typed data layer behind `IDataRepository`, React-context provider like `DataProvider`). Do not regress the engine or its tests.

**Hard rule for all three changes:** every access rule must be enforced in the **data layer**, not only hidden in the UI. UI-only gating is theatre. Put the rules in one `src/services/permissions.ts` module and consume it from *both* the UI (to hide/disable controls) *and* the mock mutations (to reject disallowed calls). This way the contract survives the swap to a real backend.

---

## Change 1 — Real (mock) staff authentication

Right now `/staff` lets you click any staff member to "log in" with no password, and `/admin` has no gate at all. Replace this with a real login flow that uses the existing `authenticateStaff(username, password)` (already in the mock — currently unused).

- Add an **`AuthProvider`** (React context, same style as `DataProvider`) holding the current staff session (`Teacher | null`) with `login(username, password)` → calls `authenticateStaff`, and `logout()`. Persist the session in `sessionStorage` so a refresh doesn't log out. Archived staff must not be able to log in (the mock already filters `!archived` — keep that).
- Add a **single login screen** (username + password). Remove the click-to-select teacher grid in `StaffShell` entirely.
- **Route by role after login:**
  - `teacher` → the teacher dashboard / deck (current `StaffShell` content).
  - `admin` / `super_admin` → the admin dashboard (`AdminShell`).
- **Guard the routes** with a `RequireRole` wrapper:
  - `/admin` requires `admin` or `super_admin`; a logged-in `teacher` hitting it gets an "access denied" view, not the dashboard.
  - `/staff` is the teacher assessment area; an `admin`/`super_admin` landing there is redirected to `/admin` (admins don't use the deck).
  - Unauthenticated access to either shows the login screen.
- The teacher dashboard and deck must only ever involve `role === 'teacher'` accounts — admins/super_admins are never assessable and never appear in rosters or the deck.

**Test logins (from the seed):** `dilshod / mock1234` (teacher), `admin / mock1234` (admin), `superadmin / mock1234` (super_admin).

**Acceptance:** you cannot reach `/admin` without logging in as an admin/super_admin; a teacher login cannot open the admin dashboard; refresh keeps you logged in; logout returns to the login screen.

---

## Change 2 — Role-based access control over staff management

There are three roles: `teacher`, `admin`, `super_admin`. The current `TeachersView` lists all three together and lets anyone archive anyone. Fix the hierarchy.

**Permission rules (put these in `permissions.ts`):**
- `canAccessAdmin(role)` → `admin` or `super_admin`.
- **Managing teachers** (add / edit / archive / roster) → `admin` or `super_admin`.
- **Managing admins and super_admins** (add / edit / archive) → **`super_admin` only.** An `admin` cannot add, edit, archive, or otherwise modify any `admin` or `super_admin` — not even view them as editable.
- Generalize as `canManageStaff(actorRole, targetRole)`: target `teacher` needs actor `admin`+; target `admin`/`super_admin` needs actor `super_admin`.

**Guardrails (enforce in the data layer):**
- No one can archive **their own** account.
- The system must never archive the **last active `super_admin`**.
- Reject any mutation that violates the rules above (throw or return null + surface an error in the UI). The mock methods `addTeacher` / `updateTeacher` / `archiveTeacher` must receive the **acting user** (pass `actorRole`/`actor` as a parameter, or have the repo read the current session) and enforce `canManageStaff` — do not let the UI be the only thing stopping a bad call. Update `IDataRepository` accordingly.

**UI — separate the lists:**
- The **Teachers** table shows **only `role === 'teacher'`**.
- Add a separate **Administrators** section listing `admin` + `super_admin`. This section is **visible only to a logged-in `super_admin`**; a plain `admin` does not see it at all. (If you prefer, an `admin` may see it strictly read-only — but default to hidden.)
- The **Add Teacher** form (for admins) creates only `teacher` accounts. A `super_admin` gets an **Add Administrator** action in the Administrators section that can create `admin` (and, if you allow it, `super_admin`) accounts. Role options shown must depend on the logged-in user's role.
- Archive/edit buttons appear only where `canManageStaff` allows for the current user.

**Acceptance:** logged in as `admin`, you can manage teachers but cannot see or touch any admin/super_admin (no Administrators section, no way to archive Rustam). Logged in as `super_admin`, you can manage teachers *and* admins, but cannot archive yourself or the last super_admin.

---

## Change 3 — Editable teacher rosters from the teacher list

The "Roster (per subject)" column in `TeachersView` is currently a read-only comma list. Make it an **openable, editable roster manager** per teacher — this is the teacher-side view of the same enrollment object that `StudentsView` edits from the student side (spec §7.4). Both ends must stay consistent because they mutate the same `(student, subject)` enrollment.

- Replace the read-only cell with a **"Manage roster"** action that opens a panel/modal for that teacher.
- In the panel, for each active subject, show the students currently assigned to this teacher for that subject, plus:
  - **Add student** → pick from the student list (searchable). On add, **upsert** the enrollment `(student, subject)` with `teacher_id = this teacher`:
    - If no enrollment exists for that pair → **create** it (this is why the current `setEnrollmentTeacher`, which returns null when the pair is missing, is insufficient — make it upsert, or add `assignStudentToTeacher(studentId, subjectId, teacherId)` and use `addEnrollment` internally).
    - If an enrollment already exists with a **different** teacher → **reassign** it to this teacher, and warn in the UI first ("Currently with {other teacher} — will be reassigned"). The student's stream for that subject carries over untouched (the engine keys streams off student+subject, not the teacher), so no rating recompute is needed beyond the normal replay.
  - **Remove student** → set that enrollment's `teacher_id` to `null`, returning the pair to the **Unassigned view** (it does not delete the enrollment).
- Log every assign/reassign/remove to the audit log (reuse the existing `logAction`).
- Keep the existing per-student assignment UI in `StudentsView` working; both paths now hit the same upsert logic.

**Acceptance:** from the Teachers table you can open a teacher, add a student to their Math roster who had no teacher (creates the enrollment, clears it from the Unassigned view), and add a student who was on another teacher's roster (reassigns with a warning); removing a student sends that pair back to Unassigned. The student-side assignment in `StudentsView` reflects the same state.

---

## Working protocol
Post a short plan first. Implement the three changes in order (auth → RBAC → rosters), since each builds on the prior. After each: run `tsc` and the existing engine tests (`vitest`) and confirm they still pass, verify the acceptance criteria, and append a note to `PROGRESS.md`. Do not invent rules beyond this document and the spec — if something is ambiguous, ask.
