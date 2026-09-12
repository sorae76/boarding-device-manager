# Schedule G1-B work log

Status: **G1-B — READY FOR INDEPENDENT REVIEW**. No commit/push/deploy.

## Preflight

Verified repository `C:/Users/sorae/Documents/Device Manager`, branch `master`, HEAD,
cached origin/master and live remote master all
`bb5e9f0e6f522a8a3f364b2cd913e525fce3e683`. Ahead/behind 0/0, clean worktree,
empty staging, no active Git operation. Live remote verification required the
network-enabled read-only command after sandbox networking refused the connection.

## Resolver core scope, recorded before implementation

New non-test application code belongs exclusively in `lib/schedules/resolver.ts`:
a pure server-side resolver of supplied, authoritative G1-A publication/ledger
snapshots and explicit as-of assignment evidence. It has no UI, database client,
RPC invocation, write path, exceptions, custody, network, or incident integration.
The existing schedule read UI/data loader is unchanged. Publication snapshots must
come from a trusted complete consistent database read, not the public policy-only
read model (which omits the authoritative ledger). Disposable PostgreSQL tests
will exercise real G1-A persisted snapshots without adding a production endpoint.

An exact-pinned Temporal polyfill dependency provides explicit earlier/later DST
disambiguation instead of a bespoke offset search. Its semantics will be checked
against UTC fixtures, including Lord Howe's 30-minute transition. Node/ICU/tzdata
and resolver versions will be recorded in results; persisted results can be
replayed only with matching runtime versions. This dependency supports resolver
core, not G1-C authoring.

The resolver accepts known assignment intervals or unknown gaps; it never loads
today's student residence to infer history. No student-history migration is planned.

## Implemented contract

`resolveSchedule(input)` returns chronological half-open state segments and complete
canonical restricted windows intersecting the query. A point query is represented
by a one-millisecond segment; it does not clip the window to that millisecond.
Request timestamps require an explicit offset and millisecond-or-coarser precision.
Ranges are limited to 366 days per call. Bad requests return INVALID with a reason;
unparseable request bounds are represented by empty strings, not invented instants.

Inputs are school, subject identity, proven assignment intervals, complete scope
snapshots and an instant/range. Assignment evidence includes school, subject,
residence (or proven school-only null), UTC validity bounds and an evidence reference.
Each scope has a decimal-string bigint revision, every publication through that
revision, the immutable event snapshots, and every ledger row through that revision.
An explicitly empty scope has revision `"0"` and empty arrays. Absence of a scope
snapshot is not proof that no residence publication exists.

This core is not an authorization boundary. A future trusted server caller must
authorize access before supplying a consistent, complete snapshot. The existing
UI loader is deliberately not wired into this core: G1-A's internal tables are
not directly client-readable. The disposable integration query demonstrates a
single read-only repeatable-read snapshot, including explicit empty scopes.
No production read endpoint, grant change, schema change, or integration is added.

## Effective publication selection and precedence

Replay the ordered contiguous scope ledger through its supplied revision. Publish
extends the active chain; replace removes the prior tail and installs its replacement;
cancel removes the future tail and restores its predecessor's interpretation.
Validate tenant/scope ownership, publication/ledger references, revisions, dates,
and predecessor path. Missing or inconsistent ledger state is INVALID.

Each surviving publication uses its immutable timezone snapshot. Its effective
interval starts at the first actual instant of its local start date and ends at
the earlier of the day after inclusive declared effective_to or the surviving
successor's start instant (using that successor's timezone). A wholly skipped
policy date, invalid timezone, or nonpositive effective interval is INVALID.

Split at assignment and effective publication boundaries. Select an effective
residence publication first; otherwise use school-wide. Never combine templates.
An invalid selected residence ring remains INVALID. Missing residence snapshot is
UNCONFIGURED; an explicitly empty residence scope permits school fallback. Errors
that prevent a scope's timeline from being located safely fail that scope closed,
with publication IDs in `configuration_errors`; they are not hidden by fallback.

## Weekly ring and DST

Validate and sort local weekday/time events, Monday=0 through Sunday=6. Require
at least two events, both kinds, unique instants/IDs, and circular alternation.
For each Return, pair the next Release in local ring order, wrapping to the next
week where needed. Expand preceding/following weeks to establish interval-entry
state. Resolve each complete pair before clipping to its selected publication and
assignment interval. Never pair across different policies.

