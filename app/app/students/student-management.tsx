"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";

import {
  setStudentPrimaryResidenceAction,
  setStudentSchoolEmailAction,
  saveStudentAction
} from "@/lib/students/actions";
import { nextNewStudentEditorVersion, studentEditorVersion } from "@/lib/students/management";
import type { StudentCustodyStatus } from "@/lib/devices/types";
import type { StudentActionState, StudentManagementRow, StudentResidence } from "@/lib/students/types";

const initialState: StudentActionState = { status: "idle", message: "" };

const statusLabels: Record<StudentCustodyStatus, string> = {
  complete: "Complete", pending: "Pending", missing: "Missing", no_devices: "No devices"
};

const statusStyles: Record<StudentCustodyStatus, string> = {
  complete: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  missing: "bg-rose-50 text-rose-700",
  no_devices: "bg-neutral-100 text-neutral-700"
};

function SaveButton() {
  const { pending } = useFormStatus();
  return <button className="h-10 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-neutral-400" disabled={pending} type="submit">{pending ? "Saving..." : "Save"}</button>;
}

function StudentFields({ activeResidences, student }: { activeResidences: StudentResidence[]; student?: StudentManagementRow }) {
  const linked = Boolean(student?.auth_user_id);
  const fieldClass = "mt-1 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm disabled:bg-neutral-100 disabled:text-neutral-500";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium text-neutral-700">First name<input autoFocus className={fieldClass} defaultValue={student?.first_name} maxLength={100} name="firstName" required /></label>
      <label className="text-sm font-medium text-neutral-700">Last name<input className={fieldClass} defaultValue={student?.last_name} maxLength={100} name="lastName" required /></label>
      <label className="text-sm font-medium text-neutral-700">Student number <span className="font-normal text-neutral-500">(optional)</span><input className={fieldClass} defaultValue={student?.student_number ?? ""} maxLength={100} name="studentNumber" /></label>
      <label className="text-sm font-medium text-neutral-700">Grade level <span className="font-normal text-neutral-500">(optional)</span><input className={fieldClass} defaultValue={student?.grade_level ?? ""} maxLength={50} name="gradeLevel" /></label>
      <label className="text-sm font-medium text-neutral-700">Primary residence <span className="font-normal text-neutral-500">(optional)</span><select className={fieldClass} defaultValue={student?.dorm_id ?? ""} name="residenceId"><option value="">Unassigned</option>{activeResidences.map((residence) => <option key={residence.id} value={residence.id}>{residence.name}{residence.code ? ` (${residence.code})` : ""}</option>)}</select></label>
      <label className="text-sm font-medium text-neutral-700">School Google email <span className="font-normal text-neutral-500">(optional)</span><input className={fieldClass} defaultValue={student?.school_email ?? ""} disabled={linked} name="schoolEmail" placeholder="student@school.org" type="email" />{linked ? <span className="mt-1 block text-xs text-neutral-500">Locked because this account is linked.</span> : null}</label>
      <label className="text-sm font-medium text-neutral-700">Status<select className={fieldClass} defaultValue={student?.status ?? "active"} name="status"><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
    </div>
  );
}

function StudentEditor({ activeResidences, onCancel, onSuccess, student }: { activeResidences: StudentResidence[]; onCancel?: () => void; onSuccess?: () => void; student?: StudentManagementRow }) {
  const [state, formAction] = useFormState(saveStudentAction, initialState);
  const [newStudentVersion, setNewStudentVersion] = useState(0);
  const router = useRouter();
  useEffect(() => {
    if (state.status === "success") {
      if (!student) {
        setNewStudentVersion((current) => nextNewStudentEditorVersion(current, state.status));
      }
      router.refresh();
      onSuccess?.();
    }
  }, [onSuccess, router, state.status, student]);
  return (
    <form action={formAction} className="space-y-4" key={studentEditorVersion(student, newStudentVersion)}>
      {student ? <input name="studentId" type="hidden" value={student.id} /> : null}
      {student?.auth_user_id ? <input name="schoolEmail" type="hidden" value={student.school_email ?? ""} /> : null}
      <StudentFields activeResidences={activeResidences} student={student} />
      <div className="flex flex-wrap items-center justify-end gap-3">{onCancel ? <button className="h-10 rounded-md border border-neutral-300 px-4 text-sm font-semibold text-neutral-700 hover:bg-neutral-50" onClick={onCancel} type="button">Cancel</button> : null}<SaveButton /></div>
      {state.message ? <p aria-live="polite" className={`text-sm font-medium ${state.status === "success" ? "text-green-700" : "text-brand"}`}>{state.message}</p> : null}
    </form>
  );
}

