import type { RegistrationReviewActionState } from "@/lib/devices/types";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateRegistrationRequestId(value: unknown) {
  return typeof value === "string" && uuidPattern.test(value) ? value : null;
}

export function normalizeReviewNote(value: unknown, required: boolean) {
  const note = typeof value === "string" ? value.trim() : "";
  if (required && !note) return { error: "A rejection note is required.", note: null };
  if (note.length > 1000) return { error: "Review note must be 1000 characters or fewer.", note: null };
  return { error: null, note: note || null };
}

export function registrationReviewError(raw: unknown) {
  const value = typeof raw === "string" ? raw : "";
  if (value.includes("registration_review_already_rejected")) return "This registration request has already been rejected.";
  if (value.includes("registration_review_already_approved")) return "This registration request has already been approved.";
  if (value.includes("registration_review_not_available")) return "This registration request is no longer available in your access scope.";
  if (value.includes("registration_review_duplicate_serial") || value.includes("23505")) return "A device with this serial number is already registered.";
  if (value.includes("registration_review_conflict")) return "This registration request was already processed. Refresh to view its current status.";
  if (value.includes("registration_review_invalid_note")) return "The review note is invalid.";
  return "The registration request could not be processed.";
}

export function reviewErrorState(message: string): RegistrationReviewActionState {
  return { status: "error", message };
}
