# Schedule G1-C review report

## Confirmed independent-review corrections — 2026-09-13

Current status: **CONFIRMED FINDINGS IMPLEMENTED — READY FOR INDEPENDENT RE-REVIEW**.
No independent-review PASS, gate closure, commit, push, deployment, or Production
operation is recorded by this correction. The original report below is retained
as the pre-correction record; this section supersedes its affected authorization,
RPC-signature, file-count, and validation statements.

Scope is limited to the two user-confirmed findings:

1. **Supervisor residence authorization:** the new forward migration strengthens
   `private.authorized_device_schedule_context`. A supervisor must have active
   same-school membership plus an active assignment to the exact residence with
   `starts_at <= now()` and `ends_at IS NULL OR ends_at > now()`. Active school,
   user, and residence checks remain. Super-admin/school-admin authority is
   preserved. Publish, cancel, and the G1-C manageable-residence list share this
   rule. Exception authorization is unchanged.
2. **Atomic preview timezone:** preview returns its timezone; the UI retains and
   submits it with the fingerprint, including unchanged retries. The existing
   `publish_device_schedule` authority now accepts `target_expected_timezone`.
   After the existing scope/revision locks and successful-replay lookup, a new
   publication holds a school-row `FOR SHARE` lock, re-reads authorization, and
   rejects a missing/mismatched timezone with `stale_timezone` before any write.
   The checked timezone is retained through commit and stored in the immutable
   publication. It is also part of new idempotency payloads. The old signature is
   removed, leaving one public implementation; the default-null final parameter
   supports only original ten-argument legacy replays, never new publications.
   Matching successful retries precede the current-timezone check. Legacy audit
   rows remain unchanged; changed payloads still return idempotency conflict.

### Exact correction files

Only these ten files were changed by the correction:

- `app/app/settings/schedules/schedule-authoring.tsx`
- `lib/schedules/actions.ts`
- `lib/schedules/authoring-types.ts`
- `lib/schedules/authoring.ts`
- `tests/device-schedule-authoring-actions.test.ts`
- `tests/device-schedule-authoring-browser.mjs`
- `tests/device-schedule-authoring-db.mjs`
- `tests/device-schedule-write-boundary-db.mjs`
- `docs/device-manager/g1c-work-log.md`
- `supabase/migrations/20260913041030_g1c_confirmed_review_corrections.sql`

The last file was generated with `supabase migration new`. It adds no alternate
publication path and rewrites no historical migration. The original 13-file
uncommitted G1-C change set now contains 14 files, including this forward migration.
G1-B resolver, exception implementation, custody source, locked baselines, and
gate records remain unchanged by the correction.

### Correction validation

- Focused authoring/action tests: **18 PASS**, zero failures/skips.
- Full G1-A/G1-B/G1-C and custody unit regression: **198 PASS**, zero failures/skips.
- Disposable PostgreSQL runtime: **PASS** — 20 migrations, legacy upgrade/replay,
  G1-A concurrency A–F, G1-B persisted resolver regression, G1-C assignment and
  timezone races, exception concurrency/audit/privileges, and full custody
  device/event/notice isolation. Exit 0; the owned disposable container was removed.
- `npm.cmd run typecheck -- --incremental false`: **PASS**.
- `npm.cmd run lint -- --no-cache`: **PASS**, no warnings/errors. Changed test files
  also passed direct ESLint with cache disabled.
- `npm.cmd run build`: **PASS**, including all 26 generated static pages. The
  process explicitly used loopback `http://127.0.0.1:9` and a synthetic anon key;
  `.env.local` was not edited and no Production request was made.
- Bounded implementation re-review: complete. In-memory source comparison proved
  that the publication body matches G1-A outside the timezone parameter/payload/
  locked precondition additions, and the shared authorization helper matches
  outside the assignment predicate. Historical migration, G1-B resolver, locked
  baseline and custody-source diffs remain empty. This is self-validation for
  independent re-review, not independent approval or gate closure.
- `git diff --check`: **PASS**. HEAD remains
  `cd65b8136ac5f11ef0271bf099ae46b09d629d0c` on `master`; staging remains empty.
- Browser QA was not rerun for this correction. The synthetic transport was
  updated for the timezone argument; real action and DB boundary checks above
  provide the correction evidence. No real session-to-PostgREST browser QA is claimed.

The DB additions exercise all six assignment cases through publish, cancel, and
the manageable list. Timezone races synchronize on observed PostgreSQL lock waits:
an updater holding the school row makes the old preview stale; a publication
holding SHARE blocks a later timezone update until commit. Tests also cover
unchanged replay after timezone change, changed-timezone key conflict, omitted
timezone denial, exactly one public publication implementation, and migration
over a successful pre-amendment request with byte-identical legacy audit replay.

