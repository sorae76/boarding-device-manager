import type { DeviceType, StudentSummary } from "@/lib/devices/types";

export const deviceTypes: DeviceType[] = ["phone", "tablet", "laptop", "watch", "other"];

export const manufacturerOptionsByDeviceType: Record<DeviceType, string[]> = {
  phone: ["Apple", "Samsung", "Google", "Motorola", "OnePlus", "Other"],
  tablet: ["Apple", "Samsung", "Amazon", "Lenovo", "Microsoft", "Other"],
  laptop: ["Apple", "Dell", "HP", "Lenovo", "ASUS", "Acer", "Microsoft", "Other"],
  watch: ["Apple", "Samsung", "Garmin", "Fitbit", "Other"],
  other: ["Other"]
};

export const colorOptions = [
  "Black",
  "White",
  "Silver",
  "Gray",
  "Blue",
  "Red",
  "Gold",
  "Pink",
  "Green",
  "Purple",
  "Unknown",
  "Other"
];

function assetTagPart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

export function assetTagBaseForStudent(student: Pick<StudentSummary, "first_name" | "last_name">) {
  const first = assetTagPart(student.first_name);
  const last = assetTagPart(student.last_name);
  const base = [first, last].filter(Boolean).join("-");

  return base || "STUDENT";
}

export function generateReadableAssetTag(
  student: Pick<StudentSummary, "first_name" | "last_name">,
  sequence: number
) {
  return `${assetTagBaseForStudent(student)}-${Math.max(sequence, 1)}`;
}

function normalizeAssetTag(value: string) {
  return value.trim().toLowerCase();
}

export function generateNextReadableAssetTag(
  student: Pick<StudentSummary, "first_name" | "last_name">,
  startSequence: number,
  reservedAssetTags: Iterable<string>
) {
  const reserved = new Set(Array.from(reservedAssetTags, normalizeAssetTag));
  let sequence = Math.max(startSequence, 1);
  let assetTag = generateReadableAssetTag(student, sequence);

  while (reserved.has(normalizeAssetTag(assetTag))) {
    sequence += 1;
    assetTag = generateReadableAssetTag(student, sequence);
  }

  return assetTag;
}
