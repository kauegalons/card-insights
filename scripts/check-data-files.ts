/// <reference types="node" />
// Privacy guard: statements and their exports (.csv, .ofx, .qfx, .qif, .pdf, .xls, .xlsx, .ods, .zip,
// also compressed, e.g. .csv.gz) may only live in test/fixtures/.
// Usage: git ls-files -z | node scripts/check-data-files.ts
//        git log -z --name-only --diff-filter=A --format= origin/main..HEAD | node scripts/check-data-files.ts
import { readFileSync } from 'node:fs';

const DATA_FILE = /\.(csv|ofx|qfx|qif|pdf|xls|xlsx|ods|zip)(\.(gz|bz2|xz|zst|7z|br))?$/i;
const FIXTURES_DIR = 'test/fixtures/';

export function findDataFilesOutsideFixtures(paths: readonly string[]): string[] {
  return paths.filter((path) => DATA_FILE.test(path) && !path.startsWith(FIXTURES_DIR));
}

if (import.meta.main) {
  const paths = readFileSync(0, 'utf8').split('\0').filter((path) => path !== '');
  const offenders = findDataFilesOutsideFixtures(paths);
  if (offenders.length > 0) {
    console.error(`Data files outside ${FIXTURES_DIR} (statements must never be committed):`);
    for (const path of offenders) console.error(`  ${path}`);
    process.exit(1);
  }
  console.log(`OK: ${paths.length} files, no data files outside ${FIXTURES_DIR}.`);
}
