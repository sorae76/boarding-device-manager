export type SchoolRole =
  | "school_admin"
  | "dorm_supervisor"
  | "dorm_staff"
  | "viewer"
  | "parent";

export type GlobalRole = "super_admin" | "user";

export type AppUserProfile = {
  id: string;
  email: string;
  full_name: string | null;
  global_role: GlobalRole;
  is_active: boolean;
};

export type SchoolMembership = {
  id: string;
  school_id: string;
  user_id: string;
  role: SchoolRole;
  is_active: boolean;
  schools: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    is_active: boolean;
  } | null;
};

export type CurrentSessionContext = {
  authUser: {
    id: string;
    email?: string;
  };
  profile: AppUserProfile;
  memberships: SchoolMembership[];
  currentMembership: SchoolMembership | null;
  currentSchool:
    | {
        id: string;
        name: string;
        slug: string;
        timezone: string;
        is_active: boolean;
      }
    | null;
  effectiveRole: GlobalRole | SchoolRole;
};
