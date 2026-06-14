import { getCurrentSessionContext } from "@/lib/auth/session";
import { getDefaultAppPath } from "@/lib/auth/roles";
import { hasPublicSupabaseEnv } from "@/lib/supabase/env";
import LoginForm from "./login-form";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const hasEnv = hasPublicSupabaseEnv();
  const context = hasEnv ? await getCurrentSessionContext() : null;

  if (context) {
    redirect(getDefaultAppPath(context));
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f7f8] px-4 py-10">
      <section className="w-full max-w-[420px] rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand">
            OAc Device Management
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-950">Sign in</h1>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Use your school account to continue.
          </p>
        </div>
        {hasEnv ? (
          <LoginForm />
        ) : (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800">
            Add local Supabase values to `.env.local` to enable sign-in.
          </div>
        )}
      </section>
    </main>
  );
}
