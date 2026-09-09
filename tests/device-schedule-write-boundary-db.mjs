import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const migrationsDirectory = join(root, "supabase", "migrations");
const container = `boarding-device-manager-g1a-${process.pid}`;
const password = "g1a-disposable-only";

const ids = {
  school1: "10000000-0000-0000-0000-000000000001",
  school2: "10000000-0000-0000-0000-000000000002",
  invalidTimezoneSchool: "10000000-0000-0000-0000-000000000003",
  replaySchool: "10000000-0000-0000-0000-000000000004",
  dorm1: "20000000-0000-0000-0000-000000000001",
  dorm2: "20000000-0000-0000-0000-000000000002",
  dorm3: "20000000-0000-0000-0000-000000000003",
  dorm4: "20000000-0000-0000-0000-000000000004",
  dorm5: "20000000-0000-0000-0000-000000000005",
  dorm6: "20000000-0000-0000-0000-000000000006",
  dorm7: "20000000-0000-0000-0000-000000000007",
  inactiveDorm: "20000000-0000-0000-0000-000000000008",
  superAdmin: "30000000-0000-0000-0000-000000000001",
  schoolAdmin: "30000000-0000-0000-0000-000000000002",
  supervisor: "30000000-0000-0000-0000-000000000003",
  staff: "30000000-0000-0000-0000-000000000004",
  viewer: "30000000-0000-0000-0000-000000000005",
  parent: "30000000-0000-0000-0000-000000000006",
  studentUser: "30000000-0000-0000-0000-000000000007",
  otherSchoolAdmin: "30000000-0000-0000-0000-000000000008",
  inactiveUser: "30000000-0000-0000-0000-000000000009",
  inactiveMembership: "30000000-0000-0000-0000-000000000010",
  student: "40000000-0000-0000-0000-000000000001",
  custodyDevice: "50000000-0000-0000-0000-000000000001"
};

const validEvents = [
  { weekday: 0, local_time: "07:00", event_type: "release" },
  { weekday: 0, local_time: "21:00", event_type: "return" }
];

function docker(args, options = {}) {
  const result = spawnSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    ...options
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(
      `docker ${args.join(" ")} failed (${result.status})\n${result.stdout}\n${result.stderr}`
    );
  }
  return result;
}

function psql(sql, { allowFailure = false } = {}) {
  const result = docker(
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres"
    ],
    { input: sql, allowFailure }
  );
  return result;
}

function psqlAsync(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-X",
        "-qAt",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        "postgres"
      ],
      { cwd: root }
    );
    let stdout = "";
    let stderr = "";
    const startedAt = Date.now();
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const result = { code, stdout, stderr, durationMs: Date.now() - startedAt };
      if (code === 0) resolve(result);
      else reject(new Error(`concurrent psql failed (${code})\n${stdout}\n${stderr}`));
    });
    child.stdin.end(sql);
  });
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function nullableUuid(value) {
  return value ? `${sqlText(value)}::uuid` : "null::uuid";
}

function actorSql(actorId, statement, role = "authenticated") {
  return `
begin;
set local role ${role};
set local request.jwt.claim.sub = ${sqlText(actorId)};
${statement}
commit;
`;
}

function publishStatement({
  actor,
  school = ids.school1,
  dorm = null,
  revision = 0,
  key,
  predecessor = null,
  replaces = null,
  name = "Published schedule",
  from = "current_date + 30",
  to = null,
  events = validEvents
}) {
  const call = `public.publish_device_schedule(
    ${sqlText(school)}::uuid,
    ${nullableUuid(dorm)},
    ${revision}::bigint,
    ${sqlText(key)}::uuid,
    ${nullableUuid(predecessor)},
    ${nullableUuid(replaces)},
    ${sqlText(name)},
    (${from})::date,
    ${to ? `(${to})::date` : "null::date"},
    ${sqlText(JSON.stringify(events))}::jsonb
  )`;
  return actorSql(
    actor,
    `select outcome || '|' || coalesce(publication_id::text, '') || '|' ||
      coalesce(policy_id::text, '') || '|' || coalesce(scope_revision::text, '') || '|' ||
      idempotent_replay::text
    from ${call};`
  );
}