function Modal({ children, onClose, open, title }: { children: React.ReactNode; onClose: () => void; open: boolean; title: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog aria-labelledby="student-dialog-title" className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl p-0 shadow-2xl backdrop:bg-neutral-950/50" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} ref={dialogRef}>
      <div className="p-4 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4"><h2 className="text-xl font-semibold text-neutral-950" id="student-dialog-title">{title}</h2><button aria-label="Close dialog" className="-mr-2 -mt-2 rounded-md p-2 text-2xl leading-none text-neutral-500 hover:bg-neutral-100" onClick={onClose} type="button">×</button></div>
        {children}
      </div>
    </dialog>
  );
}

function EditStudentAction({ activeResidences, student }: { activeResidences: StudentResidence[]; student: StudentManagementRow }) {
  const [open, setOpen] = useState(false);
  return <><button className="rounded-md border border-brand px-3 py-2 text-sm font-semibold text-brand hover:bg-red-50" onClick={() => setOpen(true)} type="button">Edit</button>{open ? <Modal onClose={() => setOpen(false)} open title={`Edit student: ${student.first_name} ${student.last_name}`}><StudentEditor activeResidences={activeResidences} onCancel={() => setOpen(false)} onSuccess={() => setOpen(false)} student={student} /></Modal> : null}</>;
}

function ResidenceForm({ activeResidences, onCancel, onSuccess, student }: { activeResidences: StudentResidence[]; onCancel: () => void; onSuccess: () => void; student: StudentManagementRow }) {
  const [state, formAction] = useFormState(setStudentPrimaryResidenceAction, initialState);
  const router = useRouter();
  useEffect(() => { if (state.status === "success") { router.refresh(); onSuccess(); } }, [onSuccess, router, state.status]);
  return (
    <form action={formAction} className="space-y-4">
      <input name="studentId" type="hidden" value={student.id} />
      <label className="block text-sm font-medium text-neutral-700">Primary residence<select autoFocus className="mt-1 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm" defaultValue={student.primaryResidence?.is_active ? student.dorm_id ?? "" : ""} name="residenceId"><option value="">Clear / Unassign</option>{activeResidences.map((residence) => <option key={residence.id} value={residence.id}>{residence.name}{residence.code ? ` (${residence.code})` : ""}</option>)}</select></label>
      <div className="flex justify-end gap-3"><button className="h-10 rounded-md border border-neutral-300 px-4 text-sm font-semibold text-neutral-700" onClick={onCancel} type="button">Cancel</button><SaveButton /></div>
      {state.message ? <p aria-live="polite" className={`text-sm font-medium ${state.status === "success" ? "text-green-700" : "text-brand"}`}>{state.message}</p> : null}
    </form>
  );
}

function ManageResidenceAction({ activeResidences, student }: { activeResidences: StudentResidence[]; student: StudentManagementRow }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return <><button className="rounded-md border border-brand px-3 py-2 text-sm font-semibold text-brand hover:bg-red-50" onClick={() => setOpen(true)} type="button">Manage residence</button>{open ? <Modal onClose={close} open title={`Manage residence: ${student.first_name} ${student.last_name}`}><ResidenceForm activeResidences={activeResidences} onCancel={close} onSuccess={close} student={student} /></Modal> : null}</>;
}

function AccountEmailForm({ student }: { student: StudentManagementRow }) {
  const [state, formAction] = useFormState(setStudentSchoolEmailAction, initialState);
  const router = useRouter();
  const linked = Boolean(student.auth_user_id);
  useEffect(() => { if (state.status === "success") router.refresh(); }, [router, state.status]);
  if (student.status !== "active") return <p className="text-xs text-neutral-500">Reactivate to configure login.</p>;
  if (linked) return <div><p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Linked</p><p className="mt-1 break-all text-xs text-neutral-700">{student.school_email}</p><p className="mt-1 text-xs text-neutral-500">Email locked.</p></div>;
  return (
    <form action={formAction} className="space-y-2">
      <input name="studentId" type="hidden" value={student.id} />
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{student.school_email ? "Ready for first login" : "Not configured"}</p>
      <input aria-label={`School email for ${student.first_name} ${student.last_name}`} className="h-9 w-full min-w-0 rounded-md border border-neutral-300 px-2 text-xs" defaultValue={student.school_email ?? ""} name="schoolEmail" placeholder="student@school.org" type="email" />
      <SaveButton />
      {state.message ? <p aria-live="polite" className={`text-xs font-medium ${state.status === "success" ? "text-green-700" : "text-brand"}`}>{state.message}</p> : null}
    </form>
  );
}

function studentName(student: StudentManagementRow) { return `${student.last_name}, ${student.first_name}`; }