The first full runtime reached and passed both correction groups, then exposed
a test-fixture leak: the new G1-A supervisor assignment remained active during a
later exception-search assertion. Its lifetime was narrowed to its own test;
the original search assertion was retained and the full runtime was rerun.

## Original pre-correction readiness report

Status: **G1-C — READY FOR INDEPENDENT REVIEW**.
This is implementation review readiness, not independent-review approval, gate
closure, deployment approval, or Production QA. G1-A and G1-B remain CLOSED / PASS.
The locked Commercial Strategy v1.7 and Implementation Baseline v2.6 are unchanged.

## A. Read-only preflight

Verified before implementation:

- Exact repository/root: `C:/Users/sorae/Documents/Device Manager`.
- Branch: `master`.
- HEAD, cached `origin/master`, and live `refs/heads/master` all:
  `cd65b8136ac5f11ef0271bf099ae46b09d629d0c`.
- Clean working tree, empty staging, ahead/behind 0/0.
- No merge, rebase, cherry-pick, revert, or sequencer state.
- Live remote verification used read-only `git ls-remote`; sandbox networking
  initially failed, and the approved network-enabled retry matched exactly.

Read the specified baselines and gate records, G1-A migration/RPCs, G1-B resolver,
schedule read model/UI/tests, current session authorization, residence assignments,
and disposable PostgreSQL harness before the corresponding implementation.
No repository-specific AGENTS.md instructions were found.

## B. Exact changed files

Paths below are relative to the exact root in A; 13 files total.

| File | Change |
| --- | --- |
| `app/app/settings/schedules/page.tsx` | Manager-only authoring entry and clarified declared-date read model wording. |
| `app/app/settings/schedules/schedule-authoring.tsx` | New client authoring, preview, conflict recovery, exception create/revoke and audit UI. |
| `lib/schedules/actions.ts` | New authenticated server actions using RPCs only. |
| `lib/schedules/authoring-types.ts` | Serializable draft, snapshot, preview and result contracts. |
| `lib/schedules/authoring.ts` | Pure proposed-ledger preview and resolved publication intervals. |
| `lib/schedules/exceptions.ts` | Pure allow overlay around the unchanged G1-B resolver. |
| `supabase/migrations/20260912222326_g1c_schedule_authoring_and_allow_exceptions.sql` | New protected exception/audit tables and authorized RPCs. |
| `tests/device-schedule-authoring.test.ts` | 13 focused preview/overlay/identity/source tests. |
| `tests/device-schedule-authoring-actions.test.ts` | 4 tests executing the real server-action module with injected session/transport. |
| `tests/device-schedule-authoring-db.mjs` | Disposable SQL runtime, authorization, idempotency/concurrency and isolation tests. |
| `tests/device-schedule-authoring-browser.mjs` | Local synthetic browser fixture serving the real component and pure preview core. |
| `tests/device-schedule-write-boundary-db.mjs` | Opt-in G1-C runtime hook; latest-migration guard adapted to allow forward migrations. |
| `docs/device-manager/g1c-work-log.md` | This review report. |

## C. Architecture / RPC reuse

Schedule publication calls the existing `publish_device_schedule`; cancellation
calls the existing `cancel_future_device_schedule_publication`. Their definitions,
G1-A migration, grants, scope locks, expected revision checks, idempotency ledger,
atomicity and immutable triggers are unchanged. There is no application direct
INSERT/UPDATE/DELETE/UPSERT path for schedules or exceptions.

`read_device_schedule_authoring` is a manager-authorized STABLE SQL RPC. One MVCC
snapshot includes complete publication/ledger data and explicit revision-zero
scopes. Revisions are decimal strings to avoid JavaScript bigint precision loss.
Internal G1-A tables gain no client SELECT grants. A narrowly scoped boolean
reports whether the authenticated actor already has the submitted publication
request key, allowing response-loss retries to reach G1-A's original replay path
even if the date/revision has since changed. G1-A still compares the full canonical
payload and rejects conflicting key reuse.

The server constructs a proposed publication/ledger snapshot and runs G1-B.
Before a new publication it recalculates the preview and compares the submitted
fingerprint, including draft, timezone, scope revisions and runtime versions.
G1-A remains the final concurrency authority if another publication races the
server's reads. A fingerprint is a draft-consistency check, not an authorization
credential; authorization and validation run independently on the server/DB.