function cancelStatement({ actor, school = ids.school1, dorm = null, revision, key, publication }) {
  return actorSql(
    actor,
    `select outcome || '|' || coalesce(publication_id::text, '') || '|' ||
      coalesce(policy_id::text, '') || '|' || coalesce(scope_revision::text, '') || '|' ||
      idempotent_replay::text
    from public.cancel_future_device_schedule_publication(
      ${sqlText(school)}::uuid,
      ${nullableUuid(dorm)},
      ${revision}::bigint,
      ${sqlText(key)}::uuid,
      ${sqlText(publication)}::uuid
    );`
  );
}

function resultRow(stdout) {
  const line = stdout
    .trim()
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter((value) => value.includes("|"))
    .at(-1);
  assert.ok(line, `expected a pipe-delimited RPC result in:\n${stdout}`);
  const [outcome, publicationId, policyId, revision, replay] = line.split("|");
  return {
    outcome,
    publicationId,
    policyId,
    revision: revision === "" ? null : Number(revision),
    replay: replay === "t" || replay === "true"
  };
}

function runPublish(options) {
  return resultRow(psql(publishStatement(options)).stdout);
}

function snapshot() {
  const row = psql(`
select
  (select count(*) from public.device_schedule_policies) || '|' ||
  (select count(*) from public.device_schedule_weekly_events) || '|' ||
  (select count(*) from public.device_schedule_publications) || '|' ||
  (select count(*) from public.device_schedule_publication_ledger) || '|' ||
  (select count(*) from public.device_schedule_publication_idempotency) || '|' ||
  (select coalesce(sum(revision), 0) from public.device_schedule_scope_revisions) || '|' ||
  (select status::text from public.device_custody_devices where id = ${sqlText(ids.custodyDevice)}::uuid) || '|' ||
  (select count(*) from public.device_custody_events where device_id = ${sqlText(ids.custodyDevice)}::uuid);
`).stdout.trim();
  return row;
}

function expectStatementFailure(sql, pattern) {
  const result = psql(sql, { allowFailure: true });
  assert.notEqual(result.status, 0, `statement unexpectedly succeeded:\n${sql}`);
  assert.match(`${result.stdout}\n${result.stderr}`, pattern);
}

function pass(name) {
  process.stdout.write(`PASS ${name}\n`);
}

async function waitForPostgres() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = docker(["exec", container, "pg_isready", "-U", "postgres"], {
      allowFailure: true
    });
    if (result.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("disposable PostgreSQL did not become ready");
}

