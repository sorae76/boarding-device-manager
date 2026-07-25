"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";

import {
  setStudentPrimaryResidenceAction,
  setStudentSchoolEmailAction
} from "@/lib/students/actions";
import type {
  StudentActionState,
  StudentManagementRow,
  StudentResidence
} from "@/lib/students/types";
import type { StudentCustodyStatus } from "@/lib/devices/types";

const initialState: StudentActionState = { status: "idle", message: "" };

const statusLabels: Record<StudentCustodyStatus, string> = {
  complete: "Complete",
  pending: "Pending",
  missing: "Missing",
  no_devices: "No devices"
};

const statusStyles: Record<StudentCustodyStatus, string> = {
  complete: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  missing: "bg-rose-50 text-rose-700",
  no_devices: "bg-neutral-100 text-neutral-700"
};

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="h-9 rounded-md bg-brand px-3 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-neutral-400"
      disabled={pending}
      type="submit"
    >
      {pending ? "Saving..." : "Save"}
    </button>
  );
}

function ResidenceForm({
  activeResidences,
  student
}: {
  activeResidences: StudentResidence[];
  student: StudentManagementRow;
}) {
  const [state, formAction] = useFormState(setStudentPrimaryResidenceAction, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <form action={formAction} className="min-w-[250px] space-y-2">
      <input name="studentId" type="hidden" value={student.id} />
      <div className="flex gap-2">
        <select
          aria-label={`Primary residence for ${student.first_name} ${student.last_name}`}
          className="h-9 min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2 text-sm text-neutral-800"
          defaultValue={student.primaryResidence?.is_active ? student.dorm_id ?? "" : ""}
          name="residenceId"
        >
          <option value="">Clear / Unassign</option>
          {activeResidences.map((residence) => (
            <option key={residence.id} value={residence.id}>
              {residence.name}{residence.code ? ` (${residence.code})` : ""}
            </option>
          ))}
        </select>
        <SaveButton />
      </div>
      {state.message ? (
        <p
          className={`text-xs font-medium ${
            state.status === "success" ? "text-green-700" : "text-brand"
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function AccountEmailForm({ student }: { student: StudentManagementRow }) {
  const [state, formAction] = useFormState(setStudentSchoolEmailAction, initialState);
  const router = useRouter();
  const linked = Boolean(student.auth_user_id);

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <div className="min-w-[280px] space-y-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {linked
            ? "Linked"
            : student.school_email
              ? "Ready for first login"
              : "Not configured"}
        </p>
        {linked ? (
          <p className="mt-1 text-sm text-neutral-700">{student.school_email}</p>
        ) : (
          <form action={formAction} className="mt-1 space-y-2">
            <input name="studentId" type="hidden" value={student.id} />
            <div className="flex gap-2">
              <input
                aria-label={`School email for ${student.first_name} ${student.last_name}`}
                className="h-9 min-w-0 flex-1 rounded-md border border-neutral-300 px-2 text-sm"
                defaultValue={student.school_email ?? ""}
                name="schoolEmail"
                placeholder="student@school.org"
                type="email"
              />
              <SaveButton />
            </div>
            <p className="text-xs text-neutral-500">
              Use the exact Google school account. Leave blank to clear.
            </p>
          </form>
        )}
      </div>
      {linked ? (
        <p className="text-xs text-neutral-500">Linked account emails cannot be changed.</p>
      ) : null}
      {state.message ? (
        <p
          className={`text-xs font-medium ${
            state.status === "success" ? "text-green-700" : "text-brand"
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

function studentName(student: StudentManagementRow) {
  return `${student.last_name}, ${student.first_name}`;
}

export default function StudentManagement({
  activeResidences,
  canManage,
  canManageAccounts,
  students
}: {
  activeResidences: StudentResidence[];
  canManage: boolean;
  canManageAccounts: boolean;
  students: StudentManagementRow[];
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1160px] border-collapse text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Student</th>
              <th className="px-4 py-3 font-semibold">Primary residence</th>
              <th className="px-4 py-3 font-semibold">Total devices</th>
              <th className="px-4 py-3 font-semibold">With student</th>
              <th className="px-4 py-3 font-semibold">Checked in</th>
              <th className="px-4 py-3 font-semibold">Missing</th>
              <th className="px-4 py-3 font-semibold">Inactive</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              {canManageAccounts ? (
                <th className="px-4 py-3 font-semibold">Student account</th>
              ) : null}
              {canManage ? <th className="px-4 py-3 font-semibold">Manage residence</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {students.map((student) => (
              <tr className="hover:bg-neutral-50" key={student.id}>
                <td className="px-4 py-3">
                  <p className="font-semibold text-neutral-950">{studentName(student)}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {student.student_number ?? "No student number"}
                    {student.grade_level ? ` / Grade ${student.grade_level}` : ""}
                  </p>
                </td>
                <td className="px-4 py-3">
                  {student.primaryResidence ? (
                    <div>
                      <p className="font-medium text-neutral-900">
                        {student.primaryResidence.name}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {student.primaryResidence.code ?? "No code"}
                        {!student.primaryResidence.is_active ? " / Inactive" : ""}
                      </p>
                    </div>
                  ) : (
                    <span className="text-neutral-500">Unassigned</span>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-700">{student.totalDevices}</td>
                <td className="px-4 py-3 text-neutral-700">{student.checkedOutDevices}</td>
                <td className="px-4 py-3 text-neutral-700">{student.returnedDevices}</td>
                <td className="px-4 py-3 text-neutral-700">{student.lostDevices}</td>
                <td className="px-4 py-3 text-neutral-700">{student.inactiveDevices}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusStyles[student.custodyStatus]}`}>
                    {statusLabels[student.custodyStatus]}
                  </span>
                </td>
                {canManageAccounts ? (
                  <td className="px-4 py-3">
                    <AccountEmailForm student={student} />
                  </td>
                ) : null}
                {canManage ? (
                  <td className="px-4 py-3">
                    <ResidenceForm activeResidences={activeResidences} student={student} />
                  </td>
                ) : null}
              </tr>
            ))}
            {students.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-8 text-center text-neutral-500"
                  colSpan={8 + (canManageAccounts ? 1 : 0) + (canManage ? 1 : 0)}
                >
                  No active students are available for this school.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
