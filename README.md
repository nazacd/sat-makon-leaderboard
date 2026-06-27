# SAT-MAKON Rating Platform

A web platform that ranks students at the SAT-MAKON learning center by performance,
to motivate them through a public leaderboard.

Each student is rated 0–10 across five criteria (homework, progress, activity,
attendance, behavior). Teachers assess their students per subject; a recency-weighted
average produces each student's rating, which resets every month and feeds a public,
ranked leaderboard with masked names.

## Three surfaces
- **Student platform** — public, read-only: the leaderboard, search, and student profiles.
- **Teacher platform** — authenticated: a swipe-based "deck of cards" for fast weekly assessments.
- **Admin platform** — manages students, teachers, subjects, and teacher–student rosters.

## Tech
React + Vite + TailwindCSS.

## Docs
See `SAT-MAKON-spec.md` for the full product spec and `SAT-MAKON-build-prompt.md` for the build plan.
Mock seed data lives in `satmakon-mock-data.json`.
