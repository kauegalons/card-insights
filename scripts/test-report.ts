/// <reference types="node" />
// Turns Vitest's JSON report into the sticky Markdown comment on the PR.
// Usage: node scripts/test-report.ts reports/tests.json
//   env: GITHUB_REPOSITORY, HEAD_SHA, APP_URL, UI_URL, APP_VERSION_URL, UI_VERSION_URL,
//        PREVIOUS (file with the previous comment body, to keep its history rows)
import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';

export interface VitestJsonReport {
  success: boolean;
  testResults: {
    name: string;
    assertionResults: {
      fullName: string;
      status: string;
      location?: { line: number; column: number };
      failureMessages?: string[];
    }[];
  }[];
}

export interface ReportContext {
  cwd: string;
  repo?: string;
  sha?: string;
  appUrl?: string;
  uiUrl?: string;
  appVersionUrl?: string;
  uiVersionUrl?: string;
  previous?: string;
}

const MARKER = '<!-- test-report -->';
const HISTORY_ROWS = 30;
const ICON: Record<string, string> = { passed: '✅', failed: '❌', skipped: '⏭️', pending: '⏭️', todo: '📝' };

/** GitHub rejects comment bodies over 65,536 characters; keep a margin. */
export const COMMENT_BUDGET = 60_000;

/** One line, no HTML comment markers: a test name or error can never break the table or fake the history block. */
function oneLine(text: string): string {
  let out = text;
  for (let before = ''; before !== out; ) out = (before = out).replace(/<!--|-->/g, '');
  return out.replace(/\s+/g, ' ').trim();
}
const escapeMarkdown = (text: string): string => oneLine(text).replace(/[\\`[\]()<>|]/g, '\\$&');
// Inside a code span only the table pipe needs escaping; backticks would close the span.
const codeCell = (text: string): string => oneLine(text).slice(0, 160).replace(/`/g, "'").replace(/\|/g, '\\|');

/** How much of the test list fits: every test linked, every test by name, only tests that did not pass, none. */
type Detail = 'linked' | 'names' | 'not-passed' | 'none';
const DETAILS: readonly Detail[] = ['linked', 'names', 'not-passed', 'none'];

interface Test {
  path: string;
  status: string;
  name: string;
  link: string;
  error: string;
}

export function renderTestReport(report: VitestJsonReport, ctx: ReportContext): string {
  const { repo, sha } = ctx;
  const tests: Test[] = report.testResults.flatMap((file) =>
    file.assertionResults.map((test) => {
      const path = relative(ctx.cwd, file.name).replace(/\\/g, '/');
      const line = test.location?.line;
      const name = escapeMarkdown(test.fullName);
      const url = repo && sha ? `https://github.com/${repo}/blob/${sha}/${path}${line ? `#L${line}` : ''}` : undefined;
      const error = codeCell(test.failureMessages?.[0]?.split('\n')[0] ?? '');
      return { path, status: test.status, name, link: url ? `[${name}](${url})` : name, error };
    }),
  );
  const failed = tests.filter((t) => t.status === 'failed');
  const passed = tests.filter((t) => t.status === 'passed').length;
  const todo = tests.filter((t) => t.status === 'todo').length;
  const skipped = tests.length - passed - failed.length - todo; // skipped, pending and any other status
  const ok = failed.length === 0 && report.success;

  const head: string[] = [MARKER];
  const result = ok ? '✅ all green' : failed.length > 0 ? `❌ ${failed.length} failed` : '❌ run failed';
  head.push(
    `### Tests: ${result} · ${passed} passed${skipped ? ` · ${skipped} skipped` : ''}${todo ? ` · ${todo} todo` : ''}`,
  );
  if (ctx.appUrl) head.push(`**[Open the app preview](${ctx.appUrl})**: this PR's build, to try on a phone.`);
  if (ctx.uiUrl) head.push(`**[Open the full report (Vitest UI)](${ctx.uiUrl})**: every test with its code and errors.`);
  head.push(`\n<sub>Commit ${sha ? sha.slice(0, 7) : 'local'}. Each test name links to its code at that commit.</sub>\n`);

  const history = renderHistory(ctx, ok, passed, failed.length);

  const render = (detail: Detail, maxFailures: number): string => {
    const out = [...head];
    if (failed.length > 0) {
      out.push('| | Test | Error |', '|---|---|---|');
      for (const t of failed.slice(0, maxFailures)) out.push(`| ❌ | ${t.link} | \`${t.error}\` |`);
      const hidden = failed.length - maxFailures;
      if (hidden > 0) out.push(`| ❌ | … ${hidden} more failed tests: see the full report | |`);
      out.push('');
    }
    if (detail !== 'linked') out.push("<sub>Test list shortened to fit GitHub's comment size limit.</sub>\n");
    out.push(...renderTestList(tests, detail), ...history);
    return out.join('\n');
  };

  for (const detail of DETAILS) {
    const md = render(detail, failed.length);
    if (md.length <= COMMENT_BUDGET) return md;
  }
  // Even with no list the failures do not fit: keep as many as fit, first ones first.
  let low = 0;
  let high = failed.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (render('none', mid).length <= COMMENT_BUDGET) low = mid;
    else high = mid - 1;
  }
  return render('none', low);
}

