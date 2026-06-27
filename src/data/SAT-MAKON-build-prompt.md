# Build Prompt — SAT-MAKON Rating Platform

You are building the front end of the SAT-MAKON student-rating platform. The attached **`SAT-MAKON-spec.md` is the single source of truth.** Read it in full before writing any code. Do not invent product rules; if something is ambiguous or missing, list the question and ask — do not guess.

## Stack & non-negotiables
- **React + Vite + TypeScript** (the project already exists as a default Vite app — build on it, don't re-scaffold).
- **TailwindCSS** for all styling.
- **Adaptive / responsive**, mobile-first. The teacher **deck of cards** must feel native on touch (swipes) and usable on desktop (buttons).
- **Primary color `#5900C3`.** Derive a coherent shade scale from it and choose supporting neutrals; aim for an intentional, branded look, not a default template.

## Two architectural rules that protect the spec
1. **The rating engine is pure, framework-agnostic TypeScript** — no React imports. Everything visible (boards, ranks, eligibility) is *derived* from the immutable assessment log by replay, exactly as the spec's §3–4 require. This module is the canonical reference implementation and must be unit-tested.
2. **All data access goes through one typed interface** (a repository/service layer) with an **in-memory mock implementation** behind it. Components never touch mock data directly. This lets a real backend replace the mock later without touching UI. **Do not build real auth, real persistence, or a backend now** — stub them behind the interface and mark mock auth clearly as fake.

## Global conventions
- Treat **§9 Config knobs** as the *only* place rule-numbers live (α, day-15 cutoff, thresholds, timezone). Never hardcode these inline.
- Treat **§11 Decision ledger** as your acceptance checklist.
- Staff/admin live on a subdomain per the spec; in dev, **simulate with routes** (e.g. `/`, `/staff`, `/admin`) and leave a note that the subdomain split is a deployment concern.
- Seed the mock with a **realistic dataset that exercises every edge case**: ~40 students, 2–3 subjects, several teachers (incl. one teaching both subjects), a month of assessments, plus deliberate cases of — a settling freshman, a transfer (settling), a single-subject student, a "strong + thin" student (one qualifying stream only), and an unassigned (student, subject) pair. If the seed doesn't surface these, the UI can't be verified.

## Working protocol (important)
- Before each phase, post a **short plan**; then implement **one phase at a time** and **pause for my review at each phase boundary.**
- After each phase: run typecheck + the dev server, confirm the phase's acceptance criteria, and append a brief entry to **`PROGRESS.md`** (what's done, key decisions, any deviation from spec and why).
- Keep commits/changes scoped per phase.

---

## Phase 0 — Foundation & conventions
Configure Tailwind + the `#5900C3` design tokens and neutrals; set up routing for the three surfaces; establish the folder structure, the **data-layer interface + in-memory mock**, and the **seed dataset** above. A styled placeholder shell for each surface.
**Acceptance:** dev server runs; seed data loads through the interface; the three routes render branded placeholders; typecheck clean.

## Phase 1 — Rating engine (pure logic + tests)
Implement as pure TS: assessment mean; **per-subject EWMA stream with replay** (α≈0.4, order-based, first-assessment seeds); main rating = mean of **qualifying** streams (stream ≥2 assessments); monthly reset on the Asia/Tashkent boundary; the full **eligibility model** (settling rule with the ≤15→M+1 / >15→M+2 branches, new-vs-established, ≥2 subjects, ≥2 qualifying streams, archived); soft-mask name formatter (first name + last initial, digit on collision); tiebreaks (count, then alphabetical); a single `config` object for §9.
Unit-test the tricky cases: replay correctness, a mid-stream correction re-deriving the rating, the two freshman branches, transfer-settles, established-skips, and "strong + thin = not yet ranked."
**Acceptance:** tests pass; engine produces a correct board + correct per-student eligibility/failure-reason from the seed.

## Phase 2 — Student platform (public, read-only)
Main page: logo top-left, search bar, **TOP-30** (rank · masked name · rating · assessment count), **"See more"** → full paginated board, with the **pre-data fallback to last month's board**. Partial-match search → profile. Read-only **student profile**: full name, rank, recency-weighted rating (labeled) + optional plain month-average, teachers per subject, **newest-first history with expandable five sub-scores**, and the **"eligible from {month}"** banner (no rank) for freshmen. Fully responsive.
**Acceptance:** browse board, search, open profiles; a freshman shows the banner and no rank; a single-subject student never appears on the main board.

## Phase 3 — Teacher platform (+ mock staff auth)
Mock provisioned login (no self-signup), clearly fake, behind the interface. Teacher home: **"Assess all my students"** → **deck of cards** — subject-tagged cards (both-subject student = two cards), five sliders (0–10, **0.5 steps only**), **prefill "from last week"**, **right = Submit / left = Skip** with the **slider-track-vs-card-body gesture split**, explicit Skip/Submit buttons, **Submit disabled until all five set**, already-assessed-this-week included + marked + defaulted to skip, **Undo last card**, autosave to the mock. Per-subject lists → tap a student → the **same single card** for manual assessment. Enforce boundaries: no student-info edits, no self-roster.
**Acceptance:** a teacher runs the deck end-to-end on mobile and desktop; new assessments flow through the engine and visibly change the public board; boundaries hold.

## Phase 4 — Admin platform
Role gate (teacher vs admin). CRUD for students / teachers / subjects with **archive-not-delete**. The **assignment object** (student, subject) → one teacher, editable from both ends, reassign carries the stream over. **Add-student flow with the New / Established control** (+ a bulk-import stub marking all *established*). The permanent **Unassigned / incomplete-roster view**. **Eligibility failure-reason** surfaced per student. A basic **audit log**.
**Acceptance:** admin adds/edits/archives, assigns teachers, sees unassigned pairs; changes propagate to teacher rosters and the board; an established add is eligible immediately while a new/transfer add settles.

## Phase 5 — Responsive polish & final pass
Breakpoint passes (deck-on-mobile is the priority); empty / loading / error states; "previous winners" pre-data board; final sweep against the **§11 ledger**, fixing any gap.
**Acceptance:** every ledger item is demonstrably present; the app is clean across phone, tablet, and desktop.

---

**Begin with Phase 0: post your plan, confirm your reading of the spec, and list any ambiguities before coding.**
