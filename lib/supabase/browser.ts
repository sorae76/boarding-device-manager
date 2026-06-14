"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getPublicSupabaseEnv } from "@/lib/supabase/env";

export function createClient() {
  const { url, anonKey } = getPublicSupabaseEnv();

  return createBrowserClient(url, anonKey);
}