function renderTestList(tests: readonly Test[], detail: Detail): string[] {
  const out = [`<details><summary>All ${tests.length} tests</summary>\n`];
  if (detail === 'none') return [...out, 'Too many to list here: see the full report.', '\n</details>'];
  const byFile = new Map<string, Test[]>();
  for (const t of tests) {
    const list = byFile.get(t.path);
    if (list) list.push(t);
    else byFile.set(t.path, [t]);
  }
  for (const [path, fileTests] of byFile) {
    const notPassed = fileTests.filter((t) => t.status !== 'passed');
    const shown = detail === 'not-passed' ? notPassed : fileTests;
    const passedHere = fileTests.length - notPassed.length;
    const note = detail === 'not-passed' && passedHere > 0 ? ` (${passedHere} passed)` : '';
    out.push(`\n**${path}**${note}\n`);
    for (const t of shown) out.push(`- ${ICON[t.status] ?? '•'} ${detail === 'linked' ? t.link : t.name}`);
  }
  out.push('\n</details>');
  return out;
}

// History: one row per commit, newest first, each with its own report and app, so a red run
// stays visible after the next green one.
function renderHistory(ctx: ReportContext, ok: boolean, passed: number, failed: number): string[] {
  const { repo, sha } = ctx;
  const short = sha?.slice(0, 7);
  const previousHistory = ctx.previous?.split('<!-- history -->')[1]?.split('<!-- /history -->')[0] ?? '';
  const oldRows = previousHistory
    .split('\n')
    .filter((line) => line.startsWith('| [`') || line.startsWith('| `'))
    .filter((line) => !short || !line.includes(`\`${short}\``));
  const commit = sha ? (repo ? `[\`${short}\`](https://github.com/${repo}/commit/${sha})` : `\`${short}\``) : '`local`';
  const link = (label: string, url?: string): string => (url ? `[${label}](${url})` : '—');
  const status = `${ok ? '✅' : '❌'} ${passed} passed${failed ? `, ${failed} failed` : ''}`;
  const row = `| ${commit} | ${status} | ${link('report', ctx.uiVersionUrl)} | ${link('app', ctx.appVersionUrl)} |`;
  return [
    "\n**History** (newest first; each commit's own Vitest UI report and app build)\n",
    '<!-- history -->',
    '| Commit | Tests | Report | App |',
    '|---|---|---|---|',
    ...[row, ...oldRows].slice(0, HISTORY_ROWS),
    '<!-- /history -->',
  ];
}

if (import.meta.main) {
  const env = process.env;
  const file = process.argv[2] ?? 'reports/tests.json';
  const report = JSON.parse(readFileSync(file, 'utf8')) as VitestJsonReport;
  const optional = (key: string, value: string | undefined): Partial<ReportContext> => (value ? { [key]: value } : {});
  const previous = env.PREVIOUS && existsSync(env.PREVIOUS) ? readFileSync(env.PREVIOUS, 'utf8') : undefined;
  const ctx: ReportContext = {
    cwd: process.cwd(),
    ...optional('repo', env.GITHUB_REPOSITORY),
    ...optional('sha', env.HEAD_SHA),
    ...optional('appUrl', env.APP_URL),
    ...optional('uiUrl', env.UI_URL),
    ...optional('appVersionUrl', env.APP_VERSION_URL),
    ...optional('uiVersionUrl', env.UI_VERSION_URL),
    ...optional('previous', previous),
  };
  console.log(renderTestReport(report, ctx));
}
