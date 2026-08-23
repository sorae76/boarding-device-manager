export const nativeEmptyFallbackThreshold = 3;

export type NativeQrAttemptOutcome =
  | { status: "decoded"; value: string }
  | { status: "empty" }
  | { status: "rejected" }
  | { status: "timed_out" };

export async function runBoundedNativeQrAttempt(
  nativeAttempt: Promise<string>,
  timeoutMs: number
): Promise<NativeQrAttemptOutcome> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const handledNativeAttempt = nativeAttempt.then<
    NativeQrAttemptOutcome,
    NativeQrAttemptOutcome
  >(
    (value) => value ? { status: "decoded", value } : { status: "empty" },
    () => ({ status: "rejected" })
  );
  const timeout = new Promise<NativeQrAttemptOutcome>((resolve) => {
    timeoutId = setTimeout(() => resolve({ status: "timed_out" }), timeoutMs);
  });
  const outcome = await Promise.race([handledNativeAttempt, timeout]);

  if (outcome.status !== "timed_out" && timeoutId !== undefined) {
    clearTimeout(timeoutId);
  }

  return outcome;
}

export function requiresSoftwareQrFallback({
  nativeAvailable,
  nativeQrSupported,
  consecutiveNativeEmptyResults
}: {
  nativeAvailable: boolean;
  nativeQrSupported: boolean | null;
  consecutiveNativeEmptyResults: number;
}) {
  return (
    !nativeAvailable ||
    nativeQrSupported === false ||
    consecutiveNativeEmptyResults >= nativeEmptyFallbackThreshold
  );
}
