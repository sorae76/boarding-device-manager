"use client";

import { useFormState, useFormStatus } from "react-dom";

import {
  type DeviceCsvImportState,
  importValidDeviceCsvRowsAction,
  previewDeviceCsvImportAction
} from "@/lib/devices/actions";
import { statusLabels } from "@/lib/devices/format";

const initialDeviceCsvImportState: DeviceCsvImportState = {
  status: "idle",
  message: "",
  preview: null
};

function PreviewButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Checking CSV..." : "Preview CSV"}
    </button>
  );
}

function ImportButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? "Importing..." : "Import valid rows"}
    </button>
  );
}

export default function DeviceImportForm() {
  const [previewState, previewAction] = useFormState(
    previewDeviceCsvImportAction,
    initialDeviceCsvImportState
  );
  const [importState, importAction] = useFormState(
    importValidDeviceCsvRowsAction,
    initialDeviceCsvImportState
  );
  const activeState = importState.preview ? importState : previewState;
  const preview = activeState.preview;
  const validRows = preview?.rows.filter((row) => row.validation === "valid").length ?? 0;

  return (
    <div className="space-y-5">
      <form action={previewAction} className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <label className="block space-y-2 text-sm">
          <span className="font-medium text-neutral-700">CSV file</span>
          <input
            accept=".csv,text/csv"
            className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
            name="csvFile"
            required
            type="file"
          />
        </label>
        <p className="mt-2 text-sm text-neutral-500">
          Upload a completed template to check student matches, required fields, and asset tag
          conflicts before anything is imported.
        </p>
        <div className="mt-4">
          <PreviewButton />
        </div>
      </form>

      {activeState.message ? (
        <div
          className={
            activeState.status === "error"
              ? "rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
              : "rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-700"
          }
        >
          {activeState.message}
        </div>
      ) : null}

      {preview ? (
        <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-3 border-b border-neutral-200 px-5 py-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold text-neutral-950">Import preview</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Only rows marked valid will be inserted.
              </p>
            </div>
            <form action={importAction}>
              <input name="rawRowsJson" type="hidden" value={preview.rawRowsJson} />
              <ImportButton disabled={validRows === 0 || importState.status === "imported"} />
            </form>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Row</th>
                  <th className="px-4 py-3 font-semibold">Student match</th>
                  <th className="px-4 py-3 font-semibold">Device summary</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Validation</th>
                  <th className="px-4 py-3 font-semibold">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {preview.rows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td className="px-4 py-3 font-mono text-xs text-neutral-700">
                      {row.rowNumber}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{row.studentMatch}</td>
                    <td className="px-4 py-3 text-neutral-700">{row.deviceSummary}</td>
                    <td className="px-4 py-3 text-neutral-700">
                      {row.status ? statusLabels[row.status] : "Invalid"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          row.validation === "valid"
                            ? "rounded-full bg-green-50 px-2 py-1 text-xs font-semibold text-green-700"
                            : "rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700"
                        }
                      >
                        {row.validation === "valid" ? "Valid" : "Error"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{row.errorMessage ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
