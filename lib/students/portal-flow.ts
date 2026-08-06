type StudentSessionContext = {
  currentSchool: unknown;
  effectiveRole: string;
};

type PortalRpcName =
  | "get_current_student_portal_profile"
  | "list_current_student_portal_devices"
  | "list_current_student_device_registration_requests"
  | "list_current_student_device_issue_requests";

type PortalRpcResult = {
  data: unknown;
  error: unknown;
};

type StudentPortalDependencies<TContext extends StudentSessionContext> = {
  redirectInvalidStudent: () => never;
  redirectNonStudent: (context: TContext) => never;
  requireSession: (nextPath: string) => Promise<TContext>;
  rpc: (name: PortalRpcName) => Promise<PortalRpcResult>;
};

export async function runStudentPortalFlow<TContext extends StudentSessionContext>(
  dependencies: StudentPortalDependencies<TContext>
) {
  const context = await dependencies.requireSession("/student");

  if (context.effectiveRole !== "student") {
    dependencies.redirectNonStudent(context);
  }

  const { data: rawProfileData, error: profileError } = await dependencies.rpc(
    "get_current_student_portal_profile"
  );
  const profileData = Array.isArray(rawProfileData) ? rawProfileData : null;

  if (profileError || profileData?.length !== 1 || !context.currentSchool) {
    dependencies.redirectInvalidStudent();
  }

  const { data: rawDeviceData, error: deviceError } = await dependencies.rpc(
    "list_current_student_portal_devices"
  );

  if (deviceError) {
    throw new Error("Could not load the student portal.");
  }

  const { data: rawRequestData, error: requestError } = await dependencies.rpc(
    "list_current_student_device_registration_requests"
  );

  if (requestError) {
    throw new Error("Could not load the student portal.");
  }

  const { data: rawIssueData, error: issueError } = await dependencies.rpc(
    "list_current_student_device_issue_requests"
  );
  if (issueError) throw new Error("Could not load the student portal.");

  return {
    context,
    profile: profileData[0],
    devices: Array.isArray(rawDeviceData) ? rawDeviceData : [],
    registrationRequests: Array.isArray(rawRequestData) ? rawRequestData : [],
    issueRequests: Array.isArray(rawIssueData) ? rawIssueData : []
  };
}
