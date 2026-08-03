export type StudentBasicInput = {
  firstName: string;
  lastName: string;
  studentNumber: string;
  gradeLevel: string;
  residenceId: string;
  schoolEmail: string;
  status: "active" | "inactive";
};

export function validateStudentBasicInput(input: StudentBasicInput): string | null {
  if (!input.firstName || !input.lastName) return "First and last name are required.";
  if (input.firstName.length > 100 || input.lastName.length > 100) return "Names must be 100 characters or fewer.";
  if (input.studentNumber.length > 100) return "Student number must be 100 characters or fewer.";
  if (input.gradeLevel.length > 50) return "Grade level must be 50 characters or fewer.";
  if (input.schoolEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.schoolEmail)) return "Enter a valid school email.";
  if (input.status !== "active" && input.status !== "inactive") return "Choose a valid status.";
  return null;
}
