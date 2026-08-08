# Generation Parameters

Full, transparent description of how `backend/src/seeders/generateCanonicalDataset.js`
built `feedback-sessions.json`, so the resulting numbers are auditable
rather than a black box. **Every distribution assumption below is this
phase's own invention** — no prior "academic distribution requirements"
document existed for this project to follow (this mini-phase was
started fresh, with no earlier P9.1 attempt to inherit parameters
from), so the shape of the dataset (seasonal pattern, weekday pattern,
rating skew, etc.) is a deliberately documented, reasonable illustrative
default for a Philippine school-office setting — not sourced from any
real institution's actual historical data or calendar.

## Determinism

A fixed PRNG seed (`20260801`, a `mulberry32` generator — a small,
well-known, dependency-free deterministic PRNG) drives every random
choice in a fixed iteration order (day-by-day, session-by-session).
Re-running `npm run canonical:generate` produces a byte-identical
`feedback-sessions.json` every time — verified during this phase by
running it twice and comparing checksums.

## Date range and volume

- **Range:** 2026-03-01 through 2026-08-08 inclusive (161 calendar days), per this phase's explicit instruction.
- **Total sessions:** exactly 3,000 (the instruction said "approximately"; an exact target was used so the per-day allocation is auditable via a simple largest-remainder rounding rather than an arbitrary approximation).

## Daily volume shape

Each day's relative weight = `monthWeight × weekdayWeight × noise`,
then all 161 daily weights are normalized and allocated to sum to
exactly 3,000 sessions (largest-remainder method, so every day gets a
whole number of sessions and the total is exact).

**Month weights** (illustrative "academic calendar" shape):

| Month | Weight | Rationale (assumed, not sourced) |
|---|---|---|
| March | 1.35 | Enrollment/intake period — higher foot traffic |
| April | 1.05 | Regular term activity |
| May | 0.55 | Semester break / summer lull |
| June | 1.15 | New term start |
| July | 1.25 | Regular term activity, slightly busier |
| August (1–8 only) | 1.10 | Partial month, regular activity |

**Weekday weights** (0=Sunday..6=Saturday): Monday–Friday = `1.0`,
Saturday = `0.3` (limited weekend hours), Sunday = `0` (offices/library
assumed closed).

**Noise:** each day's weight is additionally multiplied by a uniform
random factor in `[0.85, 1.15]` for natural day-to-day variance.

## Department / tablet split

- Baseline department share: Registrar 55%, Library 45% (Registrar
  assumed to see more year-round foot traffic).
- **Enrollment-season boost:** in March and June, Registrar's share is
  boosted by +15 points (to 70%) — enrollment-related traffic
  realistically concentrates on Registrar, not Library.
- Within each department, tablet split: the "primary" tablet
  (`REG-TAB-01` / `LIB-TAB-01`) gets 55%, the secondary
  (`REG-TAB-02` / `LIB-TAB-02`) gets 45%.

## Survey assignment

Fixed by tablet, not randomized — see `CANONICAL_DATASET.md`'s
"Which survey each tablet's feedback belongs to" section for why:
Registrar tablets → "Registrar Office Feedback"; Library tablets →
"General Service Feedback."

## Submission time-of-day

Business-hours only. Hour is drawn from a weighted array biased toward
late morning and early afternoon:
`[8, 9, 10, 10, 11, 11, 12, 13, 13, 14, 14, 15, 16, 17]`; minute/second
are uniform random. `completedAt` = `submittedAt` + a duration of
`40 + (answerCount × 20) + random(-10, 25)` seconds — calibrated to
land in roughly the same 90–160 second range `feedbackSeeder.js`'s own
10 hand-written samples use for 3–4 answers.

## Rating distribution

Base distribution (used for Library/Global-survey sessions, and for
Registrar sessions outside the enrollment-boosted months):

| Rating | 5 | 4 | 3 | 2 | 1 |
|---|---|---|---|---|---|
| Weight | 32% | 33% | 17% | 12% | 6% |

**Crowded-period distribution** (Registrar sessions in March/June —
the same months Registrar's volume share is boosted): shifted down to
reflect wait-time/crowding pressure, a natural, explainable consequence
of the volume increase rather than a fabricated incident:

| Rating | 5 | 4 | 3 | 2 | 1 |
|---|---|---|---|---|---|
| Weight | 22% | 28% | 22% | 18% | 10% |

## Correlated yes/no answers

"Would you recommend our services to others?" (Global survey) and "Was
your concern resolved?" (Registrar survey) are both correlated to that
session's own rating rather than drawn independently:

- rating ≥ 4 → 93% chance `true`
- rating = 3 → 60% chance `true`
- rating ≤ 2 → 15% chance `true`

"Was your concern resolved?" is optional in the real Survey definition
(`required: false`) — it's included in ~90% of Registrar sessions and
omitted in the rest, to reflect that optionality rather than always
answering it.

## Multiple-choice answers

"Which service did you avail today?" (Registrar survey, options:
Enrollment / Document Request / Grade Inquiry / Other):

| Option | Base weight | Enrollment-season (Mar/Jun) weight |
|---|---|---|
| Enrollment | 30% | 55% |
| Document Request | 32% | 22% |
| Grade Inquiry | 23% | 14% |
| Other | 15% | 9% |

## Text answers

"Do you have any additional comments?" (Global, `long_text`, optional)
and "Any suggestions for improvement?" (Registrar, `short_text`,
optional) are each drawn from a small pool of canned comments (~4–8
per bucket), bucketed by that session's rating (`positive` for 4–5,
`neutral` for 3, `negative` for 1–2 — see the `COMMENT_POOLS` constant
in `generateCanonicalDataset.js` for the exact text). A blank string is
used ~20–25% of the time to reflect that these fields are optional and
not everyone leaves a comment, matching the same "occasionally blank"
pattern `feedbackSeeder.js`'s own sample data already shows.

## Reference codes

Assigned in chronological order (by `submittedAt`, ascending) after
generation, continuing `feedbackSeeder.js`'s own `FB-2026-000001`–
`FB-2026-000010` sequence from `FB-2026-000011` through
`FB-2026-003010` — the same `FB-{year}-{6-digit sequence}` format
`backend/src/services/feedbackService.js`'s own
`generateUniqueReferenceCode` uses for real mobile submissions, so a
real submission made after loading this dataset will naturally
continue the sequence at `FB-2026-003011` with no collision.
