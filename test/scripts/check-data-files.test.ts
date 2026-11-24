import { describe, expect, it } from 'vitest';
import { findDataFilesOutsideFixtures } from '../../scripts/check-data-files';

describe('findDataFilesOutsideFixtures', () => {
  it('reports a CSV at the repository root', () => {
    expect(findDataFilesOutsideFixtures(['README.md', 'foo.csv'])).toEqual(['foo.csv']);
  });

  it('reports OFX and PDF files in any other folder, ignoring extension case', () => {
    const paths = ['docs/statement.OFX', 'src/invoice.Pdf', 'notes/export.CSV'];
    expect(findDataFilesOutsideFixtures(paths)).toEqual(paths);
  });

  it('accepts data files inside test/fixtures/', () => {
    const paths = ['test/fixtures/nubank-card.csv', 'test/fixtures/bank/statement.ofx', 'test/fixtures/invoice.pdf'];
    expect(findDataFilesOutsideFixtures(paths)).toEqual([]);
  });

  it('reports a folder that only starts like test/fixtures', () => {
    expect(findDataFilesOutsideFixtures(['test/fixtures-old/a.csv'])).toEqual(['test/fixtures-old/a.csv']);
  });

  it('ignores files that are not statements', () => {
    expect(findDataFilesOutsideFixtures(['src/main.tsx', 'docs/csv-format.md', 'package.json'])).toEqual([]);
  });
});
