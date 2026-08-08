# Expected Dashboard / Reports / Live Monitoring Output

These are the **actual, verified** numbers produced by
`GET /api/v1/dashboard/summary`, `GET /api/v1/reports/feedback-summary`,
and `GET /api/v1/live-monitoring/summary` after running, in order,
against the development database:

```bash
npm run seed              # base seed (Departments/Users/Locations/Personnel/Tablets/Surveys/10 sample sessions)
npm run canonical:generate
npm run canonical:load
```

Numbers were captured by calling each service function directly
against the real development database (`feedback_management_db`) —
not guessed or estimated — during this phase's own verification step.
Use this file for QA comparison after a fresh load; exact per-day trend
numbers will differ slightly if generated/loaded on a different date
(the `feedbackToday`/`feedbackThisWeek` windows are always relative to
"now"), but the totals, distributions, and breakdowns below are stable.

## Dashboard summary — `superadmin@fbms.test`

| Card | Value |
|---|---|
| Departments | 2 |
| Locations | 4 |
| Personnel | 8 |
| Tablets | 4 |
| Online tablets | 0 *(see note below)* |
| Offline tablets | 4 |
| Active surveys | 2 |
| Total feedback | **3,010** |
| Average rating | **3.59** / 5 |

Feedback by department: Registrar 1,886 · Library 1,124.
Feedback by survey: "Registrar Office Feedback" 1,882 · "General Service Feedback" 1,128
(1,878/1,122 from the canonical dataset + the 4/6 pre-existing samples
from `feedbackSeeder.js`).
Survey status distribution: 1 draft ("Library Services Feedback"), 2 published, 0 archived.

> **Online tablets = 0 is expected**, not a defect — see
> `CANONICAL_DATASET.md`'s "Known, expected characteristic" note. This
> dataset never writes `Tablet.lastSeen`; that field only updates via a
> real `POST /api/v1/mobile/heartbeat` call.

## Dashboard summary — `registrar.head@fbms.test` (department-scoped)

| Card | Value |
|---|---|
| Departments | 1 |
| Locations | 2 |
| Personnel | 4 |
| Tablets | 2 |
| Total feedback | **1,886** |
| Average rating | **3.48** / 5 |

## Reports — rating distribution (super_admin, all data)

| Rating | Count | % |
|---|---|---|
| 5 | 867 | 28.8% |
| 4 | 928 | 30.83% |
| 3 | 570 | 18.94% |
| 2 | 408 | 13.55% |
| 1 | 237 | 7.87% |

## Reports — feedback by location (super_admin)

| Location | Department | Count | Avg. rating |
|---|---|---|---|
| Registrar Main Counter | Registrar | 1,016 | 3.55 |
| Registrar Records Room | Registrar | 870 | 3.40 |
| Library Circulation Desk | Library | 619 | 3.82 |
| Library Reading Hall | Library | 505 | 3.74 |

## Reports — survey performance (super_admin)

| Survey | Assignment | Published | Feedback count | Avg. rating |
|---|---|---|---|---|
| Registrar Office Feedback | Department | Yes | 1,882 | 3.48 |
| General Service Feedback | Global | Yes | 1,128 | 3.78 |
| Library Services Feedback | Department | **No (draft)** | 0 | — |

## Live Monitoring summary (super_admin)

| Metric | Value |
|---|---|
| Online / Offline / Inactive tablets | 0 / 4 / 0 |
| Active surveys | 2 |
| Departments / Locations | 2 / 4 |

## Feedback list

| Query | Total | Pages (limit 3, for spot-checking pagination) |
|---|---|---|
| `super_admin`, no filters | 3,010 | 1,004 |
| `registrar.head@fbms.test` (department-scoped) | 1,886 | 629 |

Department isolation confirmed: the department-scoped total (1,886)
matches exactly the "feedback by department → Registrar" figure from
the system-wide report above.
