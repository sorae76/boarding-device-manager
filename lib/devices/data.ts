import { createClient } from "@/lib/supabase/server";
import type { DeviceWorkflowContext } from "@/lib/devices/access";
import type {
  CustodyDevice,
  CustodyEvent,
  CustodyNotice,
  DashboardDeviceCounts,
  DevicePass,
  StudentSummary
} from "@/lib/devices/types";

type StudentRelation = StudentSummary | StudentSummary[] | null;

type DeviceRow = Omit<CustodyDevice, "students"> & {
  students: StudentRelation;
};

type EventRow = Omit<CustodyEvent, "device_custody_devices" | "students"> & {
  device_custody_devices: CustodyEvent["device_custody_devices"] | CustodyEvent["device_custody_devices"][] | null;
  students: StudentRelation;
};

type NoticeRow = Omit<CustodyNotice, "device_custody_devices" | "students"> & {
  device_custody_devices: CustodyNotice["device_custody_devices"] | CustodyNotice["device_custody_devices"][] | null;
  students: StudentRelation;
};

const deviceSelect = `
  id,
  school_id,
  student_id,
  device_type,
  manufacturer,
  model,
  color,
  serial_number,
  asset_tag,
  qr_token,
  status,
  return_due_at,
  notes,
  created_at,
  updated_at,
  students(id,student_number,first_name,last_name,grade_level)
`;

const eventSelect = `
  id,
  school_id,
  device_id,
  student_id,
  action,
  method,
  performed_by_user_id,
  performed_at,
  notes,
  device_custody_devices(id,manufacturer,model,asset_tag,qr_token,device_type),
  students(id,student_number,first_name,last_name,grade_level)
`;

const noticeSelect = `
  id,
  school_id,
  device_id,
  student_id,
  notice_type,
  status,
  reason,
  occurred_at,
  reviewed_by_user_id,
  reviewed_at,
  review_notes,
  device_custody_devices(id,manufacturer,model,asset_tag,qr_token,device_type),
  students(id,student_number,first_name,last_name,grade_level)
`;

function single<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function normalizeDevice(row: DeviceRow): CustodyDevice {
  return {
    ...row,
    students: single(row.students)
  };
}

function normalizeEvent(row: EventRow): CustodyEvent {
  return {
    ...row,
    device_custody_devices: single(row.device_custody_devices),
    students: single(row.students)
  };
}

function normalizeNotice(row: NoticeRow): CustodyNotice {
  return {
    ...row,
    device_custody_devices: single(row.device_custody_devices),
    students: single(row.students)
  };
}

function todayIsoRange(timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const [year, month, day] = formatter.format(new Date()).split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));

  return {
    start: start.toISOString(),
    end: end.toISOString()
  };
}

export async function listStudents(context: DeviceWorkflowContext): Promise<StudentSummary[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("students")
    .select("id,student_number,first_name,last_name,grade_level")
    .eq("school_id", context.currentSchool.id)
    .eq("status", "active")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) {
    throw new Error(`Could not load students: ${error.message}`);
  }

  return (data ?? []) as StudentSummary[];
}

export async function listDevices(context: DeviceWorkflowContext): Promise<CustodyDevice[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("device_custody_devices")
    .select(deviceSelect)
    .eq("school_id", context.currentSchool.id)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Could not load devices: ${error.message}`);
  }

  return ((data ?? []) as DeviceRow[]).map(normalizeDevice);
}

export async function getDeviceCountsByStudentId(
  context: DeviceWorkflowContext
): Promise<Record<string, number>> {
  const devices = await listDevices(context);

  return devices.reduce<Record<string, number>>((counts, device) => {
    counts[device.student_id] = (counts[device.student_id] ?? 0) + 1;

    return counts;
  }, {});
}

export async function getExistingDeviceAssetTags(context: DeviceWorkflowContext): Promise<string[]> {
  const devices = await listDevices(context);

  return devices
    .map((device) => device.asset_tag)
    .filter((assetTag): assetTag is string => Boolean(assetTag));
}

export async function getDevice(
  context: DeviceWorkflowContext,
  deviceId: string
): Promise<CustodyDevice | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("device_custody_devices")
    .select(deviceSelect)
    .eq("school_id", context.currentSchool.id)
    .eq("id", deviceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load device: ${error.message}`);
  }

  return data ? normalizeDevice(data as DeviceRow) : null;
}