async function main() {
  docker([
    "run",
    "--rm",
    "-d",
    "--name",
    container,
    "-e",
    `POSTGRES_PASSWORD=${password}`,
    "postgres:17"
  ]);

  try {
    await waitForPostgres();
    psql(`
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key,
  email text
);
create or replace function auth.uid()
returns uuid language sql stable set search_path = ''
as $$ select nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role()
returns text language sql stable set search_path = ''
as $$ select nullif(pg_catalog.current_setting('request.jwt.claim.role', true), '') $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;
`);

    const migrations = readdirSync(migrationsDirectory)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const migration of migrations) {
      psql(readFileSync(join(migrationsDirectory, migration), "utf8"));
    }
    assert.ok(
      migrations.at(-1)?.endsWith("_g1a_schedule_write_boundary.sql"),
      "G1-A must be the latest forward migration"
    );
    pass(`clean migration replay (${migrations.length} migrations)`);

    const authUsers = Object.entries(ids)
      .filter(([name]) => [
        "superAdmin",
        "schoolAdmin",
        "supervisor",
        "staff",
        "viewer",
        "parent",
        "studentUser",
        "otherSchoolAdmin",
        "inactiveUser",
        "inactiveMembership"
      ].includes(name))
      .map(([name, id]) => `(${sqlText(id)}::uuid, ${sqlText(`${name}@example.test`)})`)
      .join(",\n");

    psql(`
insert into auth.users (id, email) values ${authUsers};
insert into public.schools (id, name, slug, timezone, is_active) values
  (${sqlText(ids.school1)}::uuid, 'School One', 'school-one', 'America/New_York', true),
  (${sqlText(ids.school2)}::uuid, 'School Two', 'school-two', 'America/Chicago', true),
  (${sqlText(ids.invalidTimezoneSchool)}::uuid, 'Invalid Timezone', 'invalid-timezone', 'Not/A_Zone', true),
  (${sqlText(ids.replaySchool)}::uuid, 'Replay School', 'replay-school', 'Pacific/Honolulu', true);
insert into public.dorms (id, school_id, name, code, is_active) values
  (${sqlText(ids.dorm1)}::uuid, ${sqlText(ids.school1)}::uuid, 'Dorm 1', 'D1', true),
  (${sqlText(ids.dorm2)}::uuid, ${sqlText(ids.school1)}::uuid, 'Dorm 2', 'D2', true),
  (${sqlText(ids.dorm3)}::uuid, ${sqlText(ids.school1)}::uuid, 'Dorm 3', 'D3', true),
  (${sqlText(ids.dorm4)}::uuid, ${sqlText(ids.school1)}::uuid, 'Dorm 4', 'D4', true),
  (${sqlText(ids.dorm5)}::uuid, ${sqlText(ids.school1)}::uuid, 'Dorm 5', 'D5', true),
  (${sqlText(ids.dorm7)}::uuid, ${sqlText(ids.school1)}::uuid, 'Dorm 7', 'D7', true),
  (${sqlText(ids.inactiveDorm)}::uuid, ${sqlText(ids.school1)}::uuid, 'Inactive Dorm', 'DX', false),
  (${sqlText(ids.dorm6)}::uuid, ${sqlText(ids.school2)}::uuid, 'Dorm 6', 'D6', true);
insert into public.app_users (id, email, full_name, global_role, is_active) values
  (${sqlText(ids.superAdmin)}::uuid, 'superAdmin@example.test', 'Super Admin', 'super_admin', true),
  (${sqlText(ids.schoolAdmin)}::uuid, 'schoolAdmin@example.test', 'School Admin', 'user', true),
  (${sqlText(ids.supervisor)}::uuid, 'supervisor@example.test', 'Supervisor', 'user', true),
  (${sqlText(ids.staff)}::uuid, 'staff@example.test', 'Staff', 'user', true),
  (${sqlText(ids.viewer)}::uuid, 'viewer@example.test', 'Viewer', 'user', true),
  (${sqlText(ids.parent)}::uuid, 'parent@example.test', 'Parent', 'user', true),
  (${sqlText(ids.studentUser)}::uuid, 'studentUser@example.test', 'Student', 'user', true),
  (${sqlText(ids.otherSchoolAdmin)}::uuid, 'otherSchoolAdmin@example.test', 'Other Admin', 'user', true),
  (${sqlText(ids.inactiveUser)}::uuid, 'inactiveUser@example.test', 'Inactive User', 'user', false),
  (${sqlText(ids.inactiveMembership)}::uuid, 'inactiveMembership@example.test', 'Inactive Membership', 'user', true);
insert into public.app_user_school_roles (school_id, user_id, role, is_active) values
  (${sqlText(ids.school1)}::uuid, ${sqlText(ids.schoolAdmin)}::uuid, 'school_admin', true),
  (${sqlText(ids.school1)}::uuid, ${sqlText(ids.supervisor)}::uuid, 'dorm_supervisor', true),
  (${sqlText(ids.school1)}::uuid, ${sqlText(ids.staff)}::uuid, 'dorm_staff', true),
  (${sqlText(ids.school1)}::uuid, ${sqlText(ids.viewer)}::uuid, 'viewer', true),
  (${sqlText(ids.school1)}::uuid, ${sqlText(ids.parent)}::uuid, 'parent', true),
  (${sqlText(ids.school2)}::uuid, ${sqlText(ids.otherSchoolAdmin)}::uuid, 'school_admin', true),
  (${sqlText(ids.school1)}::uuid, ${sqlText(ids.inactiveUser)}::uuid, 'school_admin', true),
  (${sqlText(ids.school1)}::uuid, ${sqlText(ids.inactiveMembership)}::uuid, 'school_admin', false);
insert into public.students (id, school_id, dorm_id, student_number, first_name, last_name)
values (${sqlText(ids.student)}::uuid, ${sqlText(ids.school1)}::uuid, ${sqlText(ids.dorm1)}::uuid, 'S-1', 'Test', 'Student');
insert into public.device_custody_devices (
  id, school_id, student_id, device_type, manufacturer, model, color, status,
  created_by_user_id, updated_by_user_id
) values (
  ${sqlText(ids.custodyDevice)}::uuid, ${sqlText(ids.school1)}::uuid,
  ${sqlText(ids.student)}::uuid, 'phone', 'Test', 'Fixture', 'Black', 'checked_out',
  ${sqlText(ids.schoolAdmin)}::uuid, ${sqlText(ids.schoolAdmin)}::uuid
);
`);
    const custodyBefore = snapshot().split("|").slice(-2).join("|");

    const concurrentA = await Promise.all([
      psqlAsync(publishStatement({
        actor: ids.schoolAdmin,
        dorm: ids.dorm1,
        key: "60000000-0000-0000-0000-000000000001",
        name: "Concurrent A1"
      })),
      psqlAsync(publishStatement({
        actor: ids.schoolAdmin,
        dorm: ids.dorm1,
        key: "60000000-0000-0000-0000-000000000002",
        name: "Concurrent A2"
      }))
    ]);
    const aRows = concurrentA.map((result) => resultRow(result.stdout));
    assert.deepEqual(aRows.map((row) => row.outcome).sort(), ["published", "stale_revision"]);
    const firstPublication = aRows.find((row) => row.outcome === "published").publicationId;
    assert.equal(
      psql(`select count(*) from public.device_schedule_publications where scope_id = ${sqlText(ids.dorm1)}::uuid;`).stdout.trim(),
      "1"
    );
    pass("concurrency A: competing publications on an empty scope serialize");

    const concurrentB = await Promise.all([
      psqlAsync(publishStatement({
        actor: ids.schoolAdmin,
        dorm: ids.dorm1,
        revision: 1,
        key: "60000000-0000-0000-0000-000000000003",
        replaces: firstPublication,
        name: "Replacement B1",
        from: "current_date + 30"
      })),
      psqlAsync(publishStatement({
        actor: ids.schoolAdmin,
        dorm: ids.dorm1,
        revision: 1,
        key: "60000000-0000-0000-0000-000000000004",
        replaces: firstPublication,
        name: "Replacement B2",
        from: "current_date + 30"
      }))
    ]);
    const bRows = concurrentB.map((result) => resultRow(result.stdout));
    assert.deepEqual(bRows.map((row) => row.outcome).sort(), ["published", "stale_revision"]);
    assert.equal(
      psql(`select count(*) from public.device_schedule_publication_ledger where scope_id = ${sqlText(ids.dorm1)}::uuid and operation = 'replace';`).stdout.trim(),
      "1"
    );
    pass("concurrency B: competing replacements cannot replace one revision twice");

    const samePayload = {
      actor: ids.schoolAdmin,
      dorm: ids.dorm2,
      key: "60000000-0000-0000-0000-000000000005",
      name: "Idempotent C"
    };
    const concurrentC = await Promise.all([
      psqlAsync(publishStatement(samePayload)),
      psqlAsync(publishStatement(samePayload))
    ]);
    const cRows = concurrentC.map((result) => resultRow(result.stdout));
    assert.deepEqual(cRows.map((row) => row.outcome), ["published", "published"]);
    assert.equal(new Set(cRows.map((row) => row.publicationId)).size, 1);
    assert.deepEqual(cRows.map((row) => row.replay).sort(), [false, true]);
    assert.equal(
      psql(`select count(*) from public.device_schedule_publications where scope_id = ${sqlText(ids.dorm2)}::uuid;`).stdout.trim(),
      "1"
    );
    pass("concurrency C: duplicate idempotent requests create one logical publication");

    const sharedKey = "60000000-0000-0000-0000-000000000006";
    const concurrentD = await Promise.all([
      psqlAsync(publishStatement({ actor: ids.schoolAdmin, dorm: ids.dorm3, key: sharedKey, name: "Payload D1" })),
      psqlAsync(publishStatement({ actor: ids.schoolAdmin, dorm: ids.dorm3, key: sharedKey, name: "Payload D2" }))
    ]);
    const dRows = concurrentD.map((result) => resultRow(result.stdout));
    assert.deepEqual(dRows.map((row) => row.outcome).sort(), ["idempotency_conflict", "published"]);
    assert.equal(
      psql(`select count(*) from public.device_schedule_publications where scope_id = ${sqlText(ids.dorm3)}::uuid;`).stdout.trim(),
      "1"
    );
    pass("concurrency D: one idempotency key rejects a different concurrent payload");

    const blocker = psqlAsync(`
begin;
select pg_catalog.pg_advisory_xact_lock(private.device_schedule_scope_lock_key(
  ${sqlText(ids.school1)}::uuid, ${sqlText(ids.dorm4)}::uuid
));
select pg_catalog.pg_sleep(3);
commit;
`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const blockedScope = psqlAsync(publishStatement({
      actor: ids.superAdmin,
      dorm: ids.dorm4,
      key: "60000000-0000-0000-0000-000000000007",
      name: "Blocked Scope E"
    }));
    const independentScope = await psqlAsync(publishStatement({
      actor: ids.superAdmin,
      school: ids.school2,
      key: "60000000-0000-0000-0000-000000000008",
      name: "Independent Scope E"
    }));
    assert.equal(resultRow(independentScope.stdout).outcome, "published");
    assert.ok(independentScope.durationMs < 2000, `independent scope took ${independentScope.durationMs}ms`);
    const blockedResult = await blockedScope;
    await blocker;
    assert.equal(resultRow(blockedResult.stdout).outcome, "published");
    assert.ok(blockedResult.durationMs >= 2000, `same-scope request only waited ${blockedResult.durationMs}ms`);
    pass("concurrency E: independent scopes do not share a global lock");

    const concurrentF = await Promise.all([
      psqlAsync(publishStatement({
        actor: ids.schoolAdmin,
        dorm: ids.dorm5,
        key: "60000000-0000-0000-0000-000000000009",
        name: "Overlap F1",
        from: "current_date + 50"
      })),
      psqlAsync(publishStatement({
        actor: ids.schoolAdmin,
        dorm: ids.dorm5,
        key: "60000000-0000-0000-0000-000000000010",
        name: "Overlap F2",
        from: "current_date + 50"
      }))
    ]);
    const fRows = concurrentF.map((result) => resultRow(result.stdout));
    assert.deepEqual(fRows.map((row) => row.outcome).sort(), ["published", "stale_revision"]);
    assert.equal(
      psql(`select count(*) from public.device_schedule_publications where scope_id = ${sqlText(ids.dorm5)}::uuid;`).stdout.trim(),
      "1"
    );
    pass("concurrency F: an overlap race cannot bypass scope revision protection");

    const roleSnapshot = snapshot();
    for (const [actor, dorm, label] of [
      [ids.supervisor, null, "dorm_supervisor school-wide"],
      [ids.staff, ids.dorm7, "dorm_staff"],
      [ids.viewer, ids.dorm7, "viewer"],
      [ids.parent, ids.dorm7, "parent"],
      [ids.studentUser, ids.dorm7, "student"],
      [ids.otherSchoolAdmin, ids.dorm7, "cross-school school_admin"],
      [ids.inactiveUser, ids.dorm7, "inactive app user"],
      [ids.inactiveMembership, ids.dorm7, "inactive membership"]
    ]) {
      const denied = runPublish({
        actor,
        dorm,
        key: crypto.randomUUID(),
        name: `Denied ${label}`
      });
      assert.equal(denied.outcome, "not_authorized", label);
      assert.equal(snapshot(), roleSnapshot, `${label} changed state`);
    }
    const supervisorAllowed = runPublish({
      actor: ids.supervisor,
      dorm: ids.dorm7,
      key: "60000000-0000-0000-0000-000000000011",
      name: "Supervisor Residence"
    });
    assert.equal(supervisorAllowed.outcome, "published");
    const superAdminAllowed = runPublish({
      actor: ids.superAdmin,
      school: ids.school2,
      dorm: ids.dorm6,
      key: "60000000-0000-0000-0000-000000000012",
      name: "Super Admin Residence"
    });
    assert.equal(superAdminAllowed.outcome, "published");
    const invalidResidence = runPublish({
      actor: ids.schoolAdmin,
      dorm: ids.inactiveDorm,
      key: "60000000-0000-0000-0000-000000000013",
      name: "Inactive Residence"
    });
    assert.equal(invalidResidence.outcome, "not_authorized");
    pass("authorization matrix and cross-tenant/residence checks");

    const delayedPublishRequest = {
      actor: ids.superAdmin,
      school: ids.replaySchool,
      revision: 0,
      key: "60000000-0000-0000-0000-000000000027",
      name: "Delayed replay",
      from: "(now() at time zone 'Pacific/Honolulu')::date + 1"
    };
    const delayedPublish = runPublish(delayedPublishRequest);
    assert.equal(delayedPublish.outcome, "published");
    assert.equal(delayedPublish.replay, false);
    assert.equal(
      psql(`select timezone_snapshot from public.device_schedule_publications where id = ${sqlText(delayedPublish.publicationId)}::uuid;`).stdout.trim(),
      "Pacific/Honolulu"
    );
    psql(`update public.schools set timezone = 'Pacific/Kiritimati' where id = ${sqlText(ids.replaySchool)}::uuid;`);
    assert.equal(
      psql(`select ((now() at time zone 'Pacific/Honolulu')::date + 1) <= (now() at time zone 'Pacific/Kiritimati')::date;`).stdout.trim(),
      "t",
      "fixture must make a new publication fail the current local-date rule"
    );
    const delayedReplayBefore = snapshot();
    const delayedReplay = runPublish(delayedPublishRequest);
    assert.equal(delayedReplay.outcome, "published");
    assert.equal(delayedReplay.publicationId, delayedPublish.publicationId);
    assert.equal(delayedReplay.policyId, delayedPublish.policyId);
    assert.equal(delayedReplay.revision, delayedPublish.revision);
    assert.equal(delayedReplay.replay, true);
    assert.equal(snapshot(), delayedReplayBefore);
    assert.equal(
      psql(`select timezone_snapshot || '|' || count(*) over () from public.device_schedule_publications where school_id = ${sqlText(ids.replaySchool)}::uuid;`).stdout.trim(),
      "Pacific/Honolulu|1"
    );
    const changedPublishRevision = runPublish({
      ...delayedPublishRequest,
      revision: 1
    });
    assert.equal(changedPublishRevision.outcome, "idempotency_conflict");
    assert.equal(snapshot(), delayedReplayBefore);
    pass("delayed/timezone-changed publish replay and expected-revision request identity");

    const beforeFailures = snapshot();
    expectStatementFailure(
      publishStatement({
        actor: ids.schoolAdmin,
        dorm: null,
        key: "60000000-0000-0000-0000-000000000014",
        name: ""
      }),
      /schedule_publish_invalid_metadata/
    );
    assert.equal(snapshot(), beforeFailures);
    expectStatementFailure(
      publishStatement({
        actor: ids.schoolAdmin,
        dorm: null,
        key: "60000000-0000-0000-0000-000000000015",
        events: []
      }),
      /schedule_publish_invalid_events/
    );
    assert.equal(snapshot(), beforeFailures);
    expectStatementFailure(
      publishStatement({
        actor: ids.superAdmin,
        school: ids.invalidTimezoneSchool,
        key: "60000000-0000-0000-0000-000000000016"
      }),
      /schedule_publish_invalid_timezone/
    );
    assert.equal(snapshot(), beforeFailures);
    expectStatementFailure(
      publishStatement({
        actor: ids.schoolAdmin,
        dorm: null,
        key: "60000000-0000-0000-0000-000000000017",
        from: "(now() at time zone 'America/New_York')::date"
      }),
      /schedule_publish_effective_date_not_future/
    );
    assert.equal(snapshot(), beforeFailures);
    for (const [key, events, pattern] of [
      ["60000000-0000-0000-0000-000000000018", [
        { weekday: 7, local_time: "07:00", event_type: "release" },
        { weekday: 0, local_time: "21:00", event_type: "return" }
      ], /schedule_publish_invalid_events/],
      ["60000000-0000-0000-0000-000000000019", [
        { weekday: 0, local_time: "25:00", event_type: "release" },
        { weekday: 0, local_time: "21:00", event_type: "return" }
      ], /schedule_publish_invalid_events/],
      ["60000000-0000-0000-0000-000000000020", [
        { weekday: 0, local_time: "07:00", event_type: "release" },
        { weekday: 0, local_time: "07:00", event_type: "return" }
      ], /schedule_publish_duplicate_local_instant/],
      ["60000000-0000-0000-0000-000000000021", [
        { weekday: 0, local_time: "07:00", event_type: "release" },
        { weekday: 0, local_time: "08:00", event_type: "release" },
        { weekday: 0, local_time: "21:00", event_type: "return" },
        { weekday: 1, local_time: "07:00", event_type: "return" }
      ], /schedule_publish_non_alternating_event_ring/],
      ["60000000-0000-0000-0000-000000000022", [
        { weekday: 0, local_time: "07:00", event_type: "release" }
      ], /schedule_publish_incomplete_event_ring/]
    ]) {
      expectStatementFailure(
        publishStatement({ actor: ids.schoolAdmin, key, events }),
        pattern
      );
      assert.equal(snapshot(), beforeFailures);
    }
    pass("invalid metadata, timezone, dates, and event rings roll back atomically");

    const overlapBefore = snapshot();
    const overlap = runPublish({
      actor: ids.schoolAdmin,
      dorm: ids.dorm2,
      revision: 1,
      key: "60000000-0000-0000-0000-000000000023",
      name: "Unresolved overlap"
    });
    assert.equal(overlap.outcome, "overlap_conflict");
    assert.equal(snapshot(), overlapBefore);
    const stale = runPublish({
      actor: ids.schoolAdmin,
      dorm: ids.dorm2,
      revision: 0,
      key: "60000000-0000-0000-0000-000000000024",
      predecessor: cRows[0].publicationId,
      name: "Stale"
    });
    assert.equal(stale.outcome, "stale_revision");
    assert.equal(snapshot(), overlapBefore);
    const idemConflict = runPublish({ ...samePayload, name: "Changed idempotent payload" });
    assert.equal(idemConflict.outcome, "idempotency_conflict");
    assert.equal(snapshot(), overlapBefore);
    pass("overlap, stale revision, and idempotency conflicts make no state change");

    const cancellationTarget = runPublish({
      actor: ids.schoolAdmin,
      key: "60000000-0000-0000-0000-000000000025",
      name: "School-wide cancellation target"
    });
    assert.equal(cancellationTarget.outcome, "published");
    const cancelled = resultRow(psql(cancelStatement({
      actor: ids.schoolAdmin,
      revision: 1,
      key: "60000000-0000-0000-0000-000000000026",
      publication: cancellationTarget.publicationId
    })).stdout);
    assert.equal(cancelled.outcome, "cancelled");
    const cancelReplay = resultRow(psql(cancelStatement({
      actor: ids.schoolAdmin,
      revision: 1,
      key: "60000000-0000-0000-0000-000000000026",
      publication: cancellationTarget.publicationId
    })).stdout);
    assert.equal(cancelReplay.outcome, "cancelled");
    assert.equal(cancelReplay.replay, true);
    assert.equal(cancelReplay.publicationId, cancellationTarget.publicationId);
    const cancelMismatchBefore = snapshot();
    const cancelRevisionMismatch = resultRow(psql(cancelStatement({
      actor: ids.schoolAdmin,
      revision: 2,
      key: "60000000-0000-0000-0000-000000000026",
      publication: cancellationTarget.publicationId
    })).stdout);
    assert.equal(cancelRevisionMismatch.outcome, "idempotency_conflict");
    assert.equal(snapshot(), cancelMismatchBefore);
    pass("future cancellation is append-only and idempotent");

    const readable = psql(actorSql(
      ids.schoolAdmin,
      "select count(*) from public.device_schedule_policies;"
    )).stdout.trim().split(/\r?\n/).at(-1);
    assert.ok(Number(readable) > 0);
    for (const operation of [
      `insert into public.device_schedule_policies (
        school_id, name, effective_from, created_by_user_id, updated_by_user_id
      ) values (
        ${sqlText(ids.school1)}::uuid, 'Direct insert', current_date + 30,
        ${sqlText(ids.schoolAdmin)}::uuid, ${sqlText(ids.schoolAdmin)}::uuid
      );`,
      "update public.device_schedule_policies set name = name;",
      "delete from public.device_schedule_policies;"
    ]) {
      expectStatementFailure(actorSql(ids.schoolAdmin, operation), /permission denied|row-level security/i);
    }
    expectStatementFailure(
      actorSql(ids.superAdmin, `insert into public.device_schedule_policies (
        school_id, name, effective_from, created_by_user_id, updated_by_user_id
      ) values (
        ${sqlText(ids.school1)}::uuid, 'Service insert', current_date + 30,
        ${sqlText(ids.superAdmin)}::uuid, ${sqlText(ids.superAdmin)}::uuid
      );`, "service_role"),
      /permission denied/i
    );
    expectStatementFailure(
      actorSql(ids.schoolAdmin, "select * from public.device_schedule_publications;"),
      /permission denied/i
    );
    expectStatementFailure(
      actorSql(ids.schoolAdmin, `select private.device_schedule_scope_lock_key(${sqlText(ids.school1)}::uuid, null);`),
      /permission denied/i
    );
    expectStatementFailure(
      "set role anon; select * from public.publish_device_schedule(null,null,null,null,null,null,null,null,null,null);",
      /permission denied/i
    );
    expectStatementFailure(
      "set role service_role; select * from public.publish_device_schedule(null,null,null,null,null,null,null,null,null,null);",
      /permission denied/i
    );
    const privilegeMatrix = psql(`
select
  has_function_privilege('authenticated', 'public.publish_device_schedule(uuid,uuid,bigint,uuid,uuid,uuid,text,date,date,jsonb)', 'EXECUTE') || '|' ||
  has_function_privilege('anon', 'public.publish_device_schedule(uuid,uuid,bigint,uuid,uuid,uuid,text,date,date,jsonb)', 'EXECUTE') || '|' ||
  has_function_privilege('service_role', 'public.publish_device_schedule(uuid,uuid,bigint,uuid,uuid,uuid,text,date,date,jsonb)', 'EXECUTE') || '|' ||
  has_function_privilege('public', 'public.publish_device_schedule(uuid,uuid,bigint,uuid,uuid,uuid,text,date,date,jsonb)', 'EXECUTE');
`).stdout.trim();
    assert.equal(privilegeMatrix, "true|false|false|false");
    const functionSecurity = psql(`
select p.prosecdef || '|' || r.rolname || '|' || coalesce(array_to_string(p.proconfig, ','), '')
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
join pg_catalog.pg_roles r on r.oid = p.proowner
where n.nspname = 'public' and p.proname = 'publish_device_schedule';
`).stdout.trim();
    assert.match(functionSecurity, /^true\|postgres\|search_path=""$/);
    pass("read preservation, direct DML revocation, RPC ACL, owner, and search_path");

    for (const statement of [
      "update public.device_schedule_policies set name = name;",
      "delete from public.device_schedule_weekly_events;",
      "update public.device_schedule_publications set timezone_snapshot = timezone_snapshot;",
      "delete from public.device_schedule_publication_ledger;",
      "update public.device_schedule_publication_idempotency set payload_digest = payload_digest;"
    ]) {
      expectStatementFailure(statement, /published_device_schedule_is_immutable/);
    }
    pass("published snapshots, ledger, and idempotency records are immutable to owner DML");

    const custodyAfter = snapshot().split("|").slice(-2).join("|");
    assert.equal(custodyAfter, custodyBefore);
    assert.equal(custodyAfter, "checked_out|0");
    pass("custody status and custody event history are unchanged");

    process.stdout.write("G1-A disposable PostgreSQL runtime: PASS\n");
  } finally {
    assert.match(container, /^boarding-device-manager-g1a-\d+$/);
    docker(["rm", "-f", container], { allowFailure: true });
  }
}

await main();
