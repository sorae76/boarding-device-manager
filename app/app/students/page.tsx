import StudentManagement from "@/app/app/students/student-management";
import {
  canManageStudentPrimaryResidence,
  requireStudentContext
} from "@/lib/students/access";
import { getStudentManagementData } from "@/lib/students/data";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const context = await requireStudentContext();
  const { activeResidences, students } = await getStudentManagementData(context);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-brand">Students</p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-950">Students</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
          View device custody and manage each student&apos;s primary residence.
        </p>
      </div>

      <StudentManagement
        activeResidences={activeResidences}
        canManage={canManageStudentPrimaryResidence(context)}
        students={students}
      />
    </div>
  );
}
