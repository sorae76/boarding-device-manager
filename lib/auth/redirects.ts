export const DEFAULT_APP_PATH = "/app/residences";

export function getSafeAppNextPath(value: string | null) {
  if (
    !value ||
    value.includes("\\") ||
    (value !== "/app" && !value.startsWith("/app/"))
  ) {
    return DEFAULT_APP_PATH;
  }

  return value;
}
