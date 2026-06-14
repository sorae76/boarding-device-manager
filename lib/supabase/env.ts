type PublicSupabaseEnv = {
  url: string;
  anonKey: string;
};

function isPlaceholder(value: string | undefined) {
  return !value || value.includes("<") || value.includes(">");
}

export function getPublicSupabaseEnv(): PublicSupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (isPlaceholder(url) || isPlaceholder(anonKey)) {
    throw new Error("Missing Supabase public environment variables.");
  }

  return {
    url: url as string,
    anonKey: anonKey as string
  };
}

export function hasPublicSupabaseEnv() {
  return Boolean(
    !isPlaceholder(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      !isPlaceholder(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}
