"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/browser";

type LoginFormProps = {
  isAuthConfigured: boolean;
};

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/app/dashboard";
  }

  return value;
}

export default function LoginForm({ isAuthConfigured }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nextPath = getSafeNextPath(searchParams.get("next"));

  async function handleGoogleSignIn() {
    setError(null);

    if (!isAuthConfigured) {
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();
    const redirectTo = new URL("/auth/callback", window.location.origin);
    redirectTo.searchParams.set("next", nextPath);

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo.toString()
      }
    });

    if (signInError) {
      setError(signInError.message);
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!isAuthConfigured) {
      return;
    }

    setIsSubmitting(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    setIsSubmitting(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.replace(nextPath);
    router.refresh();
  }

  return (
    <div className="mt-4 space-y-5">
      <div className="space-y-2">
        <button
          className="h-11 w-full rounded-md border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-70"
          type="button"
          onClick={handleGoogleSignIn}
          disabled={!isAuthConfigured || isSubmitting}
        >
          Continue with Google
        </button>
        <p className="text-center text-sm text-neutral-500">
          Use your Olivet Academy Google account.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-neutral-200" />
        <span className="text-xs font-medium uppercase text-neutral-400">or</span>
        <div className="h-px flex-1 bg-neutral-200" />
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
      <label className="block">
        <span className="text-sm font-medium text-neutral-800">Email</span>
        <input
          className="mt-1 h-11 w-full rounded-md border border-neutral-300 px-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
          autoComplete="email"
          inputMode="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={!isAuthConfigured || isSubmitting}
          required
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-neutral-800">Password</span>
        <input
          className="mt-1 h-11 w-full rounded-md border border-neutral-300 px-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
          autoComplete="current-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={!isAuthConfigured || isSubmitting}
          required
        />
      </label>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <button
        className="h-11 w-full rounded-md bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-70"
        type="submit"
        disabled={!isAuthConfigured || isSubmitting}
      >
        {isSubmitting ? "Signing in..." : "Sign in"}
      </button>
      </form>
    </div>
  );
}
