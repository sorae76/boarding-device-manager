"use server";

import { revalidatePath } from "next/cache";

import { requireResidenceContext } from "@/lib/residences/access";
import { createClient } from "@/lib/supabase/server";

export type ResidenceActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const initialErrorMessage = "Could not save residence.";

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function requiredText(formData: FormData, key: string, label: string) {
  const value = textValue(formData, key);

  if (!value) {
    throw new Error(`${label} is required.`);
  }

  return value;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function requireResidenceIdValue(value: unknown) {
  const residenceId = typeof value === "string" ? value.trim() : "";

  if (!residenceId || !isUuid(residenceId)) {
    throw new Error("Residence is invalid.");
  }

  return residenceId;
}

function requireResidenceId(formData: FormData) {
  return requireResidenceIdValue(requiredText(formData, "residenceId", "Residence"));
}

function assertCanManageResidence(effectiveRole: string) {
  if (
    effectiveRole !== "super_admin" &&
    effectiveRole !== "school_admin" &&
    effectiveRole !== "dorm_supervisor"
  ) {
    throw new Error("You are not allowed to manage residences.");
  }
}

function userMessageForError(error: unknown, fallback = initialErrorMessage) {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (
      message.includes("duplicate key") ||
      message.includes("unique constraint") ||
      message.includes("dorms_school_id_name_key") ||
      message.includes("dorms_school_id_code_key")
    ) {
      return "A residence with that name or code already exists for this school.";
    }

    if (
      error.message === "Name is required." ||
      error.message === "Code is required." ||
      error.message === "Residence is invalid." ||
      error.message === "You are not allowed to manage residences." ||
      error.message === "Residence was not found or you are not allowed to update it."
    ) {
      return error.message;
    }
  }

  return fallback;
}

async function requireResidenceManager() {
  const context = await requireResidenceContext();

  assertCanManageResidence(context.effectiveRole);

  return context;
}

export async function addResidenceAction(
  _previousState: ResidenceActionState,
  formData: FormData
): Promise<ResidenceActionState> {
  try {
    const context = await requireResidenceManager();
    const supabase = createClient();
    const name = requiredText(formData, "name", "Name");
    const code = requiredText(formData, "code", "Code");
    const { error } = await supabase.from("dorms").insert({
      school_id: context.currentSchool.id,
      name,
      code,
      is_active: true
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/app/residences");

    return {
      status: "success",
      message: "Residence added."
    };
  } catch (error) {
    return {
      status: "error",
      message: userMessageForError(error, "Could not add residence.")
    };
  }
}

export async function updateResidenceAction(
  _previousState: ResidenceActionState,
  formData: FormData
): Promise<ResidenceActionState> {
  try {
    const context = await requireResidenceManager();
    const supabase = createClient();
    const residenceId = requireResidenceId(formData);
    const name = requiredText(formData, "name", "Name");
    const code = requiredText(formData, "code", "Code");
    const { data, error } = await supabase
      .from("dorms")
      .update({ name, code })
      .eq("school_id", context.currentSchool.id)
      .eq("id", residenceId)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      throw new Error("Residence was not found or you are not allowed to update it.");
    }

    revalidatePath("/app/residences");

    return {
      status: "success",
      message: "Residence updated."
    };
  } catch (error) {
    return {
      status: "error",
      message: userMessageForError(error, "Could not update residence.")
    };
  }
}

export async function setResidenceActiveAction(
  residenceId: string,
  desiredIsActive: boolean,
  _previousState: ResidenceActionState,
  _formData: FormData
): Promise<ResidenceActionState> {
  try {
    const context = await requireResidenceManager();
    const supabase = createClient();
    const validResidenceId = requireResidenceIdValue(residenceId);
    const isActive = Boolean(desiredIsActive);
    const { data, error } = await supabase
      .from("dorms")
      .update({ is_active: isActive })
      .eq("school_id", context.currentSchool.id)
      .eq("id", validResidenceId)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      throw new Error("Residence was not found or you are not allowed to update it.");
    }

    revalidatePath("/app/residences");

    return {
      status: "success",
      message: isActive ? "Residence reactivated." : "Residence deactivated."
    };
  } catch (error) {
    return {
      status: "error",
      message: userMessageForError(error, "Could not update residence status.")
    };
  }
}
