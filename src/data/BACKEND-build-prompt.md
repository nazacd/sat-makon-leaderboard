# Backend Build Instruction — SAT-MAKON

You are building the **backend** for the SAT-MAKON platform, locally on this machine (not on the server — deployment is a separate task done later). `src/data/SAT-MAKON-spec.md` remains the single source of truth. Read it — especially §3 (engine), §4 (eligibility), §6–§7 (teacher/admin + auth/RBAC), §9 (config), §10 (data model) — before writing code. Do not invent rules; if something is ambiguous, ask.

Read the existing frontend first so you extend it rather than duplicate it: `src/engine/index.ts`, `src/data/types.ts`, `src/config/index.ts`, `src/services/interfaces.ts`, `src/services/mock/index.ts`, `src/services/permissions.ts`, the auth context added previously, and `src/data/satmakon-mock-data.json`.

## Stack
- **Node.js + TypeScript + Express** for the API server.
- **PostgreSQL** as the database, accessed through **Prisma** (typed queries + migrations; if you strongly prefer Drizzle for a lighter footprint, propose it first).
- **bcrypt/argon2** for password hashing, **httpOnly cookie sessions** for auth.
- **zod** for request validation at the API boundary.

## Three principles that must hold
1. **One canonical engine, zero drift.** The rating/eligibility logic in `src/engine` is pure, framework-agnostic TypeScript. Move it (with its tests, `src/data/types.ts`, and `src/config`) into a top-level **`shared/`** folder that **both** the frontend and the new `server/` import. The backend is the authoritative computer of ratings, boards, and eligibility — it replays assessments through this shared engine. The frontend stops computing derived values and just renders what the API returns. The same engine code must never exist in two places.
2. **The API mirrors `IDataRepository`.** The frontend already talks to the `IDataRepository` interface. Design the API so every method on that interface maps to an endpoint. Then the frontend swap is trivial: a new `ApiRepository implements IDataRepository` that calls those endpoints (Phase 5). Read `interfaces.ts` and make the API cover it.
3. **Security is enforced on the server, never just the UI.** The frontend's `permissions.ts` checks become convenience only. Every protected endpoint re-checks the caller's role on the server. The public leaderboard names minors, so staff endpoints must be genuinely locked — a check that only lives in React is no check at all.

## Target structure
```
repo/
├── shared/    ← engine, types, config knobs (canonical; imported by client AND server)
├── server/    ← this task: Express + Prisma + auth (own package.json + tsconfig)
└── (client)   ← existing Vite app at repo root; updated to import from shared/
```
Keep the frontend where it is; `server/` and `shared/` are siblings it imports from via relative path. (npm workspaces are a fine tidy-up but optional — don't let tooling become the task.)

## Working protocol
Post a short plan before each phase and **pause for approval after Phase 0** (it moves files). After each phase: run `tsc`, run the engine tests (they must still pass after the move), verify the acceptance criteria, append to `PROGRESS.md`. Secrets (DB URL, session secret) go in `server/.env` (gitignored) with a committed `server/.env.example`.

---

## Phase 0 — Restructure to a shared engine (checkpoint)
Create `shared/`, move `engine/`, `data/types.ts`, and `config/` into it (keep the engine tests alongside), and update the frontend's imports to point at `shared/`. Scaffold an empty `server/` package (package.json, tsconfig, Express hello-world).
**Acceptance:** the frontend still builds and runs on the mock; the moved engine tests still pass unchanged. **Stop and get approval before proceeding** — this is the only file-moving phase.

## Phase 1 — Database schema + seed
Define the Prisma schema from spec §10: `students` (with `enrollment_status`, `eligibility_start`, `archived`), `subjects` (`archived`), `teachers` (`role`, `password_hash`, `archived`), `enrollments` (`student_id`, `subject_id`, nullable `teacher_id`, **unique on (student_id, subject_id)** — null teacher = the Unassigned case), `assessments` (immutable: the five scores, timestamp, student/subject/teacher refs), and an `audit_log`. Use real **foreign keys**. Treat assessments as append-only; corrections are traceable (new record or logged edit), never silent overwrites. Write a **seed script** that loads `src/data/satmakon-mock-data.json` into Postgres, hashing the mock passwords.
**Acceptance:** `prisma migrate` creates the schema on a local Postgres; the seed runs; every edge-case row from the JSON (`stu_freshman`, `stu_thin`, `stu_unassigned`, the archived student, the both-subjects teacher) is present and correctly related.

## Phase 2 — Engine wired server-side
Build a service layer that loads a student's assessments from Postgres and produces stream ratings, the main board, and per-student eligibility **by calling the shared engine** — passing the knobs from `shared/config`, never hardcoding α, the cutoff, or thresholds. Respect the Asia/Tashkent month boundary.
**Acceptance:** a server-side call produces the same board and eligibility results from the seeded database that the engine tests assert — the freshman is unranked with the right `eligible from` month, the strong-but-thin student is unranked, the single-subject student is off the main board.

## Phase 3 — API endpoints (mirror `IDataRepository`)
Implement REST endpoints covering every `IDataRepository` method: the public board (top-N + full), student search (partial match), a student profile (rank, rating, teachers per subject, newest-first history), subjects, teachers, enrollments/rosters (both the student-side and teacher-side views), creating and correcting assessments, and the admin CRUD. Validate every request body with zod; **enforce the 0.5-step, 0–10 score rule on the server** (never trust the client). Reads that are public stay public; everything else is gated in Phase 4.
**Acceptance:** each repository method has a working endpoint returning data shaped to `shared/types.ts`; an out-of-range or 7.3-style score is rejected with a clear error.

## Phase 4 — Real auth + server-side RBAC
Login endpoint (verify hashed password, reject archived staff), httpOnly cookie session, logout, and a `me` endpoint. Then enforce `permissions.ts` rules **on every protected route**: teachers can only assess their own rostered students; managing teachers requires admin+; managing admins/super_admins requires super_admin; no one archives themselves or the last active super_admin. The check happens in middleware on the server.
**Acceptance:** with `curl` and no/!wrong session you cannot reach protected endpoints; an `admin` token cannot hit an admin-management endpoint; the three seed logins (`dilshod`, `admin`, `superadmin`, password `mock1234`) work and land in the right role.

## Phase 5 — Connect the frontend to the API
Add `ApiRepository implements IDataRepository` that calls the backend, and an env flag (`VITE_DATA_SOURCE=mock|api`) to switch between it and the existing mock so you can develop incrementally. Add a Vite dev proxy (`/api` → `localhost:3000`) so dev is same-origin and the session cookie works without CORS pain.
**Acceptance:** with the flag set to `api` and the backend running, the existing student/teacher/admin UI works end-to-end against Postgres — login, the deck writing real assessments, the board updating, roster edits persisting; with the flag set to `mock`, the app still runs as before.

---

**Deployment (nginx, PM2, HTTPS on the VPS) is NOT part of this task** — it comes after the backend works locally. Begin with Phase 0: post the restructure plan and wait for approval before moving any files.
