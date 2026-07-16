import { createClient } from "@/lib/supabase/server";
import type { ResidenceContext } from "@/lib/residences/access";
import type { Residence } from "@/lib/residences/types";

export async function listResidences(context: ResidenceContext): Promise<Residence[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("dorms")
    .select("id,school_id,name,code,is_active,created_at,updated_at")
    .eq("school_id", context.currentSchool.id)
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    throw new Error("Could not load residences.");
  }

  return (data ?? []) as Residence[];
}
