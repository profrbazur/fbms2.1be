# Login Credentials — Existing Seeded Accounts Only

**No new login accounts were created for the Canonical Demonstration
Dataset.** Per this phase's explicit instruction, the 9 accounts
`backend/src/seeders/userSeeder.js` already seeds remain the sole,
canonical Version 1 login accounts. This file exists only to point at
them for demo/teaching purposes — it does not define anything new.

Passwords are intentionally **not** listed here, matching the same
precedent set by the P2.0 completion report: see `backend/src/seeders/userSeeder.js`'s
`DEFAULT_PASSWORD` (or the `SEED_DEFAULT_PASSWORD` environment
variable, if set) for the actual seeded dev/demo password shared by
every account below.

| Email | Role | Department |
|---|---|---|
| `superadmin@fbms.test` | `super_admin` | System-wide (no department) |
| `registrar.head@fbms.test` | `department_head` | Registrar |
| `library.head@fbms.test` | `department_head` | Library |
| `registrar.staff1@fbms.test` | `personnel` | Registrar |
| `registrar.staff2@fbms.test` | `personnel` | Registrar |
| `registrar.staff3@fbms.test` | `personnel` | Registrar |
| `library.staff1@fbms.test` | `personnel` | Library |
| `library.staff2@fbms.test` | `personnel` | Library |
| `library.staff3@fbms.test` | `personnel` | Library |

## Suggested demo walkthrough

- **`superadmin@fbms.test`** — full system-wide view: Dashboard/Reports
  show both Registrar and Library data side by side, Audit Logs
  accessible, all modules writable.
- **`registrar.head@fbms.test`** or any `registrar.staff*@fbms.test` —
  Dashboard/Reports/Feedback/Live Monitoring scoped to Registrar only
  (~1,886 of the canonical dataset's 3,010 total feedback sessions).
- **`library.head@fbms.test`** or any `library.staff*@fbms.test` —
  scoped to Library only (~1,124 sessions).

Authentication itself (JWT, seeded-local `authProvider`, role keys,
RBAC) is unchanged — see `docs/DECISIONS.md` and `docs/PROJECT_SCOPE.md`.
