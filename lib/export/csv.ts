/** CSV seguro (RFC 4180 + neutraliza fórmulas de planilha). Valores em centavos viram "1234,56". */
export type CsvCell = string | number | null | undefined;

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && typeof value === "string") s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function centsToCsv(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

/** Separador ";" (Excel pt-BR) e BOM para acentos. */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(";"));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
