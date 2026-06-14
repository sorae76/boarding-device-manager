import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { hasPublicSupabaseEnv } from "@/lib/supabase/env";
import type { CurrentSessionContext, SchoolMembership } from "@/lib/auth/types";

type MembershipRow = Omit<SchoolMembership, "schools"> & {
  schools: SchoolMembership["schools"] | SchoolMembership["schools"][] | null;
};

function normalizeMembership(row: MembershipRow): SchoolMembership {
  const school = Array.isArray(row.schools) ? row.schools[0] ?? null : row.schools;

  return {
    ...row,
    schools: school
  };
}

export async function getCurrentSessionContext(): Promise<CurrentSessionContext | null> {
  if (!hasPublicSupabaseEnv()) {
    return null;
  }

  const supabase = createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("app_users")
    .select("id,email,full_name,global_role,is_active")
    .eq("id", user.id)
    .eq("is_active", true)
    .single();

  if (profileError || !profile) {
    return null;
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("app_user_school_roles")
    .select(
      "id,school_id,user_id,role,is_active,schools(id,name,slug,timezone,is_active)"
    )
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (membershipsError) {
    return null;
  }

  const activeMemberships = ((memberships ?? []) as MembershipRow[])
    .map(normalizeMembership)
    .filter((membership) => membership.schools?.is_active);
  const currentMembership = activeMemberships[0] ?? null;
  const currentSchool = currentMembership?.schools ?? null;

  return {
    authUser: {
      id: user.id,
      email: user.email
    },
    profile,
    memberships: activeMemberships,
    currentMembership,
    currentSchool,
    effectiveRole:
      profile.global_role === "super_admin"
        ? "super_admin"
        : currentMembership?.role ?? "viewer"
  };
}

export async function requireSessionContext() {
  const context = await getCurrentSessionContext();

  if (!context) {
    redirect("/login");
  }

  return context;
}