## D. Authoring UI

- School-wide and residence weekly Release/Return drafts; Monday=0 through Sunday=6.
- Add/remove events, school timezone/date, optional inclusive last effective date.
- Server-side deterministic first-eight-day UTC/local/DST preview, runtime/tzdata
  versions and effective UTC publication interval.
- Future successors, replacement of the not-yet-effective tail, and future-tail
  cancellation. Published content is never edited in place.
- Expected revision displayed; scope reload retains draft fields and requires a
  fresh preview. Editing changes the request key and invalidates the preview.
  Unchanged failed requests retain their keys for safe retry.
- Resolved publication timeline uses each immutable timezone snapshot and ledger
  cutover. The older read-only policy cards remain a declared-date read model.
- Drafts exist only in the open page; no offline mutation or draft persistence.

Authoring preview uses a clearly identified hypothetical scope assignment. It is
not a student/device forecast and never claims to prove future or historical
student residence membership.

## E. Allow exceptions and resolver integration

`create_device_schedule_allow` accepts exactly one same-school operational device,
student or residence. DB constraints enforce effect `allow`, finite millisecond
UTC `[start,end)`, start at/after server creation time, positive duration and a
trimmed reason of 1–2000 characters. The UI requires explicit UTC text ending in
`Z`; local ambiguous/nonexistent timestamps are not accepted as local inputs.

Creation records actor/time and an actor/school-scoped idempotency key. Duplicate
concurrent requests return one exception; changed payload reuse is rejected.
`revoke_device_schedule_allow` appends one immutable revoke record with server
actor/time/reason. Matching actor/reason retries return the original result;
conflicting or unauthorized revocations are rejected. Editing is revoke + recreate.

`resolveScheduleWithAllows` computes the effective segments from the unchanged
G1-B base result. Applicable allow intervals form a union; one revoked overlap
cannot cancel another active allow. Revoke clips only at its recorded timestamp,
so its earlier allowed interval remains historically allowed. Explicit `as_of`
supports replay before a later creation/revocation becomes known. Retrospective
creation snapshots and malformed/cross-school exceptions fail closed.

Student ownership and residence applicability come only from supplied event-time
assignment evidence. Unknown G1-B assignment gaps remain UNCONFIGURED; today's
mutable device/student rows are not used to fill them. New ownership metadata is
excluded from the G1-B base input, so adding or correcting it does not rename the
original `restricted_window_id`. Base windows, starts/ends and provenance remain
unchanged even when effective segments split. Per-segment exception IDs provide
the allow provenance. Consumers must preserve complete trusted input snapshots
for frozen evaluations; no detection/evaluation persistence subsystem is added.

The authoring UI previews base scope policy; the separate pure allow resolver API
accepts a trusted subject/as-of snapshot. It does not invent missing assignment
history or introduce a subject-history storage system.

## F. Authorization

| Role | Schedule publish/cancel | Exception create/revoke/search |
| --- | --- | --- |
| super_admin | Existing G1-A active-school scope | Same-school validated targets |
| school_admin | Own active school, school/residence scopes | Own school targets |
| dorm_supervisor | Existing G1-A same-school residence-only policy scope | Only currently authorized, active, time-valid residence assignments and their current students/devices |
| dorm_staff, viewer, student, parent | Denied | Denied |

The G1-A schedule manager matrix is deliberately reused without changing its
definition. Exception residence restrictions are checked separately against
`dorm_staff_assignments`; a school role alone does not grant exception authority.
Device/student ownership rows are locked during exception authorization to avoid
an ownership transfer race. This is a read lock, not a custody write.

Server actions get the school from the authenticated session, never a submitted
school/actor field. SQL rechecks active user/school/membership and target ownership.
Exception tables have RLS, no direct API privileges, and immutable UPDATE/DELETE
triggers. New definer RPCs are owned by postgres, use empty fixed search_path and
schema-qualified references, revoke PUBLIC/anon/service_role execution, and grant
only their authenticated public entry points. The private helper is not callable
by API roles. Existing read-only schedule access for staff/viewers is unchanged.

## G. Validation

