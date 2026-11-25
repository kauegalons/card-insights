import { describe, expect, it } from 'vitest';
import { readCsv } from '../../src/import/csv';

describe('readCsv', () => {
  it('splits rows into fields and numbers each row by its line in the file', () => {
    expect(readCsv('a,b,c\n1,2,3\n')).toEqual([
      { line: 1, fields: ['a', 'b', 'c'] },
      { line: 2, fields: ['1', '2', '3'] },
    ]);
  });

  it('keeps commas inside quoted fields and unescapes doubled quotes', () => {
    expect(readCsv('2026-10-21,"Loja ""Exemplo"", Centro","1.234,56"')).toEqual([
      { line: 1, fields: ['2026-10-21', 'Loja "Exemplo", Centro', '1.234,56'] },
    ]);
  });

  it('strips a BOM and accepts CRLF line endings', () => {
    expect(readCsv('﻿a,b\r\n1,2\r\n')).toEqual([
      { line: 1, fields: ['a', 'b'] },
      { line: 2, fields: ['1', '2'] },
    ]);
  });

  it('skips blank lines but keeps the line numbers of the rows after them', () => {
    expect(readCsv('a,b\n\n1,2\n\n')).toEqual([
      { line: 1, fields: ['a', 'b'] },
      { line: 3, fields: ['1', '2'] },
    ]);
  });

  it('returns no rows for an empty text', () => {
    expect(readCsv('')).toEqual([]);
  });

  it('throws naming the line when a quoted field is not closed', () => {
    expect(() => readCsv('a,b\n1,"2,00\n')).toThrow('Line 2: unterminated quoted field');
  });

  it('throws naming the line when text follows a closing quote', () => {
    expect(() => readCsv('a,"b"x')).toThrow('Line 1: unexpected character after a closing quote');
  });
});
