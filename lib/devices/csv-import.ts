import { revalidatePath } from "next/cache";

import { requireDeviceWorkflowContext } from "@/lib/devices/access";
import { parseDeviceCsv, type CsvRow } from "@/lib/devices/csv";
import { deviceTypes, generateNextReadableAssetTag } from "@/lib/devices/field-options";
import { listDevices, listStudents } from "@/lib/devices/data";
import { createClient } from "@/lib/supabase/server";
import type {
  CustodyDevice,
  DeviceCustodyStatus,
  DeviceType,
  StudentSummary
} from "@/lib/devices/types";

const deviceStatuses: DeviceCustodyStatus[] = ["checked_out", "returned", "inactive", "lost"];

export type DeviceImportPreviewRow = {
  rowNumber: number;
  row: CsvRow;
  studentId: string | null;
  studentMatch: string;
  deviceSummary: string;
  status: DeviceCustodyStatus | null;
  validation: "valid" | "error";
  errorMessage: string | null;
  assetTag: string | null;
};

export type DeviceImportPreview = {
  rows: DeviceImportPreviewRow[];
  rawRowsJson: string;
  summary: string;
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function nullable(value: string) {
  return value.trim() ? value.trim() : null;
}

function formatStudent(student: StudentSummary) {
  return `${student.last_name}, ${student.first_name}${
    student.student_number ? ` (${student.student_number})` : ""
  }`;
}

function formatDevice(row: CsvRow, assetTag: string | null) {
  return [
    row.device_type || "device",
    [row.manufacturer, row.model].filter(Boolean).join(" "),
    row.color,
    assetTag ? `tag ${assetTag}` : ""
  ]
    .filter(Boolean)
    .join(" / ");
}

function matchStudent(row: CsvRow, students: StudentSummary[]) {
  const studentNumber = normalize(row.student_number);

  if (studentNumber) {
    return students.filter((student) => normalize(student.student_number ?? "") === studentNumber);
  }

  const firstName = normalize(row.student_first_name);
  const lastName = normalize(row.student_last_name);

  if (!firstName || !lastName) {
    return [];
  }

  return students.filter(
    (student) => normalize(student.first_name) === firstName && normalize(student.last_name) === lastName
  );
}

function startingSequenceForStudent(student: StudentSummary, existingDevices: CustodyDevice[]) {
  const currentCount = existingDevices.filter((device) => device.student_id === student.id).length;

  return currentCount + 1;
}

function nextAssetTag(
  student: StudentSummary,
  existingDevices: CustodyDevice[],
  reservedAssetTags: Set<string>
) {
  return generateNextReadableAssetTag(
    student,
    startingSequenceForStudent(student, existingDevices),
    reservedAssetTags
  );
}

function validTimestamp(value: string) {
  if (!value.trim()) {
    return true;
  }

  return !Number.isNaN(new Date(value).getTime());
}

function validateRows(
  rows: CsvRow[],
  students: StudentSummary[],
  existingDevices: CustodyDevice[]
): DeviceImportPreviewRow[] {
  const existingAssetTags = new Set(
    existingDevices
      .map((device) => device.asset_tag)
      .filter((assetTag): assetTag is string => Boolean(assetTag))
      .map(normalize)
  );
  const reservedAssetTags = new Set(existingAssetTags);

  return rows.map((row, index) => {
    const errors: string[] = [];
    const matches = matchStudent(row, students);
    const matchedStudent = matches.length === 1 ? matches[0] : null;

    if (matches.length === 0) {
      errors.push("No matching student was found in the current school.");
    } else if (matches.length > 1) {
      errors.push("Multiple matching students were found.");
    }

    if (!deviceTypes.includes(row.device_type as DeviceType)) {
      errors.push("Device type must be phone, tablet, laptop, watch, or other.");
    }

    const status = row.status ? (row.status as DeviceCustodyStatus) : "checked_out";

    if (!deviceStatuses.includes(status)) {
      errors.push("Status must be checked_out, returned, inactive, or lost.");
    }

    if (!row.manufacturer.trim()) {
      errors.push("Manufacturer is required.");
    }

    if (!row.model.trim()) {
      errors.push("Model is required.");
    }

    if (!row.color.trim()) {
      errors.push("Color is required.");
    }

    if (!validTimestamp(row.return_due_at)) {
      errors.push("Return due time is invalid.");
    }

    let assetTag = nullable(row.asset_tag);
    const normalizedProvidedAssetTag = assetTag ? normalize(assetTag) : null;

    if (normalizedProvidedAssetTag && existingAssetTags.has(normalizedProvidedAssetTag)) {
      errors.push("Asset tag already exists for this school.");
    }

    if (
      normalizedProvidedAssetTag &&
      reservedAssetTags.has(normalizedProvidedAssetTag) &&
      !existingAssetTags.has(normalizedProvidedAssetTag)
    ) {
      errors.push("Asset tag is duplicated in this CSV.");
    }

    if (!assetTag && matchedStudent) {
      assetTag = nextAssetTag(matchedStudent, existingDevices, reservedAssetTags);
    }

    if (assetTag) {
      reservedAssetTags.add(normalize(assetTag));
    }

    return {
      rowNumber: index + 2,
      row,
      studentId: matchedStudent?.id ?? null,
      studentMatch: matchedStudent ? formatStudent(matchedStudent) : "No unique match",
      deviceSummary: formatDevice(row, assetTag),
      status: deviceStatuses.includes(status) ? status : null,
      validation: errors.length === 0 ? "valid" : "error",
      errorMessage: errors.join(" "),
      assetTag
    };
  });
}

async function loadImportContext() {
  const context = await requireDeviceWorkflowContext();
  const [students, devices] = await Promise.all([listStudents(context), listDevices(context)]);

  return {
    context,
    devices,
    students
  };
}

export async function previewDeviceCsvImport(file: File): Promise<DeviceImportPreview> {
  const text = await file.text();
  const rows = parseDeviceCsv(text);
  const { devices, students } = await loadImportContext();
  const previewRows = validateRows(rows, students, devices);
  const validCount = previewRows.filter((row) => row.validation === "valid").length;

  return {
    rows: previewRows,
    rawRowsJson: JSON.stringify(rows),
    summary: `${validCount} of ${previewRows.length} rows are ready to import.`
  };
}

export async function importValidDeviceCsvRows(rawRowsJson: string) {
  const parsedRows = JSON.parse(rawRowsJson) as CsvRow[];
  const { context, devices, students } = await loadImportContext();
  const previewRows = validateRows(parsedRows, students, devices);
  const validRows = previewRows.filter((row) => row.validation === "valid");

  if (validRows.length === 0) {
    return {
      ...previewFromRows(previewRows, parsedRows),
      summary: "No valid rows were available to import."
    };
  }

  const supabase = createClient();
  const schoolId = context.currentSchool.id;
  const nowUserId = context.authUser.id;
  const { error } = await supabase.from("device_custody_devices").insert(
    validRows.map((previewRow) => ({
      school_id: schoolId,
      student_id: previewRow.studentId,
      device_type: previewRow.row.device_type as DeviceType,
      manufacturer: previewRow.row.manufacturer,
      model: previewRow.row.model,
      color: previewRow.row.color,
      serial_number: nullable(previewRow.row.serial_number),
      asset_tag: previewRow.assetTag,
      qr_token: crypto.randomUUID(),
      status: previewRow.status ?? "checked_out",
      return_due_at: nullable(previewRow.row.return_due_at)
        ? new Date(previewRow.row.return_due_at).toISOString()
        : null,
      notes: nullable(previewRow.row.notes),
      created_by_user_id: nowUserId,
      updated_by_user_id: nowUserId
    }))
  );

  if (error) {
    throw new Error(`Could not import devices: ${error.message}`);
  }

  revalidatePath("/app/dashboard");
  revalidatePath("/app/devices");

  return {
    ...previewFromRows(previewRows, parsedRows),
    summary: `${validRows.length} valid rows were imported.`
  };
}

function previewFromRows(previewRows: DeviceImportPreviewRow[], rows: CsvRow[]): DeviceImportPreview {
  return {
    rows: previewRows,
    rawRowsJson: JSON.stringify(rows),
    summary: `${previewRows.filter((row) => row.validation === "valid").length} of ${
      previewRows.length
    } rows are ready to import.`
  };
}
