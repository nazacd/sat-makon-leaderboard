# SAT-MAKON Rating Platform — Consolidated Spec

**Status:** Spec-complete. Single source of truth for build.
**Scope:** Rating engine · Eligibility model · Three platforms (student / teacher / admin) · Data model · Deferred features · Config knobs.

This document records *decisions*, not implementation. Where a value is tunable it lives in [§9 Config knobs](#9-config-knobs) so it can change without rewriting the logic.

---

## 1. Overview

A public leaderboard ranks SAT-MAKON students by a single performance rating, recomputed continuously from teacher assessments and reset every month. Teachers assess their rostered students (weekly in practice, any time in principle). Admins own all structure: students, teachers, subjects, and who teaches whom.

Three surfaces:
- **Student platform** — public, read-only, the leaderboard and student profiles.
- **Teacher platform** — authenticated subdomain, assessment only.
- **Admin platform** — same subdomain, role-gated, all structural management.

---

## 2. Glossary (pinned terms)

- **Criterion** — one of the five things a teacher scores (see §3.1).
- **Assessment** — one teacher's single scoring event for one student in one subject: five criterion scores. Its **assessment mean** is the average of those five. Assessments are *immutable source-of-truth records*.
- **Stream** — the running rating for one (student, subject) pair, built from that pair's assessments via EWMA. A student has one stream per subject they study.
- **Enrollment** — the (student, subject) record that makes a student study a subject. It optionally carries one teacher; with no teacher it is an *unassigned* pair. A student's streams are keyed off their enrollments.
- **Rating** (a.k.a. main rating) — the number shown on the main board: the mean of a student's **qualifying** streams.
- **Qualifying stream** — a stream with **≥2 assessments in the current month**.
- **Settling** — the freshman waiting period before a new student may appear on any board.
- **Archive / soft-delete** — removal that hides an entity from live use but preserves its records. Nothing is ever hard-deleted.

---

## 3. The rating engine

### 3.1 Criteria → assessment mean

Each assessment scores five criteria, each on **0–10 in 0.5 steps** (so 7.5 is valid; 7.2 and 8.25 are not):

1. Full homework done
2. Learning progress
3. Activity in the lesson
4. Attendance
5. Behavior

**Assessment mean** = arithmetic mean of the five. This single number is what enters the student's stream for that subject.

### 3.2 Streams and the EWMA

Each (student, subject) pair has its own stream. The stream is **recency-weighted** via an exponentially weighted moving average:

```
new_rating = α · (assessment_mean) + (1 − α) · (previous_rating)
```

- **α ≈ 0.4** — a clear recency tilt that still blends. (Tunable, §9.)
- The **first assessment of the month seeds** the stream (stream = that assessment mean), then blending begins from the second assessment on.
- Weighting is by **assessment order, not calendar days.** A student who misses a week is not decayed for the gap; only their *next* assessment moves the stream. (This keeps attendance a *scored criterion* rather than letting absence silently erode the rating twice.)

### 3.3 Main rating = mean of qualifying streams

The number on the main board is the **mean of the student's qualifying streams** (streams with ≥2 assessments this month). Streams below the threshold do not contribute. A student with one strong stream and one thin stream (e.g. Math at 4 assessments, English at 1) has **one** qualifying stream → **not yet on the main board** — intended behavior, not an edge case to fix.

### 3.4 Derived, never stored as a bare number

The rating is **path-dependent** (EWMA depends on the order of assessments), so it is always **derived by replaying the month's assessments in order**, never persisted as a standalone rolling value. Consequences:
- Correcting a past assessment is possible: edit the record, replay the stream from that point.
- The public board can always be re-derived and audited from the immutable assessment log.

### 3.5 Monthly reset

- Reset at **00:00 Asia/Tashkent on the 1st**, automatic.
- At reset, the finished month's final board is **auto-archived** as the "previous month" board.
- Streams start empty each month. Assessments from prior months remain as permanent **history** but **do not pre-seed** the new month's streams (settling-month and prior scores are history-only).

### 3.6 Pre-data days

Until the current month has enough data to populate the board, the main page shows **last month's final ranking** (the archived "previous month" board), then crossfades to live rankings once current-month data exists. Doubles as a "previous winners" board.

### 3.7 Tiebreaks

Equal main ratings break by: **more total assessments first** (more evidence), then **alphabetical**.

---

## 4. Eligibility model

Eligibility is evaluated **live** (not stored state), as an AND of independent gates. The gates differ between the main board and a per-subject sub-board.

### 4.1 Settling rule (freshmen)

At enrollment, compute and **store** `eligibility_start` (a year-month) from the join date, using a fixed mid-month cutoff (**day 15, configurable**; day 15 itself counts as "before mid"):

- Joined **day 1–15** of month M → eligible from **M+1**.
- Joined **day 16–end** of month M → eligible from **M+2**.

`eligibility_start` is computed once and not recomputed (enrollment date is fixed), but is **admin-overridable** for special cases.

**New vs. established — an explicit admin choice, not a date inference.** The system cannot infer "is this person new to us?" from the date they were *typed into the database* — and using that date naively is a bug: an established student entered after the 15th would be stamped a freshman. So the add-student flow (§7.1) carries an eligibility control:

- **New student (default)** — settle from join date via the rule above.
- **Established student (override)** — `eligibility_start = current month`; eligible immediately (still subject to the other gates — ≥2 subjects, ≥2 qualifying streams).

This is not a one-time launch hack. It recurs: the **launch bulk import** (existing students, already studying >1 month → all marked *established*), a student an admin **forgot** to add at launch and enters in week 2, and any already-studying student only now being entered. The launch import is simply the bulk form of the *established* choice.

**What settling is for — and the transfer case.** Settling exists so **SAT-MAKON's own teachers have time to know a student** before that student is ranked — it is about newness *to this center's staff and assessment record*, not newness to studying in general. Therefore:

- Established **at SAT-MAKON** (the cohort above) → *established*, skip settling.
- **Transfer student** (studied seriously elsewhere, new to SAT-MAKON) → **settles like any new student.** Outside experience does not exempt them, because your teachers still need the settling period to build a real assessment record. Mark them **new**, not established.

### 4.2 Gates

**Main board** — a student appears only if ALL hold:
1. **Settled** — `eligibility_start ≤ current month`.
2. **Multi-subject** — enrolled in **≥2 subjects** (structural; kept explicit even though gate 3 implies it, to keep main-board and sub-board logic untangled).
3. **Data-sufficient** — **≥2 qualifying streams** (two subjects, each with ≥2 assessments this month).
4. **Not archived.**

**Sub-board (per subject — deferred, see §8)** — a student appears on subject X's board only if ALL hold:
1. **Settled.**
2. **This stream qualifies** — subject X has **≥2 assessments this month**.
3. **Not archived.**

(No multi-subject requirement and no ≥2-stream requirement — a single-subject student belongs here, never on the main board.)

**Deck (assessment collection)** — *everyone on roster, always.* Eligibility is a downstream board concern; the deck never filters on it. Settling/ineligible students are assessed normally and their history accrues regardless.

### 4.3 Surfaced failure reasons

Where a student is off a board, the **admin view states which gate failed** ("settling until May," "needs 2nd subject," "needs more assessments"), so no student silently vanishes — same spirit as the unassigned-roster view (§7.5).

### 4.4 Mid-month structural changes

- Dropping to a single subject mid-month → gate 2 fails → drops off the main board live. Handled cleanly by replay/archive; history intact.
- Adding a 2nd subject mid-month → becomes main-board-eligible immediately once the other gates pass (subject count is structural, not a settling concern).

---

## 5. Student platform (public, read-only)

### 5.1 Main page

- **Logo** top-left.
- **Search bar.**
- **TOP-30** leaderboard: rank · **masked name** · rating · assessment count.
- **"See more"** at the end → full paginated board.
- Tapping any row → that student's profile.

### 5.2 Soft mask

Leaderboard names are masked as **first name + last initial** ("Aziz K."), with a **trailing digit for collisions** ("Aziz K. 2"). Profiles and search remain **fully public** by full name. This deters *casual scanning/screenshotting* of the bottom of the list only — it is not real privacy, and that limitation is accepted.

> **Flagged, not blocking:** the board publicly ranks minors, including the bottom. The soft mask is a deliberate, partial measure. Revisit before launch if the center wants stronger protection.

### 5.3 Search

Name lookup with **partial match** (names get typed inconsistently). Tapping a result opens the same read-only profile.

### 5.4 Student profile (read-only)

- **Full name.**
- **Current rank** + **current monthly rating**, labeled *"weighted toward recent lessons."* Optionally a small secondary **"month average"** (plain mean) as a cheap defense against "your app is wrong" tickets.
- **Teachers per subject** (one teacher may cover both subjects; the list grows as subjects are added).
- **Assessment history**, **newest-first**: each entry shows date · teacher · subject · assessment mean, with the **five sub-scores expandable** underneath.
- **History is a permanent archive** (persists across monthly resets).
- **Freshmen / ineligible:** profile shows trajectory and history with a clear **"eligible from {month}"** banner and **no rank**.

---

## 6. Teacher platform (authenticated subdomain)

### 6.1 Access

Lightweight credential auth (admin-provisioned email/username + password). **No self-signup.** Teachers see only their assigned students, per subject.

### 6.2 "Assess all my students" → deck of cards

A single button at the top opens **one deck**. The deck mixes subjects via **subject-tagged cards**: a student taught in both subjects appears as **two cards** ("Aziz K. — Math" and "Aziz K. — English"), one per stream.

**Card contents:** student name + subject tag, five **horizontal sliders** (0–10, 0.5 steps), plus explicit **Skip / Submit** buttons.

**Gestures (designed to avoid the slider/swipe collision):**
- Slider drag is captured **only on the slider track.**
- Card swipe is triggered from the **rest of the card** (name/header area + margins).
- **Right = Submit, left = Skip** (follows the universal right-keep / left-dismiss convention; the wrong reflex must not write a bad grade).
- Explicit Skip / Submit **buttons** exist as the misfire-proof fallback.

**Slider behavior:**
- Sliders **prefill last week's scores** for that (student, subject), visually marked **"from last week"** so submitting unchanged is a conscious act.
- **Submit is disabled until all five criteria are set.** Skip is always available. (Prevents an unset slider defaulting to 0 and tanking a student under recency weighting.)

**Deck flow safeguards:**
- Students **already assessed this week** are **included but marked**, defaulting to the skip side, so a second pass doesn't double-count or silently overwrite. Re-assessing stays possible, just deliberate.
- **Undo last card** — one tap reverses the previous submit.
- **Autosave progress** — a long deck survives interruption.

### 6.3 Manual single assessment

Below the button: the teacher's **per-subject student lists**. Tapping a student opens the **same single card** (reusing the deck UI, not a separate form) to assess just that one.

### 6.4 Edits

A teacher may **edit their own** assessment within a window (**7 days, or until month-end — whichever the config sets**, §9). Admins may edit any assessment any time (§7.6). Every edit triggers stream replay.

### 6.5 Hard boundaries

A teacher **cannot** edit student info, add students, or add themselves to a roster. All structure is admin-controlled.

---

## 7. Admin platform (role-gated, same subdomain)

Role-gated (teacher role vs admin role). One **super-admin** bootstraps the others. **No self-signup for anyone.**

### 7.1 Students

List / add / edit / **archive**. Each row shows the student's subjects, assigned teacher per subject, roster completeness, current rank, and `eligibility_start` (overridable). This is the **only** place student info is editable.

**Add-student flow carries the new/established control** (§4.1): default **New student** (settles from join date) vs. **Established student** (eligible from current month). Transfer-from-elsewhere students are entered as **New** — they settle. A **bulk import** mode at launch is the same control applied en masse, all marked *established*.

### 7.2 Teachers

List / add / edit / **archive**, each with their roster per subject.

### 7.3 Subjects

List / add / rename / **archive**. Adding is harmless. **Archiving is warned**: it removes a whole stream from everyone who had it and visibly reshuffles the board mid-month — rare and confirmed.

### 7.4 Enrollment / Assignment (the core object)

The underlying object is **one thing**: an **enrollment = (student, subject)** that *optionally* carries **one teacher**. Enrolling a student in a subject and assigning their teacher are the same record at two stages of completeness:
- **Enrolled, no teacher yet** → `teacher_id` is empty → the pair appears in the **Unassigned view** (§7.5). This is why enrollment must be representable *without* a teacher.
- **Enrolled + assigned** → `teacher_id` set → the student is assessable in that subject.

"Assign a student to a teacher" and "regulate a teacher's roster" are the **same object viewed from two ends**; build it once, surface it from both:
- Student side: "who teaches Aziz, and for what?"
- Teacher side: "who's on Dilnoza's Math roster?"

**One teacher per (student, subject)** — the record is unique per pair. Reassigning **replaces** the teacher; the student's **stream for that subject carries over untouched** (the stream belongs to student+subject, not to the teacher — history just shows the handoff). Un-assigning (clearing the teacher) keeps the enrollment but returns the pair to the Unassigned view.

### 7.5 Unassigned / incomplete-roster view (permanent, critical)

A standing screen listing every **(student, subject) pair with no teacher.** Removing/reassigning a teacher, or adding a not-yet-rostered student, orphans pairs — and an unassigned pair is **invisible to every deck**, so the student silently stops being assessed. This view is the primary defense against students rotting at "pending."

### 7.6 Removal = archive everywhere

Because history is permanent, **remove = archive (soft-delete), never hard-delete:**
- **Remove student** → off the live board, no longer assessable, history survives and stays viewable.
- **Remove teacher** → can't log in, gone from rosters, but name still resolves in past history ("assessed by —"). Their past assessments stay baked into students' streams (path-dependence) and are not extracted; ratings remain correct.
- **Remove subject** → stream archived, stops contributing; warned and board-shifting (§7.3).

### 7.7 Corrections

Editing a past assessment replays the affected stream (§3.4). Teacher self-edits are window-limited (§6.4); admin edits are unrestricted in time.

### 7.8 Audit log

A log of admin actions (who changed a score, archived a student, reassigned a teacher). Recommended because the system publicly ranks minors and accountability matters.

---

## 8. Deferred but designed-for

**Per-subject sub-leaderboards.** Each stream is a **first-class rankable object**, not merely an input to the main average. A sub-board ranks one stream with entry rule = "this stream ≥2 assessments" (the single-stream form of the main gate). Single-subject students — included in decks **now** purely for history — already qualify for their subject's sub-board the day it is switched on, with **no backfill and zero schema change**. This is an explicit *designed-for, deferred* item: it must not be architected out.

**More subjects.** Subjects are data, not hardcoded. Adding a third subject needs no engine change: it's a new subject row, new assignments, new streams. The "≥2 subjects" and "≥2 qualifying streams" rules already generalize.

---

## 9. Config knobs (tunable without changing logic)

| Knob | Default | Notes |
|---|---|---|
| `alpha` (EWMA recency weight) | **0.4** | Higher = swingier; lower = more blended. |
| `mid_month_cutoff_day` | **15** | Day ≤ cutoff → eligible M+1; after → M+2. |
| `stream_min_assessments` | **2** | Assessments for a stream to qualify. |
| `main_board_min_streams` | **2** | Qualifying streams to appear on main board. |
| `teacher_self_edit_window` | **7 days / month-end** | Pick one; admins unrestricted. |
| `top_n_main_page` | **30** | Then "see more" → full board. |
| `timezone` | **Asia/Tashkent** | Monthly reset boundary. |
| `mask_format` | first name + last initial | Trailing digit on collision. |

---

## 10. Data model (forced by the decisions above)

Conceptual entities and the fields the engine requires. Not a schema — a checklist of what must exist.

**Student**
- `id`, `full_name`, `masked_display_name` (derived), `enrollment_date`, `enrollment_status` (`new` | `established` — set at add-time, drives how `eligibility_start` is computed), `eligibility_start` (year-month, stored, admin-overridable), `archived` (bool).

**Subject**
- `id`, `name`, `archived` (bool).

**Teacher** (a kind of user)
- `id`, `full_name`, `credentials`, `role` (teacher | admin | super-admin), `archived` (bool).

**Enrollment** — the (student, subject) → optional teacher object
- `student_id`, `subject_id`, `teacher_id` (**nullable** — empty = enrolled but unassigned → shows in the Unassigned view §7.5). Unique on (`student_id`, `subject_id`). Reassign = replace `teacher_id`; un-assign = clear it (enrollment remains). A student's subject **streams are keyed off their enrollments**, regardless of whether a teacher is currently attached.

**Assessment** — immutable source of truth
- `id`, `student_id`, `subject_id`, `teacher_id`, `created_at` (timestamp, Tashkent), `month` (derived), five criterion scores, `assessment_mean` (derived). Corrections create an edited record + trigger replay; originals/edits should be traceable for the audit log.

**Derived (never stored as bare numbers)**
- **Stream rating** per (student, subject, month) — replayed from that month's assessments via EWMA.
- **Main rating** per (student, month) — mean of qualifying streams.
- **Boards** (main + per-subject sub-boards) — queries over derived ratings + live eligibility gates.
- **Archived monthly boards** — snapshot at reset for the "previous month" view.

**Audit log**
- `actor_id`, `action`, `target`, `before`/`after`, `timestamp`.

---

## 11. Decision ledger (what's locked)

Engine: per-subject EWMA streams · α≈0.4 · order-based · first-assessment seeds · rating = mean of qualifying streams · derived-by-replay · monthly reset 00:00 Asia/Tashkent · history permanent · tiebreak by count then alphabetical · pre-data shows last month.

Eligibility: settling rule (≤15 → M+1, >15 → M+2) · `eligibility_start` stored & overridable · **new vs. established is an explicit add-time choice, not date-inferred** · established (incl. launch bulk import) skips settling · **transfer students settle (new to this center's teachers)** · main board needs settled + ≥2 subjects + ≥2 qualifying streams + not archived · sub-board needs settled + stream ≥2 + not archived · deck = everyone always · "strong+thin = not yet ranked" intended.

Student platform: public read-only · logo + search + TOP-30 + see-more · soft mask (first name + last initial, digit on collision) · profiles/search full public · profile = name, rank, recency-weighted rating (+ optional plain average), teachers per subject, newest-first history with expandable sub-scores · freshman banner, no rank.

Teacher platform: provisioned auth, no self-signup · one subject-tagged deck (both-subject student = two cards) · sliders 0–10 step 0.5 · right=Submit/left=Skip · slider-track vs card-body gesture split · explicit buttons · prefill "from last week" · Submit blocked until all five set · already-assessed included+marked · undo + autosave · manual single-assess reuses card · self-edit window + admin anytime · no student-info edits, no self-roster.

Admin platform: role-gated, super-admin bootstrap, no self-signup · students/teachers/subjects list-add-edit-archive · enrollment = (student,subject) with optional teacher (null teacher → Unassigned view), two-ended, reassign replaces & stream carries over · permanent unassigned view · failure-reason surfacing · archive-not-delete everywhere · correction-by-replay · audit log.

Deferred: per-subject sub-leaderboards (zero schema change) · more subjects (data-driven).