export async function listEvents(context: DeviceWorkflowContext): Promise<CustodyEvent[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("device_custody_events")
    .select(eventSelect)
    .eq("school_id", context.currentSchool.id)
    .order("performed_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`Could not load return events: ${error.message}`);
  }

  return ((data ?? []) as EventRow[]).map(normalizeEvent);
}

export async function listDeviceEvents(
  context: DeviceWorkflowContext,
  deviceId: string
): Promise<CustodyEvent[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("device_custody_events")
    .select(eventSelect)
    .eq("school_id", context.currentSchool.id)
    .eq("device_id", deviceId)
    .order("performed_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`Could not load device return events: ${error.message}`);
  }

  return ((data ?? []) as EventRow[]).map(normalizeEvent);
}

export async function listNotices(context: DeviceWorkflowContext): Promise<CustodyNotice[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("device_custody_notices")
    .select(noticeSelect)
    .eq("school_id", context.currentSchool.id)
    .order("occurred_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`Could not load device notices: ${error.message}`);
  }

  return ((data ?? []) as NoticeRow[]).map(normalizeNotice);
}

export async function getLatestReturnEvent(
  context: DeviceWorkflowContext,
  deviceId: string
): Promise<CustodyEvent | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("device_custody_events")
    .select(eventSelect)
    .eq("school_id", context.currentSchool.id)
    .eq("device_id", deviceId)
    .eq("action", "returned")
    .order("performed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load latest return event: ${error.message}`);
  }

  return data ? normalizeEvent(data as EventRow) : null;
}

export async function getDevicePass(qrToken: string): Promise<DevicePass | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .rpc("get_device_pass_by_qr_token", { target_qr_token: qrToken })
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load device pass: ${error.message}`);
  }

  return (data as DevicePass | null) ?? null;
}

export async function recordDevicePassOpen(qrToken: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("record_device_pass_open", {
    target_qr_token: qrToken
  });

  if (error) {
    throw new Error(`Could not record device pass activity: ${error.message}`);
  }
}

export async function getDashboardDeviceCounts(
  context: DeviceWorkflowContext
): Promise<DashboardDeviceCounts> {
  const supabase = createClient();
  const schoolId = context.currentSchool.id;
  const { start, end } = todayIsoRange(context.currentSchool?.timezone ?? "America/New_York");

  const [
    registeredResult,
    checkedOutResult,
    returnedTodayResult,
    lostResult,
    overdueResult,
    pendingNoticesResult
  ] = await Promise.all([
    supabase
      .from("device_custody_devices")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId),
    supabase
      .from("device_custody_devices")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("status", "checked_out"),
    supabase
      .from("device_custody_events")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("action", "returned")
      .gte("performed_at", start)
      .lt("performed_at", end),
    supabase
      .from("device_custody_devices")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("status", "lost"),
    supabase
      .from("device_custody_devices")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("status", "checked_out")
      .lt("return_due_at", new Date().toISOString()),
    supabase
      .from("device_custody_notices")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("status", "pending")
  ]);

  const errors = [
    registeredResult.error,
    checkedOutResult.error,
    returnedTodayResult.error,
    lostResult.error,
    overdueResult.error,
    pendingNoticesResult.error
  ].filter(Boolean);

  if (errors.length > 0) {
    throw new Error(`Could not load dashboard counts: ${errors[0]?.message}`);
  }

  return {
    registeredDevices: registeredResult.count ?? 0,
    checkedOutDevices: checkedOutResult.count ?? 0,
    returnedToday: returnedTodayResult.count ?? 0,
    pendingOrMissing: (lostResult.count ?? 0) + (overdueResult.count ?? 0),
    pendingNotices: pendingNoticesResult.count ?? 0
  };
}
