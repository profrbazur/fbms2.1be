# backend/demo-data/

This folder holds the **Canonical Demonstration Dataset** for FBMS — a
permanent, portable, reusable teaching/demo baseline of historical
Feedback Session data, generated in mini-phase P9.1. It lives under
`backend/` (moved from the repository root in P9.3) since it is runtime
data consumed only by the backend, and packaging it here means it
deploys together with the Render backend service.

## What's here

| File | Purpose |
|---|---|
| `feedback-sessions.json` | The portable, business-key-based dataset itself (3,000 feedback sessions with their answers). Not tied to any specific database's ObjectIds. |
| `generation-stats.json` | Raw aggregate stats computed at generation time (counts by department/survey/tablet/month, rating distribution). Source of truth for the numbers in `EXPECTED_DASHBOARD.md`. |
| `CANONICAL_DATASET.md` | What the dataset contains, how it maps onto the existing seeded Surveys/Tablets/Departments, and its documented limitations. |
| `GENERATION_PARAMETERS.md` | The full generation algorithm — every assumption, weight, and distribution used — so the numbers are auditable, not a black box. |
| `LOGIN_CREDENTIALS.md` | The existing seeded Version 1 login accounts (no new accounts were created — see `docs/DECISIONS.md` and this phase's own scope). |
| `EXPECTED_DASHBOARD.md` | The actual, verified Dashboard/Reports/Live Monitoring numbers produced after loading this dataset — for QA comparison. |

## How to regenerate / reload

```bash
cd backend
npm run canonical:generate   # (re)writes demo-data/feedback-sessions.json + generation-stats.json — pure computation, no database
npm run canonical:load       # reads demo-data/feedback-sessions.json and upserts it into whatever database MONGO_URI points to
```

`npm run seed` (the standard dev seeder — Departments/Users/Locations/
Personnel/Tablets/Surveys/the original 10 sample feedback sessions)
must have already been run at least once against that database before
loading the canonical dataset, since the loader resolves every session
by looking up the existing Survey/Tablet business keys — it never
creates them.

Both scripts are safe to re-run: generation is deterministic (same
output every time — see `GENERATION_PARAMETERS.md`), and loading
upserts by `referenceCode` (session) / `{feedbackSessionId, questionId}`
(answer), so re-running never duplicates data. `loadCanonicalDataset.js`
also refuses to run against any database whose resolved name contains
`"test"`, so it can never be pointed at `feedback_management_test_db`
by mistake.

## Why files, not a second database

Per this phase's explicit instruction, no second MongoDB database
(e.g. `feedback_backup`) was created. The canonical dataset lives here
as portable JSON and is loaded into the same single development
database (`feedback_management_db`) the rest of the application
already uses — this is also what let **P9.2**'s "Reload Canonical
Dataset" feature (Administration → Developer Portal in the Admin Web,
backed by `POST /api/v1/developer-portal/reload-canonical-dataset`)
simply read these same files rather than depend on a separate database
existing. That endpoint reuses `loadCanonicalDataset.js`'s exported
`loadCanonicalDataset()` function directly (imported, not shelled out
to) — see `docs/DECISIONS.md` ADR-052.

## Scope note

This dataset only adds `FeedbackSession`/`FeedbackAnswer` records
against the Surveys/Tablets/Departments/Locations that already exist
in the standard seeded state. No model, endpoint, authentication rule,
or seeded user account was added or changed to produce it — see
`CANONICAL_DATASET.md`'s Limitations section for the one case where
that constrained what the dataset could realistically contain.
