export const templateColumns = [
  "student_first_name",
  "student_last_name",
  "student_number",
  "device_type",
  "manufacturer",
  "model",
  "color",
  "asset_tag",
  "serial_number",
  "status",
  "return_due_at",
  "notes"
] as const;

export const exportColumns = [
  ...templateColumns.slice(0, 11),
  "created_at",
  "updated_at",
  "notes"
] as const;

export type TemplateColumn = (typeof templateColumns)[number];

export type CsvRow = Record<TemplateColumn, string>;

export const sampleTemplateRow: CsvRow = {
  student_first_name: "Test",
  student_last_name: "Student",
  student_number: "",
  device_type: "phone",
  manufacturer: "Apple",
  model: "iPhone",
  color: "Black",
  asset_tag: "",
  serial_number: "",
  status: "checked_out",
  return_due_at: "",
  notes: "Example row"
};

export function csvEscape(value: string | null | undefined) {
  const text = value ?? "";

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function rowsToCsv(columns: readonly string[], rows: Record<string, string | null | undefined>[]) {
  return [
    columns.map(csvEscape).join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","))
  ].join("\r\n");
}

export function deviceTemplateCsv() {
  return rowsToCsv(templateColumns, [sampleTemplateRow]);
}

function parseCsvRecords(text: string) {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(field);
      if (row.some((value) => value.trim().length > 0)) {
        rows.push(row);
      }
      field = "";
      row = [];
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((value) => value.trim().length > 0)) {
    rows.push(row);
  }

  return rows;
}

export function parseDeviceCsv(text: string) {
  const records = parseCsvRecords(text);
  const headers = records[0]?.map((header) => header.trim()) ?? [];
  const missingColumns = templateColumns.filter((column) => !headers.includes(column));

  if (missingColumns.length > 0) {
    throw new Error(`CSV is missing required columns: ${missingColumns.join(", ")}`);
  }

  return records.slice(1).map((record) =>
    templateColumns.reduce<CsvRow>((row, column) => {
      const index = headers.indexOf(column);
      row[column] = (record[index] ?? "").trim();

      return row;
    }, {} as CsvRow)
  );
}