function DeviceCounts({ student }: { student: StudentManagementRow }) {
  return <div className="space-y-1 text-xs text-neutral-600"><p><span className="font-semibold text-neutral-900">Total {student.totalDevices}</span></p><p>With student {student.checkedOutDevices} · Checked in {student.returnedDevices}</p><p>Missing {student.lostDevices} · Inactive {student.inactiveDevices}</p></div>;
}

export default function StudentManagement({ activeResidences, canManage, canManageAccounts, canManageStudents, students }: { activeResidences: StudentResidence[]; canManage: boolean; canManageAccounts: boolean; canManageStudents: boolean; students: StudentManagementRow[] }) {
  const actionFor = (student: StudentManagementRow) => canManageStudents ? <EditStudentAction activeResidences={activeResidences} student={student} /> : canManage ? <ManageResidenceAction activeResidences={activeResidences} student={student} /> : null;
  return (
    <div className="min-w-0 space-y-4">
      {canManageStudents ? <details className="overflow-hidden rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"><summary className="cursor-pointer font-semibold text-brand">Add Student</summary><div className="mt-4"><StudentEditor activeResidences={activeResidences} /></div></details> : null}
      <div className="space-y-3 md:hidden">
        {students.map((student) => <article className="min-w-0 overflow-hidden rounded-lg border border-neutral-200 bg-white p-4 shadow-sm" key={student.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-semibold text-neutral-950">{studentName(student)}</h2><p className="mt-1 text-xs text-neutral-500">{student.student_number ?? "No student number"}{student.grade_level ? ` / Grade ${student.grade_level}` : ""} / {student.status === "active" ? "Active" : "Inactive"}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${statusStyles[student.custodyStatus]}`}>{statusLabels[student.custodyStatus]}</span></div><p className="mt-3 text-sm text-neutral-700">Residence: {student.primaryResidence?.name ?? "Unassigned"}</p><div className="mt-3"><DeviceCounts student={student} /></div>{canManageAccounts ? <div className="mt-4 border-t border-neutral-200 pt-3"><AccountEmailForm student={student} /></div> : null}{actionFor(student) ? <div className="mt-4 border-t border-neutral-200 pt-3">{actionFor(student)}</div> : null}</article>)}
        {students.length === 0 ? <p className="rounded-lg border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500">No students are available for this school.</p> : null}
      </div>
      <section className="hidden overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm md:block">
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500"><tr><th className="w-[19%] px-3 py-3 font-semibold">Student</th><th className="w-[15%] px-3 py-3 font-semibold">Primary residence</th><th className="w-[21%] px-3 py-3 font-semibold">Devices</th><th className="w-[12%] px-3 py-3 font-semibold">Custody status</th>{canManageAccounts ? <th className="w-[21%] px-3 py-3 font-semibold">Student account</th> : null}{(canManageStudents || canManage) ? <th className="w-[12%] px-3 py-3 font-semibold">Actions</th> : null}</tr></thead>
          <tbody className="divide-y divide-neutral-200">{students.map((student) => <tr className="hover:bg-neutral-50" key={student.id}><td className="break-words px-3 py-3 align-top"><p className="font-semibold text-neutral-950">{studentName(student)}</p><p className="mt-1 text-xs text-neutral-500">{student.student_number ?? "No student number"}{student.grade_level ? ` / Grade ${student.grade_level}` : ""}{student.status === "inactive" ? " / Inactive" : ""}</p></td><td className="break-words px-3 py-3 align-top">{student.primaryResidence ? <div><p className="font-medium text-neutral-900">{student.primaryResidence.name}</p><p className="mt-1 text-xs text-neutral-500">{student.primaryResidence.code ?? "No code"}{!student.primaryResidence.is_active ? " / Inactive" : ""}</p></div> : <span className="text-neutral-500">Unassigned</span>}</td><td className="px-3 py-3 align-top"><DeviceCounts student={student} /></td><td className="px-3 py-3 align-top"><span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${statusStyles[student.custodyStatus]}`}>{statusLabels[student.custodyStatus]}</span></td>{canManageAccounts ? <td className="min-w-0 px-3 py-3 align-top"><AccountEmailForm student={student} /></td> : null}{(canManageStudents || canManage) ? <td className="px-3 py-3 align-top">{actionFor(student)}</td> : null}</tr>)}{students.length === 0 ? <tr><td className="px-4 py-8 text-center text-neutral-500" colSpan={4 + (canManageAccounts ? 1 : 0) + (canManageStudents || canManage ? 1 : 0)}>No students are available for this school.</td></tr> : null}</tbody>
        </table>
      </section>
    </div>
  );
}
