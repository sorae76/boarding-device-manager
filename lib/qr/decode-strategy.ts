export const nativeEmptyFallbackThreshold = 3;

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
