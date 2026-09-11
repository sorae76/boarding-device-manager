# Device Manager Gate Records

## DSE-1B-1 / Gate 0

- Gate: DSE-1B-1 / Gate 0
- status: CLOSED
- closed_at: 2026-09-07T12:26:28-04:00
- DSE-1B-1 verdict: PRODUCTION PASS
- production commit SHA: `c27ef9d757c7933dd58cae2fd150e0093baf05f3` (production association USER-ATTESTED)
- remote SHA: `c27ef9d757c7933dd58cae2fd150e0093baf05f3` (VERIFIED live origin/master before this docs-only closure)
- mismatch/blocker: none identified within this gate's scope
- production mutation: none (prior QA USER-ATTESTED; this verification performed no production writes)

### Verification Matrix

| Item | Status | Evidence |
| --- | --- | --- |
| Implementation HEAD | VERIFIED | `git rev-parse HEAD` returned `c27ef9d757c7933dd58cae2fd150e0093baf05f3`; `git show --stat HEAD` showed the read-only schedule implementation. |
| Live remote master | VERIFIED | `git ls-remote origin refs/heads/master` returned the same full SHA. |
| Local/remote synchronization | VERIFIED | `git rev-list --left-right --count HEAD...origin/master` returned `0 0`; cached origin/master matched the live remote SHA. |
| Worktree before gate record | VERIFIED | `git status --short` and `git status --porcelain=v1` returned no entries before this document was added. |
| Read-only Schedule Management UI implementation | VERIFIED | `app/app/settings/schedules/page.tsx` calls `requireScheduleContext`; `lib/schedules/access.ts` checks the shared role gate; `lib/schedules/data.ts` performs authenticated, school-scoped selects; `schedule-management.tsx` provides policy groups and empty states. |
| Existing tests | VERIFIED | `node --experimental-strip-types --test tests/*.test.ts`: 130 passed, 0 failed, 0 skipped, exit 0; includes schedule foundation and schedule management tests. |
| TypeScript | VERIFIED | `npm.cmd run typecheck -- --incremental false`: exit 0. |
| Lint | VERIFIED | `npm.cmd run lint -- --no-cache`: no ESLint warnings or errors, exit 0. |
| DSE-1A production foundation and independent audit | USER-ATTESTED | User reports production application and independent audit PASS; no independent production DB audit performed in this closure. |
| DSE-1B-1 independent review | USER-ATTESTED | User reports PASS; prior review was not independently reproduced or retrieved in this closure. |
| Vercel Production deployment and deployed commit | USER-ATTESTED | User reports Production PASS for the production commit above; no deployment API/CLI result obtained in this closure. |
| Production `/app/settings/schedules` access | USER-ATTESTED | Production browser QA reported PASS by user. |
| Production Super Admin access | USER-ATTESTED | Production browser QA reported PASS by user. |
| Production empty-state rendering | USER-ATTESTED | Production browser QA reported PASS by user. |
| Production Student direct URL denial | USER-ATTESTED | Production browser QA reported PASS by user; source role tests are separate local evidence. |
| Existing Settings regression | USER-ATTESTED | Production browser QA reported PASS by user. |
| Production schedule policy data absent | USER-ATTESTED | User reports no schedule policy data in production; no production data query performed in this closure. |
| No production test-data mutation during prior read-only QA | USER-ATTESTED | User explicitly reports that production test data was not mutated. |
| Parent login account outside current product scope | USER-ATTESTED | User states no Parent login account is planned in the current product scope. This does not assert the absence of the reserved `parent` type in source. |
| Reserved Parent role type and schedule exclusion | VERIFIED | `lib/auth/types.ts` includes `parent`; `lib/schedules/types.ts` excludes it from schedule readers; existing role-matrix test passes. |

### N/A and Deferred Verification

- Parent UI access test: N/A because Parent login accounts are outside the current product scope. This N/A is not a determination that future guardian notice or consent is unnecessary and must not be used for privacy policy decisions.
- Known deferred verification: production schedule data is not yet present; actual policy rendering QA will be performed at the first controlled policy creation. No test data was created for this gate.

### Record Convention and Scope

- Inspected repository Markdown documentation, tracked gate/status paths, and local `.agents` / `.codex` directories. Existing phase completion documents use Markdown status, commit, and verification records; no gate-specific document or controlled-commit procedure was found.
- This gate record uses the requested default path and the existing Markdown completion-record style.
- Closure changes only this document. The production SHA above remains the implementation baseline; a subsequent docs-only closure commit is a separate record commit.
- Baseline v2 design and Gate 1 implementation were not performed as part of this closure.

## Schedule G1-A

- Gate: Schedule G1-A — Schedule Write Boundary
- status: CLOSED
- closed_at: 2026-09-09T18:18:34-04:00
- verdict: CLOSED / PASS
- implementation commit: `c999d091d9e6545e91d0e7bead86d975de829566`
- implementation parent: `9548a9801a14accda78fdfaa4fbef31507b8357f`
- Production project: `dormdevice-db` (`haakvegrtyeyedqidgte`), status `ACTIVE_HEALTHY` (USER-ATTESTED)
- Production migration application: `20260907190930_g1a_schedule_write_boundary.sql` APPLIED (USER-ATTESTED)
- production schedule test data: none created (USER-ATTESTED)
- mismatch/blocker: none identified within this gate's scope

