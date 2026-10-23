/** RFC-4180-style CSV parser with quoted commas, escaped quotes, and embedded newlines. */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(cell => cell.length > 0)) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error('CSV file contains an unclosed quoted field.');
  if (field.length || row.length) { row.push(field); if (row.some(cell => cell.length > 0)) rows.push(row); }
  return rows;
}

export function encodeCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const cell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [headers.map(cell).join(','), ...rows.map(row => headers.map(key => cell(row[key])).join(','))].join('\r\n');
}
