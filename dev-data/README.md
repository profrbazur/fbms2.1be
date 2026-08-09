# backend/dev-data/

This folder documents the **V2 Development Dataset** — a small,
deterministic dataset for active V2.3+ development and QA, established
alongside the V2.2 → `develop-v2` merge as a controlled maintenance
task. It lives under `backend/` next to `demo-data/` (the existing
Canonical Demonstration Dataset's own committed-doc location) since
`docs/` is gitignored in this repository and cannot hold documentation
that needs to be committed.

There is no separate data folder here (no JSON files) because, unlike
the Canonical Demonstration Dataset, this dataset's definitions live in
code that already existed before this task — see "Dataset Strategy"
below.

## Dataset strategy: three tiers

| Tier | What it is | How to load it | Where it lives |
|---|---|---|---|
| **Existing Canonical / Demonstration Dataset** (legacy) | A large (3,000 session), realistic, synthetic dataset for dashboards, analytics, trends, and final demonstrations. Unchanged by this task. | `npm run canonical:generate` then `npm run canonical:load` (after `npm run seed`) | `backend/demo-data/` |
| **V2 Development Dataset** (new, this task) | A small, deterministic dataset for day-to-day V2.3+ development and QA — fast to reload, easy to inspect and debug manually. | `npm run seed:development` | `backend/src/seeders/{userSeeder,organizationSeeder,personnelSeeder,tabletSeeder,surveySeeder,feedbackSeeder}.js` (reused) + `backend/src/seeders/seedDevelopmentDataset.js` (new entrypoint) |
| **Automated test fixtures** | Self-contained seeding for `npm test`, isolated to the dedicated test database (`*_test_db`, enforced by `tests/setup/loadTestEnv.js`). Never depends on, or affects, the shared development database. | Automatic via each test file's own `beforeAll`/`resetAndSeed()` | `backend/tests/utils/seedTestUsers.js`, `backend/tests/seeder.test.js`, etc. |

### Why the V2 Development Dataset reuses existing seeder code

Before this task, `npm run seed` (the "base seed") already produced a
small, deterministic, idempotent dataset — 2 departments, 11 users, 4
locations, 8 personnel records, 4 tablets, 3 surveys, 10 feedback
sessions — matching almost exactly the small-dataset target this task
called for. The large Canonical Demonstration Dataset was already a
*separate, additive* layer on top (`npm run canonical:generate` +
`npm run canonical:load`, adding 3,000 more feedback sessions into
`backend/demo-data/`), not something the base seed needed to be split
out of.

Given that, duplicating the base seed's Department/User/Location/
Personnel/Tablet/Survey/Feedback definitions into a second parallel set
of seeder files would have created an unnecessary parallel framework
(the fields, roles, and relationships would be identical) without
adding any real separation. Instead, `seedDevelopmentDataset.js` is a
thin new entrypoint that:

1. Removes any `FeedbackSession`/`FeedbackAnswer` records **outside**
   the small baseline's 10 known reference codes (`FB-2026-000001`
   .. `FB-2026-000010`, exported as `SEEDED_REFERENCE_CODES` from
   `feedbackSeeder.js`) — e.g. a previously loaded 3,000-session
   canonical dataset, or stray mobile submissions.
2. Re-runs the exact same `seedUsers`/`seedOrganizationSettings`/
   `seedLocations`/`seedPersonnel`/`seedTablets`/`seedSurveys`/
   `seedFeedback` functions `npm run seed` already runs, to
   (re)assert the known small baseline.

This keeps the legacy canonical dataset's own generator/loader
completely untouched, and keeps `npm run seed`'s existing meaning
unchanged (it still just seeds the base data; it does not delete
anything). `npm run seed:development` is a strict superset of what
`npm run seed` does — the `npm run seed` command was NOT repurposed.

## Approximate contents (V2.2 baseline, actual counts)

* Organization settings: 1
* Departments: 2 (Registrar, Library)
* Users: 11 (1 Super Admin, 2 Senior Leadership, 2 Department Heads, 6 Personnel)
* Locations: 4 (2 per department)
* Personnel records: 8 (2 department heads + 6 personnel-role staff)
* Tablets: 4 (2 per department)
* Surveys: 3 (1 Global published, 1 Registrar published, 1 Library draft)
* Feedback sessions: 10, with answers scoped to each survey's actual questions

These counts were not changed by this task — they are the pre-existing
`userSeeder.js`/`organizationSeeder.js`/`personnelSeeder.js`/
`tabletSeeder.js`/`surveySeeder.js`/`feedbackSeeder.js` output, verified
unchanged by `backend/tests/seeder.test.js`.

## Load / reset command

```bash
cd backend
npm run seed:development
```

Deterministic and idempotent: every Department/User/Location/
Personnel/Tablet/Survey/Question record is upserted by its own stable
business key (department code, email, location code, employee number,
device code, survey title + question text), never duplicated on
re-run. Feedback sessions/answers are upserted by `referenceCode` /
`{feedbackSessionId, questionId}`. Running the command any number of
times converges to the same small dataset.

**Environment safety**: refuses to run against any `MONGO_URI` whose
resolved database name contains `"test"` (mirrors
`loadCanonicalDataset.js`'s own guard), so it can never touch the
dedicated automated-test database. It only ever targets whatever
database `MONGO_URI` in `backend/.env` points at — the development
database per `docs/MONGODB_HANDOFF.md`. It never touches production
data, since this repository has no separate production environment
variable path — `MONGO_URI` must be pointed manually, deliberately, and
this script's guard only ever blocks the one known-unsafe case
(a test database), consistent with `loadCanonicalDataset.js`'s existing
convention.

## Current schema version

V2.2 (Senior Leadership read-only access). Contains only fields that
exist in the current `develop-v2` schema.

## Evolution rule

This dataset intentionally evolves incrementally alongside the
roadmap, and intentionally does **not** include any future-phase
field ahead of its corresponding implementation phase:

* **V2.3** — add Building and updated Location relationships
* **V2.4** — add Staff PIN / ServiceSession / historical Personnel attribution
* **V2.5** — add standardized Courtesy / Clarity / Waiting Time data
* **V2.6** — add Service / Transaction Types
* **V2.7** — add Respondent Type
* **V2.8** — add KPI Targets

A new, large, realistic synthetic/canonical demonstration dataset will
be created later, once the V2 domain model stabilizes — not as part of
this or any single mini-phase.

## Why intentionally small

Fast reload, easy manual inspection/debugging, and predictable
role/department-scoping coverage matter more during active development
than realistic volume or trend-worthy data — that is what
`backend/demo-data/`'s Canonical Demonstration Dataset is for.

## Demo credentials

All V2 Development Dataset accounts use the same local/demo-only
default password as the existing base seed
(`userSeeder.js`'s `DEFAULT_PASSWORD`, override-able via
`SEED_DEFAULT_PASSWORD`) — never a real credential, never committed as
a literal secret beyond this well-known local development default.