### Verification Matrix

| Item | Status | Evidence |
| --- | --- | --- |
| Repository, branch, and implementation HEAD | VERIFIED | Repository root is `C:/Users/sorae/Documents/Device Manager`; branch is `master`; local HEAD is `c999d091d9e6545e91d0e7bead86d975de829566`. |
| Live remote master | VERIFIED | `git ls-remote origin refs/heads/master` returned `c999d091d9e6545e91d0e7bead86d975de829566`; cached origin/master matched and ahead/behind was `0/0` before this record. |
| Implementation commit scope | VERIFIED | Commit parent is `9548a9801a14accda78fdfaa4fbef31507b8357f`; the commit contains only the G1-A forward migration, focused static test, and disposable PostgreSQL test harness. |
| Independent review | USER-ATTESTED | User reports the corrected G1-A implementation passed independent re-review before controlled commit and push. |
| Focused source contract | VERIFIED | `node --experimental-strip-types --test tests/device-schedule-write-boundary.test.ts`: 7 passed, 0 failed. |
| Clean migration replay | VERIFIED | All 18 migrations replayed successfully from a clean disposable PostgreSQL 17 database, including the G1-A forward migration. |
| Runtime and genuine concurrency | VERIFIED | Disposable PostgreSQL runtime passed atomicity, authorization, timeline, idempotency, privilege, ownership, immutable-trigger, and custody-isolation checks; genuine simultaneous-session cases A-F passed. |
| Full repository regression | VERIFIED | `node --experimental-strip-types --test tests/*.test.ts`: 137 passed, 0 failed; TypeScript, lint, and production build passed. |
| Production migration history and health | USER-ATTESTED | User reports project `haakvegrtyeyedqidgte` is `ACTIVE_HEALTHY` and the G1-A migration is present in Production migration history. |
| Production schedule row counts | USER-ATTESTED | User reports `device_schedule_policies = 0` and `device_schedule_weekly_events = 0` after migration. |
| Production G1-A schema and RPCs | USER-ATTESTED | User reports scope revisions, publications, publication ledger, and idempotency tables exist; publish and future-cancel RPCs exist. |
| Production privileges and RLS | USER-ATTESTED | User reports authenticated direct policy/event INSERT and UPDATE are removed, authenticated SELECT and read RLS policies remain, mutation RLS policies are removed, and internal tables have no direct client privileges. |
| Production RPC hardening and immutability | USER-ATTESTED | User reports publish/cancel are `SECURITY DEFINER`, owned by `postgres`, use `search_path=""`, grant EXECUTE only to authenticated, and all immutable triggers are present. |
| Custody isolation | VERIFIED | The implementation commit changes no custody source or migration; static and disposable runtime checks confirmed schedule publication neither changes custody status nor creates custody events. |
| No Production schedule test data | USER-ATTESTED | User explicitly reports that no throwaway schedule policy or weekly event data was created for closure. |

### Deferred Production Runtime QA

- A successful Production publish is intentionally deferred to Schedule G1-C, when the first controlled real schedule policy is created.
- This is not a G1-A blocker: the DB boundary and genuine concurrency were validated in disposable PostgreSQL, Production migration/schema/privileges were audited, and creating throwaway Production schedule data would add unnecessary mutation.
- The first controlled G1-C publication must verify the successful publish result and the existing deferred Production policy rendering QA without retroactively changing this gate's evidence classification.

### Closure Scope

- Schedule G1-A is CLOSED / PASS. Schedule G1-B is READY but was not started by this closure.
- Previous CLOSED gates remain closed and are not reopened by this record.
- Implementation Baseline v2, application code, migrations, RPCs, tests, UI, network work, and custody behavior are unchanged by this docs-only closure.

## Joint Commercial Baseline Lock

- Commercial Strategy Baseline v1.7: **LOCKED / PASS**
  - path: `docs/device-manager/commercial-strategy-baseline-v1.7.md`
  - lock commit SHA: `14fb6e8d8154b8d29fd6c394c3698a72fe1a744a`
- Implementation Baseline v2.6: **LOCKED CONTROLLED AMENDMENT / PASS**
  - path: `docs/device-manager/implementation-baseline-v2.6-commercial-amendment.md`
  - base Implementation Baseline v2 ref: `bb5e9f0e6f522a8a3f364b2cd913e525fce3e683`
  - lock commit SHA: `14fb6e8d8154b8d29fd6c394c3698a72fe1a744a`
- Independent review: **BOTH BASELINES — READY TO LOCK** (USER-ATTESTED Claude independent final review).
- O-C03: **RESOLVED by joint baseline lock**.
- Schedule G1-A remains **CLOSED / PASS**; G1-B status is unchanged.
- No technical Gate is reopened or closed, and no Network Gate status is changed by this record.
