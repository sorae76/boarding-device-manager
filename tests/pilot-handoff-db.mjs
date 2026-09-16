import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Only the Docker-owned harness supplies SQL transport. No external connection URL.
export async function runPilotHandoffChecks({ psql, psqlAsync, actorSql, ids, pass }) {
  const q = v => v === null ? "null" : `'${String(v).replaceAll("'", "''")}'`;
  const json = sql => JSON.parse(psql(sql).stdout.trim());
  const run = (actor, sql) => psql(actorSql(actor, sql)).stdout.trim();
  const scalar = (actor, expr) => run(actor, `select ${expr};`);
  const denied = (actor, sql, pattern) => {
    const result = psql(actorSql(actor, sql), { allowFailure: true });
    assert.notEqual(result.status, 0); assert.match(result.stderr, pattern);
  };
  const preserved = () => json(`select jsonb_build_object(
    'devices', (select jsonb_agg(to_jsonb(d) order by id) from public.device_custody_devices d where school_id <> ${q(school)}),
    'events', (select jsonb_agg(to_jsonb(e) order by id) from public.device_custody_events e where school_id <> ${q(school)}),
    'policies', (select jsonb_agg(to_jsonb(p) order by id) from public.device_schedule_policies p),
    'allows', (select jsonb_agg(to_jsonb(a) order by id) from public.device_schedule_allow_exceptions a));`);
  const school = randomUUID(), dorm = randomUUID(), otherDorm = randomUUID(), studentUser = randomUUID();
  const before = preserved();
  psql(`insert into public.schools(id,name,slug,timezone) values (${q(school)},'Synthetic Handoff',${q(school)},'UTC');
    insert into public.dorms(id,school_id,name,code) values (${q(dorm)},${q(school)},'Assigned','HA'),(${q(otherDorm)},${q(school)},'Unassigned','HB');
    insert into auth.users(id,email) values (${q(studentUser)},'handoff-student@example.test');
    insert into public.app_users(id,email,full_name) values (${q(studentUser)},'handoff-student@example.test','Synthetic Student');
    insert into public.app_user_school_roles(school_id,user_id,role,is_active) values
      (${q(school)},${q(ids.schoolAdmin)},'school_admin',true),
      (${q(school)},${q(ids.superAdmin)},'school_admin',true),
      (${q(school)},${q(ids.staff)},'dorm_staff',true),
      (${q(school)},${q(ids.supervisor)},'dorm_supervisor',true),
      (${q(school)},${q(ids.viewer)},'viewer',true),
      (${q(school)},${q(ids.parent)},'parent',true),
      (${q(school)},${q(studentUser)},'student',true);
    insert into public.dorm_staff_assignments(school_id,user_id,dorm_id,starts_at,is_active)
      values (${q(school)},${q(ids.staff)},${q(dorm)},now()-interval '1 day',true);`);
  const createStudent = (residence, status = "active") => scalar(ids.schoolAdmin,
    `public.create_student_admin(${q(school)},'Synthetic','Student',${q(randomUUID())},null,${q(residence)},null,${q(status)})`);
  const student = createStudent(dorm), inactiveStudent = createStudent(dorm, "inactive"), outsideStudent = createStudent(otherDorm);
  psql(`update public.students set auth_user_id=${q(studentUser)},school_email='handoff-student@example.test' where id=${q(student)};`);
  denied(ids.staff, `select public.create_student_admin(${q(school)},'Denied','Student',null,null,${q(dorm)},null,'active');`, /STUDENT_FORBIDDEN/);
  const register = (actor, target, status = "checked_out", serial = null) => scalar(actor,
    `public.register_residence_device(${q(target)},'phone','Example','Synthetic','Black',${q(serial)},null,null,'Synthetic first capture',${q(status)})`);
  const first = register(ids.staff, student);
  const lost = register(ids.schoolAdmin, student, "lost");
  const inactive = register(ids.schoolAdmin, inactiveStudent, "inactive");
  register(ids.schoolAdmin, student, "returned");
  const outside = register(ids.schoolAdmin, outsideStudent);
  const handoffSQL = `select coalesce(jsonb_agg(id order by id),'[]'::jsonb) from public.device_custody_devices
    where school_id=${q(school)} and status in ('checked_out','lost','inactive');`;
  const handoff = actor => JSON.parse(run(actor, handoffSQL));
  const audit = () => json(`select jsonb_build_object(
    'devices',(select jsonb_agg(to_jsonb(d) order by id) from public.device_custody_devices d where school_id=${q(school)}),
    'events',(select jsonb_agg(to_jsonb(e) order by id) from public.device_custody_events e where school_id=${q(school)}));`);
  const readBefore = audit();
  assert.deepEqual(handoff(ids.staff), [first,lost,inactive].sort());
  for (const actor of [ids.schoolAdmin,ids.superAdmin]) assert.deepEqual(handoff(actor),[first,lost,inactive,outside].sort());
  for (const actor of [ids.supervisor,ids.viewer,ids.parent,ids.otherSchoolAdmin,ids.inactiveUser,ids.inactiveMembership]) assert.deepEqual(handoff(actor),[]);
  assert.deepEqual(audit(),readBefore);
  for (const change of ["is_active=false", "starts_at=now()+interval '1 day'", "ends_at=now()-interval '1 second'"]) {
    psql(`update public.dorm_staff_assignments set ${change} where school_id=${q(school)};`);
    assert.deepEqual(handoff(ids.staff),[]);
    denied(ids.staff,`select public.register_residence_device(${q(student)},'phone','Example','Denied','Black');`,/not_available/);
    psql(`update public.dorm_staff_assignments set is_active=true,starts_at=now()-interval '1 day',ends_at=null where school_id=${q(school)};`);
  }
  denied(ids.staff,`select public.register_residence_device(${q(outsideStudent)},'phone','Example','Denied','Black');`,/not_available/);
  denied(ids.otherSchoolAdmin,`select public.register_residence_device(${q(student)},'phone','Example','Denied','Black');`,/not_available/);
  pass("handoff real RLS: complete scoped states, inactive student, cross-school/residence and invalid assignment denial; reads preserve custody/audit");

  // Path A's existing admin-only table insert, after existing student creation.
  const imported = randomUUID();
  const insert = `insert into public.device_custody_devices(id,school_id,student_id,device_type,manufacturer,model,color,status,created_by_user_id,updated_by_user_id)
    values (${q(imported)},${q(school)},${q(student)},'phone','Example','CSV fixture','Black','checked_out',auth.uid(),auth.uid());`;
  denied(ids.staff,insert,/row-level security/);
  run(ids.schoolAdmin,insert);
  assert.equal(scalar(ids.schoolAdmin,`count(*) from public.device_custody_devices where id=${q(imported)} and created_by_user_id=${q(ids.schoolAdmin)}`),'1');
  pass("Path A existing student creation and admin device import boundary");

  // Path B linked student submission -> staff review; a pending request is not custody.
  const submit = serial => `public.submit_current_student_device_registration('phone','Example','Self registered','Black',${q(serial)},'Synthetic')`;
  const pathBBefore = audit();
  const request = scalar(studentUser,submit('HANDOFF-APPROVE'));
  assert.deepEqual(audit(),pathBBefore);
  denied(ids.supervisor,`select public.approve_student_device_registration_request(${q(school)},${q(request)},'Denied');`,/not_available/);
  denied(ids.otherSchoolAdmin,`select public.approve_student_device_registration_request(${q(school)},${q(request)},'Denied');`,/not_available/);
  const approved = scalar(ids.staff,`public.approve_student_device_registration_request(${q(school)},${q(request)},'Verified synthetic device')`);
  assert.equal(scalar(ids.staff,`public.approve_student_device_registration_request(${q(school)},${q(request)},'Verified synthetic device')`),approved);
  assert.equal(scalar(ids.schoolAdmin,`status::text from public.device_custody_devices where id=${q(approved)}`),'checked_out');
  const rejected = scalar(studentUser,submit('HANDOFF-REJECT'));
  scalar(ids.staff,`public.reject_student_device_registration_request(${q(school)},${q(rejected)},'Synthetic rejection')`);
  assert.equal(scalar(ids.schoolAdmin,`count(*) from public.device_custody_devices where serial_number='HANDOFF-REJECT' and school_id=${q(school)}`),'0');
  denied(studentUser,`select ${submit('')};`,/invalid_input/);
  pass("Path B real linked student submission, scoped approval/rejection and serial requirement");

  const transition = (actor, operation, target = first) => actorSql(actor, `select row_to_json(t) from public.transition_residence_device_custody(${q(school)},${q(target)},${q(operation)},'manual','Synthetic rehearsal') t;`);
  assert.equal(scalar(ids.schoolAdmin,`count(*) from public.device_custody_devices where id=${q(first)} and serial_number is null and created_by_user_id=${q(ids.staff)} and qr_token is not null`),'1');
  assert.equal(scalar(ids.schoolAdmin,`count(*) from public.device_custody_events where device_id=${q(first)}`),'0');
  const concurrent = await Promise.all([psqlAsync(transition(ids.staff,'return')),psqlAsync(transition(ids.staff,'return'))]);
  assert.deepEqual(concurrent.map(r => JSON.parse(r.stdout.trim()).outcome).sort(),['applied','stale_status']);
  assert.equal(scalar(ids.schoolAdmin,`count(*) from public.device_custody_events where device_id=${q(first)} and action='returned' and performed_by_user_id=${q(ids.staff)} and performed_at is not null`),'1');
  assert.equal(JSON.parse(psql(transition(ids.staff,'release')).stdout.trim()).outcome,'applied');
  assert.equal(JSON.parse(psql(transition(ids.staff,'mark_missing')).stdout.trim()).outcome,'applied');
  assert.equal(JSON.parse(psql(transition(ids.staff,'recover_missing')).stdout.trim()).outcome,'applied');
  assert.equal(scalar(ids.schoolAdmin,`count(*) from public.device_custody_events where device_id=${q(first)}`),'4');
  const finalAudit = audit();
  assert.notEqual(JSON.parse(psql(transition(ids.otherSchoolAdmin,'release')).stdout.trim()).outcome,'applied');
  assert.deepEqual(audit(),finalAudit);
  assert.deepEqual(preserved(),before);
  pass("first capture without serial; concurrent Return creates exactly one event; Release/Missing/Recovery preserve history; prior schedule/custody fixtures unchanged");
}
