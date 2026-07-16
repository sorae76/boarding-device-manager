import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { hasPublicSupabaseEnv } from "@/lib/supabase/env";
import type { CurrentSessionContext, SchoolMembership } from "@/lib/auth/types";

type MembershipRow = Omit<SchoolMembership, "schools"> & {
  schools: SchoolMembership["schools"] | SchoolMembership["schools"][] | null;
};

type SessionContextResult =
  | {
      context: CurrentSessionContext;
      reason: null;
    }
  | {
      context: null;
      reason: string;
    };

function getPostgresReason(errorMessage: string | null | undefined, fallback: string) {
  if (!errorMessage) {
    return fallback;
  }

  const normalizedMessage = errorMessage.toLowerCase();

  if (normalizedMessage.includes("permission denied")) {
    return `${fallback.replace(/_lookup_failed$/, "")}_permission_denied`;
  }

  return fallback;
}

function normalizeMembership(row: MembershipRow): SchoolMembership {
  const school = Array.isArray(row.schools) ? row.schools[0] ?? null : row.schools;

  return {
    ...row,
    schools: school
  };
}

async function loadCurrentSessionContext(): Promise<SessionContextResult> {
  if (!hasPublicSupabaseEnv()) {
    return {
      context: null,
      reason: "missing_supabase_env"
    };
  }

  const supabase = createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      context: null,
      reason: userError ? "auth_user_error" : "missing_auth_user"
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("app_users")
    .select("id,email,full_name,global_role,is_active")
    .eq("id", user.id)
    .eq("is_active", true)
    .single();

  if (profileError || !profile) {
    const reason = getPostgresReason(profileError?.message, "app_user_lookup_failed");

    return {
      context: null,
      reason
    };
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
    const reason = getPostgresReason(membershipsError.message, "school_role_lookup_failed");

    return {
      context: null,
      reason
    };
  }

  const activeMemberships = ((memberships ?? []) as MembershipRow[])
    .map(normalizeMembership)
    .filter((membership) => membership.schools?.is_active);
  const currentMembership = activeMemberships[0] ?? null;
  const currentSchool = currentMembership?.schools ?? null;

  if (!currentMembership || !currentSchool) {
    return {
      context: null,
      reason: "active_school_context_missing"
    };
  }

  return {
    context: {
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
          : currentMembership.role
    },
    reason: null
  };
}

export async function getCurrentSessionContext(): Promise<CurrentSessionContext | null> {
  const { context } = await loadCurrentSessionContext();

  return context;
}

export async function requireSessionContext() {
  const { context, reason } = await loadCurrentSessionContext();

  if (!context) {
    redirect(`/login?error=session&reason=${reason}&next=%2Fapp%2Fresidences`);
  }

  return context;
}
