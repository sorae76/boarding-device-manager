"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireDeviceWorkflowContext } from "@/lib/devices/access";
import { createClient } from "@/lib/supabase/server";
import type {
  DeviceCustodyEventAction,
  DeviceCustodyEventMethod,
  DeviceCustodyNoticeStatus,
  DeviceCustodyStatus,
  DeviceType
} from "@/lib/devices/types";

const deviceTypes: DeviceType[] = ["phone", "tablet", "laptop", "watch", "other"];
const deviceStatuses: DeviceCustodyStatus[] = ["checked_out", "returned", "inactive", "lost"];
const eventActions: DeviceCustodyEventAction[] = [
  "returned",
  "checked_out",
  "marked_missing",
  "exception"
];
const eventMethods: DeviceCustodyEventMethod[] = ["qr_scan", "manual"];
const noticeStatuses: DeviceCustodyNoticeStatus[] = [
  "pending",
  "reviewed",
  "excused",
  "violation_foundation"
];

export type ReturnScanState = {
  status: "idle" | "success" | "already_returned" | "not_found" | "error";
  message: string;
  lookup?: string;
  deviceId?: string;
  deviceLabel?: string;
  studentName?: string;
  latestReturnAt?: string;
};

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function nullableTextValue(formData: FormData, key: string) {
  const value = textValue(formData, key);

  return value.length > 0 ? value : null;
}

function requiredText(formData: FormData, key: string, label: string) {
  const value = textValue(formData, key);

  if (!value) {
    throw new Error(`${label} is required.`);
  }

  return value;
}

function enumValue<T extends string>(
  formData: FormData,
  key: string,
  allowedValues: readonly T[],
  label: string
) {
  const value = requiredText(formData, key, label);

  if (!allowedValues.includes(value as T)) {
    throw new Error(`${label} is invalid.`);
  }

  return value as T;
}

function nullableTimestamp(formData: FormData, key: string) {
  const value = textValue(formData, key);

  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Return due time is invalid.");
  }

  return date.toISOString();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function saveDeviceAction(formData: FormData) {
  const context = await requireDeviceWorkflowContext();
  const supabase = createClient();
  const deviceId = nullableTextValue(formData, "deviceId");
  const schoolId = context.currentSchool.id;
  const nowUserId = context.authUser.id;

  const payload = {
    school_id: schoolId,
    student_id: requiredText(formData, "studentId", "Student"),
    device_type: enumValue(formData, "deviceType", deviceTypes, "Device type"),
    manufacturer: requiredText(formData, "manufacturer", "Manufacturer"),
    model: requiredText(formData, "model", "Model"),
    color: requiredText(formData, "color", "Color"),
    serial_number: nullableTextValue(formData, "serialNumber"),
    asset_tag: nullableTextValue(formData, "assetTag"),
    status: enumValue(formData, "status", deviceStatuses, "Status"),
    return_due_at: nullableTimestamp(formData, "returnDueAt"),
    notes: nullableTextValue(formData, "notes"),
    updated_by_user_id: nowUserId
  };

  if (deviceId) {
    const { error } = await supabase
      .from("device_custody_devices")
      .update(payload)
      .eq("school_id", schoolId)
      .eq("id", deviceId);

    if (error) {
      throw new Error(`Could not update device: ${error.message}`);
    }

    revalidatePath("/app/dashboard");
    revalidatePath("/app/devices");
    revalidatePath(`/app/devices/${deviceId}`);
    redirect(`/app/devices/${deviceId}`);
  }

  const { data, error } = await supabase
    .from("device_custody_devices")
    .insert({
      ...payload,
      qr_token: crypto.randomUUID(),
      created_by_user_id: nowUserId
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Could not create device: ${error.message}`);
  }

  revalidatePath("/app/dashboard");
  revalidatePath("/app/devices");
  redirect(`/app/devices/${data.id}`);
}

async function findDeviceByLookup(schoolId: string, lookup: string) {
  const supabase = createClient();
  const select = "id,student_id,status,manufacturer,model,asset_tag,students(first_name,last_name)";
  const byId = isUuid(lookup)
    ? await supabase
        .from("device_custody_devices")
        .select(select)
        .eq("school_id", schoolId)
        .eq("id", lookup)
        .maybeSingle()
    : { data: null, error: null };

  if (byId.error) {
    throw new Error(`Could not look up device: ${byId.error.message}`);
  }

  if (byId.data) {
    return byId.data as DeviceLookupRow;
  }

  const byQr = isUuid(lookup)
    ? await supabase
        .from("device_custody_devices")
        .select(select)
        .eq("school_id", schoolId)
        .eq("qr_token", lookup)
        .maybeSingle()
    : { data: null, error: null };

  if (byQr.error) {
    throw new Error(`Could not look up QR token: ${byQr.error.message}`);
  }

  if (byQr.data) {
    return byQr.data as DeviceLookupRow;
  }

  const byAsset = await supabase
    .from("device_custody_devices")
    .select(select)
    .eq("school_id", schoolId)
    .eq("asset_tag", lookup)
    .maybeSingle();

  if (byAsset.error) {
    throw new Error(`Could not look up asset tag: ${byAsset.error.message}`);
  }

  if (byAsset.data) {
    return byAsset.data as DeviceLookupRow;
  }

  const bySerial = await supabase
    .from("device_custody_devices")
    .select(select)
    .eq("school_id", schoolId)
    .eq("serial_number", lookup)
    .maybeSingle();

  if (bySerial.error) {
    throw new Error(`Could not look up serial number: ${bySerial.error.message}`);
  }

  return bySerial.data as DeviceLookupRow | null;
}

type DeviceLookupRow = {
  id: string;
  student_id: string;
  status: DeviceCustodyStatus;
  manufacturer: string;
  model: string;
  asset_tag: string | null;
  students:
    | {
        first_name: string;
        last_name: string;
      }
    | {
        first_name: string;
        last_name: string;
      }[]
    | null;
};

function deviceLookupLabel(device: DeviceLookupRow) {
  return [device.manufacturer, device.model].filter(Boolean).join(" ") || device.asset_tag || "Device";
}

function deviceLookupStudentName(device: DeviceLookupRow) {
  const student = Array.isArray(device.students) ? device.students[0] ?? null : device.students;

  if (!student) {
    return "Assigned student";
  }

  return `${student.last_name}, ${student.first_name}`;
}

async function latestReturnTime(schoolId: string, deviceId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("device_custody_events")
    .select("performed_at")
    .eq("school_id", schoolId)
    .eq("device_id", deviceId)
    .eq("action", "returned")
    .order("performed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not check latest return: ${error.message}`);
  }

  return (data as { performed_at: string } | null)?.performed_at ?? null;
}

