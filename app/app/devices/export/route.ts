import { NextResponse } from "next/server";

import { requireDeviceWorkflowContext } from "@/lib/devices/access";
import { exportColumns, rowsToCsv } from "@/lib/devices/csv";
import { listDevices } from "@/lib/devices/data";

export async function GET() {
  const context = await requireDeviceWorkflowContext();
  const devices = await listDevices(context);
  const csv = rowsToCsv(
    exportColumns,
    devices.map((device) => ({
      student_first_name: device.students?.first_name ?? "",
      student_last_name: device.students?.last_name ?? "",
      student_number: device.students?.student_number ?? "",
      device_type: device.device_type,
      manufacturer: device.manufacturer,
      model: device.model,
      color: device.color,
      asset_tag: device.asset_tag ?? "",
      serial_number: device.serial_number ?? "",
      status: device.status,
      return_due_at: device.return_due_at ?? "",
      created_at: device.created_at,
      updated_at: device.updated_at,
      notes: device.notes ?? ""
    }))
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Disposition": 'attachment; filename="devices-export.csv"',
      "Content-Type": "text/csv; charset=utf-8"
    }
  });
}