| Check | Result |
| --- | --- |
| Focused G1-C authoring + real server-action tests | PASS — 17 tests, 0 failed/skipped |
| Existing foundation / management / G1-A / G1-B tests | PASS — all 64 existing schedule tests retained |
| `node --experimental-strip-types --test tests/*.test.ts` | PASS — 197 tests, 0 failed/skipped |
| `npm.cmd run typecheck -- --incremental false` | PASS |
| `npm.cmd run lint -- --no-cache` | PASS — no warnings/errors |
| `npm.cmd run build` | PASS — optimized build and all 26 static pages |
| `git diff --check` | PASS |
| `node --experimental-strip-types tests/device-schedule-write-boundary-db.mjs --with-g1b --with-g1c` | PASS — clean replay of 19 migrations; G1-A concurrency A–F; G1-B persisted replay/DST; G1-C runtime groups |
| Synthetic browser component QA | PASS — school/residence, preview, conflict/draft preservation, successor/replacement/cancel, exception create/revoke |
| Browser console / desktop horizontal overflow | PASS — errors `[]`, overflow `false` |

Build commands explicitly overrode `NEXT_PUBLIC_SUPABASE_URL` with loopback port 9
and the anon key with a synthetic build-only value. `.env.local` was not changed.
No Production request or database query was needed.

Browser evidence uses the real TSX and real pure preview core with an explicitly
synthetic in-memory action transport on loopback port 4175. It is component/browser
QA, not real Next.js login/session-to-PostgREST end-to-end QA. Real server actions
were separately executed with injected session/transport, and real PostgreSQL
RPCs were separately validated in the disposable runtime. This distinction must
remain in independent review and must not be presented as Production QA.

Local screenshots outside the Git worktree are `g1c-preview.png` and `g1c-final.png`
under the task visualization directory. Both were visually inspected. The browser
session and synthetic server were shut down after validation.

During validation, the SQL test reader initially mishandled a denied SQL NULL;
the test parser was corrected and the complete runtime rerun passed. An initial
browser script used unsupported top-level await; a corrected async browser flow
passed all assertions. The window-ID ownership metadata issue found in self-review
was fixed and covered by an exact G1-B result comparison before the final suite.
The existing Node typeless-package warning remains; it is not a test failure.

## H. DB / migration changes

One new forward migration, generated with `supabase migration new`:
`20260912222326_g1c_schedule_authoring_and_allow_exceptions.sql`.

It adds two protected tables, one private authorization helper and four public
RPCs (snapshot, target search, create allow, revoke allow). No existing migration
is edited, and no G1-A RPC or custody routine is replaced. Clean PostgreSQL 17
replay, valid and denied runtime paths, duplicate/concurrent operations, audit
immutability and function ownership/search_path/ACL checks passed.

The migration is **not applied to Production**. The disposable harness removes
only its own named test container. A future deployment/application is a separate
authorized task; this report does not approve one.

## I. Custody isolation

No custody application source or existing custody migration changed. New SQL has
no custody device/event/notice INSERT/UPDATE/DELETE and grants no custody mutation
authority. Device/student lookup and locking only establish exception scope.
Full existing custody regression passed. Disposable runtime compared complete
device/event/notice row snapshots before and after G1-C and found them identical;
the existing G1-A fixture remains `checked_out|0` events. No incident table is added.

## J. Final git status --short

```text
 M app/app/settings/schedules/page.tsx
 M tests/device-schedule-write-boundary-db.mjs
?? app/app/settings/schedules/schedule-authoring.tsx
?? docs/device-manager/g1c-work-log.md
?? lib/schedules/actions.ts
?? lib/schedules/authoring-types.ts
?? lib/schedules/authoring.ts
?? lib/schedules/exceptions.ts
?? supabase/migrations/20260912222326_g1c_schedule_authoring_and_allow_exceptions.sql
?? tests/device-schedule-authoring-actions.test.ts
?? tests/device-schedule-authoring-browser.mjs
?? tests/device-schedule-authoring-db.mjs
?? tests/device-schedule-authoring.test.ts
```

## K. git diff --stat

```text
 app/app/settings/schedules/page.tsx         | 4 +++-
 tests/device-schedule-write-boundary-db.mjs | 9 +++++++--
 2 files changed, 10 insertions(+), 3 deletions(-)
```

Git's normal diff stat excludes the 11 untracked files; B and J list the complete
review scope. Nothing was staged merely to include those files in the stat.
Final branch/HEAD remain the preflight baseline, and staging is empty.

## L. Production touched?

**NO.** No Production browser, DB access, policy creation, deployment or live-data
operation. The baseline's first controlled real Production policy/rendering QA
remains deferred to an explicitly authorized later task. No closed gate evidence
is retroactively changed.

## M. Commit / push?

**NO / NO.** No commit, push or deployment. No Network, Detection, Shadow, AI,
parent-portal, offline mutation, handoff/onboarding or unrelated refactor work.

Final verdict: **G1-C — READY FOR INDEPENDENT REVIEW**.