Temporal `earlier` is explicit for Return and `later` for Release. New York fold
and gap fixtures and Lord Howe's 30-minute fold and gap fixtures validate all four
combinations against literal UTC expectations. There is no hardcoded gap size.
The implementation uses the pinned polyfill and host ICU/tzdata. Temporal ambiguity
semantics were checked against the [TC39 documentation](https://tc39.es/proposal-temporal/docs/timezone.html)
and the installed polyfill README; product conservatism comes from Baseline D14.
UTC end <= start is INVALID. Overlapping/touching restrictions are unioned;
UNCONFIGURED, INVALID and positive-length ALLOWED gaps separate windows.

## Canonical identity and provenance

Window identity is SHA-256 over canonical key-sorted data: school, subject, full UTC
window boundaries, runtime/resolver versions, participating assignment evidence,
publication identities/revisions, scope/fallback selection, timezone snapshots,
local/UTC Return and Release boundaries and their clipped contributions. Sorting
uses code-unit comparison, not the machine's default locale.

Provenance retains both sides of a cutover, original weekly event boundaries,
actual clipped UTC/local boundaries, declared/authorized effective boundaries,
and successor identity. Distant successor/end metadata is explanatory and excluded
from the identity hash, so a remote future cutover does not rename an unchanged
historical window. Scope revision vectors are returned separately.

Window search starts with 16 days of padding and doubles until every relevant
window is complete; a 45-publication continuous-chain fixture exercises expansion.
The maximum padding is 4096 days per side. Reaching that bound returns INVALID
(`canonical_window_expansion_limit`), never a falsely complete window/ID.

Versions in the validated runtime:

- resolver: `g1b/1`
- Temporal: `@js-temporal/polyfill@0.5.1` (exact dependency and lockfile)
- Node: `24.16.0`
- ICU: `78.3`
- tzdata: `2026b`

For a frozen evaluation, its consumer must retain both the authoritative input
snapshot and output and pass saved `expected_versions` on replay. A version mismatch
returns INVALID, rather than reinterpreting old timestamps. This pure core does
not persist evaluations or mutate previously saved windows; no Gate 5 evaluator
or persistence subsystem is introduced.

## Historical/as-of and failure behavior

The current model is `students.dorm_id`, updated by
`20260716000000_phase_3b_3a_primary_residence_assignment.sql`; it has no immutable
student residence timeline. Staff assignment dates are not student assignment
history. Missing proven intervals therefore yield `unknown_as_of_assignment` /
UNCONFIGURED. Overlapping, cross-school or wrong-subject evidence is INVALID.
Known assignment changes clip/reselect templates and retain each evidence snapshot.
Unknown gaps cannot be merged away. This follows D13's explicit unknown-context
rule and is not a reason to invent a student-history migration.

Inactive selected published rows, invalid rings/zones, inconsistent ledgers,
unsupported timestamps and runtime mismatches are INVALID. UNCONFIGURED/INVALID
are configuration results, never ALLOWED or automatic student violations.
Neither result creates an incident, notification, custody event or notice.

## Validation record

| Check | Result |
| --- | --- |
| Focused resolver: `node --experimental-strip-types --test tests/device-schedule-resolver.test.ts` | 43 passed, 0 failed, 0 skipped |
| All repository tests: `node --experimental-strip-types --test tests/*.test.ts` | 180 passed, 0 failed, 0 skipped; includes 8 foundation, 6 schedule management and 7 G1-A tests |
| `npm.cmd run typecheck -- --incremental false` | PASS, exit 0 |
| `npm.cmd run lint -- --no-cache` | PASS, exit 0; no ESLint warnings/errors |
| `npm.cmd run build` | PASS, exit 0; compiled, type/lint validation completed, 26/26 static pages generated, build traces collected |
| `node --experimental-strip-types tests/device-schedule-write-boundary-db.mjs --with-g1b` | PASS, exit 0; clean replay of all 18 migrations in disposable PostgreSQL 17; G1-A concurrency A-F and all existing boundary checks; 7 G1-B runtime check groups |
| `git diff --check` | PASS, exit 0 |

The A-Z requested test matrix is represented in the focused test names. Additional
checks cover immutable snapshots, subject-bound assignment evidence, assignment
changes/gaps, replacement/cancellation, old-revision replay, malformed/incomplete
snapshots, DST overlaps, timezone snapshot changes, input ordering, skipped policy
dates, offset-only zone rejection, distant-future identity stability and long chains.

Disposable G1-B fixtures are created through actual G1-A publish/cancel RPCs. A
copied snapshot is corrupted only in memory to verify INVALID residence behavior;
no invalid publication is forced into the DB. The persisted DST fixture uses a
future New York fall-back Sunday and literal expected UTC offsets. This is
disposable database validation, not Production QA.

Initial parallel typecheck/lint encountered a runner pipe failure and a V8 memory
allocation failure. Sequential reruns passed; no check was disabled. Initial
network/npm/Docker sandbox failures were retried with approved access. Node's
existing typeless-package warning remains; it is not a test failure. Dependency
installation reported repository audit findings; unrelated dependency upgrades
were not performed.

## Custody isolation

The resolver imports only `node:crypto` and the Temporal polyfill, does no I/O, and
does not mutate inputs. A focused guard checks that no client/RPC/write/incident
path is introduced. Existing atomic custody, residence security and student custody
tests pass in the full suite. All custody device/event/notice rows in disposable
PostgreSQL are identical before and after the G1-B run; no incident tables are
created. The G1-A fixture remains `checked_out|0` custody events. No migration,
custody source, schedule UI, network or exception code changed.

## Review scope and Git evidence

Modified tracked files:

- `package.json` — exact Temporal dependency.
- `package-lock.json` — Temporal and its locked JSBI dependency.
- `tests/device-schedule-write-boundary-db.mjs` — five-line opt-in G1-B callback;
  existing G1-A tests and migration checks are unchanged.

New untracked files:

- `lib/schedules/resolver.ts` — pure resolver core.
- `tests/device-schedule-resolver.test.ts` — focused tests.
- `tests/device-schedule-resolver-db.mjs` — disposable integration checks.
- `docs/device-manager/g1b-work-log.md` — scope rationale and review evidence.

No commit, push, deployment, production DB operation or G1-C work performed.
G1-A remains CLOSED / PASS. Staging is empty; HEAD remains the preflight baseline.

Final `git status --short`:

```text
 M package-lock.json
 M package.json
 M tests/device-schedule-write-boundary-db.mjs
?? docs/device-manager/g1b-work-log.md
?? lib/schedules/resolver.ts
?? tests/device-schedule-resolver-db.mjs
?? tests/device-schedule-resolver.test.ts
```

Final `git diff --stat` (Git excludes the four untracked files above):

```text
 package-lock.json                         | 19 +++++++++++++++++++
 package.json                              |  1 +
 tests/device-schedule-write-boundary-db.mjs |  5 +++++
 3 files changed, 25 insertions(+)
```

Final verdict: **G1-B — READY FOR INDEPENDENT REVIEW**. This is readiness for
review, not independent-review approval, gate closure or Production QA.