export async function recordReturnEventAction(formData: FormData) {
  const context = await requireDeviceWorkflowContext();
  const supabase = createClient();
  const schoolId = context.currentSchool.id;
  const lookup = requiredText(formData, "lookup", "QR token, device ID, asset tag, or serial number");
  const action = enumValue(formData, "action", eventActions, "Action");
  const method = enumValue(formData, "method", eventMethods, "Method");
  const notes = nullableTextValue(formData, "notes");
  const device = await findDeviceByLookup(schoolId, lookup);

  if (!device) {
    throw new Error("No matching device was found for this school.");
  }

  const { error: eventError } = await supabase.from("device_custody_events").insert({
    school_id: schoolId,
    device_id: device.id,
    student_id: device.student_id,
    action,
    method,
    performed_by_user_id: context.authUser.id,
    performed_at: new Date().toISOString(),
    notes
  });

  if (eventError) {
    throw new Error(`Could not record return event: ${eventError.message}`);
  }

  revalidatePath("/app/dashboard");
  revalidatePath("/app/devices");
  revalidatePath(`/app/devices/${device.id}`);
  revalidatePath("/app/returns");
  revalidatePath("/app/returns/log");
  redirect(`/app/devices/${device.id}`);
}

export async function scanReturnDeviceAction(
  _previousState: ReturnScanState,
  formData: FormData
): Promise<ReturnScanState> {
  try {
    const context = await requireDeviceWorkflowContext();
    const supabase = createClient();
    const schoolId = context.currentSchool.id;
    const lookup = requiredText(formData, "lookup", "QR token, device ID, asset tag, or serial number");
    const method = enumValue(formData, "method", eventMethods, "Method");
    const confirmDuplicate = textValue(formData, "confirmDuplicate") === "yes";
    const notes = nullableTextValue(formData, "notes");
    const device = await findDeviceByLookup(schoolId, lookup);

    if (!device) {
      return {
        status: "not_found",
        message: "No matching device was found for this school.",
        lookup
      };
    }

    const deviceLabel = deviceLookupLabel(device);
    const student = deviceLookupStudentName(device);

    if (device.status === "returned" && !confirmDuplicate) {
      return {
        status: "already_returned",
        message: "This device is already marked returned.",
        lookup,
        deviceId: device.id,
        deviceLabel,
        studentName: student,
        latestReturnAt: (await latestReturnTime(schoolId, device.id)) ?? undefined
      };
    }

    const { error } = await supabase.from("device_custody_events").insert({
      school_id: schoolId,
      device_id: device.id,
      student_id: device.student_id,
      action: "returned",
      method,
      performed_by_user_id: context.authUser.id,
      performed_at: new Date().toISOString(),
      notes
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/app/dashboard");
    revalidatePath("/app/devices");
    revalidatePath(`/app/devices/${device.id}`);
    revalidatePath("/app/returns");
    revalidatePath("/app/returns/log");

    return {
      status: "success",
      message: "Return recorded.",
      lookup,
      deviceId: device.id,
      deviceLabel,
      studentName: student,
      latestReturnAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not record return."
    };
  }
}

export async function reviewNoticeAction(formData: FormData) {
  const context = await requireDeviceWorkflowContext();
  const supabase = createClient();
  const noticeId = requiredText(formData, "noticeId", "Notice");
  const status = enumValue(formData, "status", noticeStatuses, "Notice status");
  const notes = nullableTextValue(formData, "reviewNotes");

  const { error } = await supabase
    .from("device_custody_notices")
    .update({
      status,
      reviewed_by_user_id: context.authUser.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes
    })
    .eq("school_id", context.currentSchool.id)
    .eq("id", noticeId);

  if (error) {
    throw new Error(`Could not update notice: ${error.message}`);
  }

  revalidatePath("/app/notices");
  revalidatePath("/app/dashboard");
}
