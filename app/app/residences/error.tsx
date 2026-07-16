"use client";

export default function ResidencesError({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-5 shadow-sm">
      <p className="text-sm font-medium text-brand">Residence Management</p>
      <h1 className="mt-2 text-2xl font-semibold text-neutral-950">Residences could not load</h1>
      <p className="mt-2 text-sm text-red-700">
        Check your access and try again.
      </p>
      <button
        className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        onClick={reset}
        type="button"
      >
        Try again
      </button>
    </div>
  );
}
