/** Minimal RFC 4180 reader: one record per line (no line breaks inside quotes), BOM and CRLF tolerated. */

export interface CsvRow {
  /** 1-based line in the file. */
  line: number;
  fields: string[];
}

function readLine(text: string, line: number): string[] {
  const fields: string[] = [];
  let i = 0;
  for (;;) {
    let field = '';
    if (text[i] === '"') {
      i++;
      for (;;) {
        if (i >= text.length) throw new Error(`Line ${line}: unterminated quoted field`);
        if (text[i] === '"') {
          if (text[i + 1] !== '"') break;
          i++;
        }
        field += text[i++];
      }
      i++; // closing quote
      if (i < text.length && text[i] !== ',') throw new Error(`Line ${line}: unexpected character after a closing quote`);
    } else {
      const end = text.indexOf(',', i);
      field = text.slice(i, end === -1 ? text.length : end);
      i = end === -1 ? text.length : end;
    }
    fields.push(field);
    if (i >= text.length) return fields;
    i++; // comma
  }
}

/** Splits CSV text into rows of fields, skipping blank lines. Throws naming the line on malformed quoting. */
export function readCsv(text: string): CsvRow[] {
  const rows: CsvRow[] = [];
  text.replace(/^﻿/, '').split(/\r?\n/).forEach((content, index) => {
    if (content.trim() !== '') rows.push({ line: index + 1, fields: readLine(content, index + 1) });
  });
  return rows;
}
