export function toCsvValue(value: unknown) {
  if (value === null || value === undefined) return "";

  const text = String(value);

  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function buildCsv(
  headers: string[],
  rows: Array<Record<string, unknown>>
) {
  const headerRow = headers.map((header) => toCsvValue(header)).join(",");
  const dataRows = rows.map((row) =>
    headers.map((header) => toCsvValue(row[header])).join(",")
  );

  return [headerRow, ...dataRows].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
