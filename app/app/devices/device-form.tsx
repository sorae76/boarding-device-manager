"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { saveDeviceAction } from "@/lib/devices/actions";
import {
  colorOptions,
  deviceTypes,
  generateNextReadableAssetTag,
  manufacturerOptionsByDeviceType
} from "@/lib/devices/field-options";
import {
  deviceTypeLabels,
  formatForDateTimeInput,
  statusLabels,
  studentName
} from "@/lib/devices/format";
import type { CustodyDevice, DeviceCustodyStatus, DeviceType, StudentSummary } from "@/lib/devices/types";

const statuses: DeviceCustodyStatus[] = ["checked_out", "returned", "inactive", "lost"];

type DeviceFormProps = {
  cancelHref?: string;
  device?: CustodyDevice;
  existingDeviceCountsByStudentId?: Record<string, number>;
  existingAssetTags?: string[];
  students: StudentSummary[];
};

function customOrPreset(value: string | null | undefined, options: string[]) {
  if (!value) {
    return {
      customValue: "",
      selectedValue: options[0] ?? "Other"
    };
  }

  if (options.includes(value)) {
    return {
      customValue: "",
      selectedValue: value
    };
  }

  return {
    customValue: value,
    selectedValue: "Other"
  };
}

export default function DeviceForm({
  cancelHref,
  device,
  existingAssetTags = [],
  existingDeviceCountsByStudentId = {},
  students
}: DeviceFormProps) {
  const initialDeviceType = device?.device_type ?? "phone";
  const [selectedDeviceType, setSelectedDeviceType] = useState<DeviceType>(initialDeviceType);
  const manufacturerOptions = manufacturerOptionsByDeviceType[selectedDeviceType];
  const initialManufacturer = customOrPreset(device?.manufacturer, manufacturerOptions);
  const initialColor = customOrPreset(device?.color, colorOptions);
  const [manufacturerPreset, setManufacturerPreset] = useState(initialManufacturer.selectedValue);
  const [customManufacturer, setCustomManufacturer] = useState(initialManufacturer.customValue);
  const [colorPreset, setColorPreset] = useState(initialColor.selectedValue);
  const [customColor, setCustomColor] = useState(initialColor.customValue);
  const [assetTag, setAssetTag] = useState(device?.asset_tag ?? "");
  const studentById = useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students]
  );
  const selectedManufacturer =
    manufacturerPreset === "Other" ? customManufacturer.trim() : manufacturerPreset;
  const selectedColor = colorPreset === "Other" ? customColor.trim() : colorPreset;

  function handleDeviceTypeChange(value: string) {
    const nextDeviceType = value as DeviceType;
    const nextOptions = manufacturerOptionsByDeviceType[nextDeviceType];

    setSelectedDeviceType(nextDeviceType);
    if (!nextOptions.includes(manufacturerPreset)) {
      setManufacturerPreset(nextOptions[0] ?? "Other");
      setCustomManufacturer("");
    }
  }

  function handleStudentChange(value: string) {
    if (device || assetTag.trim()) {
      return;
    }

    const student = studentById.get(value);

    if (!student) {
      return;
    }

    setAssetTag(
      generateNextReadableAssetTag(
        student,
        (existingDeviceCountsByStudentId[student.id] ?? 0) + 1,
        existingAssetTags
      )
    );
  }

  return (
    <form action={saveDeviceAction} className="space-y-5">
      {device ? <input name="deviceId" type="hidden" value={device.id} /> : null}
      <input name="manufacturer" type="hidden" value={selectedManufacturer} />
      <input name="color" type="hidden" value={selectedColor} />

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Student</span>
          <select
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
            defaultValue={device?.student_id ?? ""}
            name="studentId"
            onChange={(event) => handleStudentChange(event.target.value)}
            required
          >
            <option value="">Select student</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {studentName(student)}
                {student.student_number ? ` (${student.student_number})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Device type</span>
          <select
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
            value={selectedDeviceType}
            name="deviceType"
            onChange={(event) => handleDeviceTypeChange(event.target.value)}
          >
            {deviceTypes.map((deviceType) => (
              <option key={deviceType} value={deviceType}>
                {deviceTypeLabels[deviceType]}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Return due (optional)</span>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            defaultValue={formatForDateTimeInput(device?.return_due_at ?? null)}
            name="returnDueAt"
            type="datetime-local"
          />
          <span className="block text-xs text-neutral-500">
            Use this only if the device must be returned by a specific time.
          </span>
        </label>

        <div className="space-y-2 text-sm">
          <label className="block space-y-1">
            <span className="font-medium text-neutral-700">Manufacturer</span>
            <select
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
              onChange={(event) => setManufacturerPreset(event.target.value)}
              value={manufacturerPreset}
            >
              {manufacturerOptions.map((manufacturer) => (
                <option key={manufacturer} value={manufacturer}>
                  {manufacturer}
                </option>
              ))}
            </select>
          </label>
          {manufacturerPreset === "Other" ? (
            <label className="block space-y-1">
              <span className="font-medium text-neutral-700">Custom manufacturer</span>
              <input
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                onChange={(event) => setCustomManufacturer(event.target.value)}
                required
                value={customManufacturer}
              />
            </label>
          ) : null}
        </div>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Model</span>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            defaultValue={device?.model ?? ""}
            name="model"
            required
          />
        </label>

        <div className="space-y-2 text-sm">
          <label className="block space-y-1">
            <span className="font-medium text-neutral-700">Color</span>
            <select
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
              onChange={(event) => setColorPreset(event.target.value)}
              value={colorPreset}
            >
              {colorOptions.map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </select>
          </label>
          {colorPreset === "Other" ? (
            <label className="block space-y-1">
              <span className="font-medium text-neutral-700">Custom color</span>
              <input
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                onChange={(event) => setCustomColor(event.target.value)}
                required
                value={customColor}
              />
            </label>
          ) : null}
        </div>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Asset tag</span>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            name="assetTag"
            onChange={(event) => setAssetTag(event.target.value)}
            value={assetTag}
          />
        </label>

        <label className="space-y-1 text-sm md:col-span-2">
          <span className="font-medium text-neutral-700">Serial number (optional)</span>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            defaultValue={device?.serial_number ?? ""}
            name="serialNumber"
          />
          <span className="block text-xs text-neutral-500">
            Can be added later. Avoid typing if unsure.
          </span>
        </label>

        <label className="space-y-1 text-sm md:col-span-2">
          <span className="font-medium text-neutral-700">Notes</span>
          <textarea
            className="min-h-28 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            defaultValue={device?.notes ?? ""}
            name="notes"
          />
        </label>

        <details className="rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm md:col-span-2">
          <summary className="cursor-pointer font-medium text-neutral-700">
            Advanced options
          </summary>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="font-medium text-neutral-700">Current possession/status</span>
              <select
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
                defaultValue={device?.status ?? "checked_out"}
                name="status"
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </select>
            </label>
            <div className="text-xs leading-5 text-neutral-600">
              <p>checked_out = student currently has the device</p>
              <p>returned = school/staff currently holds the device</p>
              <p>inactive = no longer active</p>
              <p>lost = lost device</p>
            </div>
          </div>
        </details>
      </div>

      <div className="flex justify-end gap-3">
        {cancelHref ? (
          <Link
            className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            href={cancelHref}
          >
            Cancel
          </Link>
        ) : null}
        <button
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          type="submit"
        >
          {device ? "Save device" : "Create device"}
        </button>
      </div>
    </form>
  );
}
