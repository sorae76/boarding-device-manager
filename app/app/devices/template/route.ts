import { NextResponse } from "next/server";

import { requireDeviceWorkflowContext } from "@/lib/devices/access";
import { deviceTemplateCsv } from "@/lib/devices/csv";

export async function GET() {
  await requireDeviceWorkflowContext();

  return new NextResponse(deviceTemplateCsv(), {
    headers: {
      "Content-Disposition": 'attachment; filename="device-import-template.csv"',
      "Content-Type": "text/csv; charset=utf-8"
    }
  });
}
