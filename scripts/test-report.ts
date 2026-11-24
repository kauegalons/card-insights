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

const cell = (text: string): string => text.replace(/\|/g, '\\|');

export function renderTestReport(report: VitestJsonReport, ctx: ReportContext): string {
  const { repo, sha } = ctx;
  const tests = report.testResults.flatMap((file) =>
    file.assertionResults.map((test) => {
      const path = relative(ctx.cwd, file.name).replace(/\\/g, '/');
      const line = test.location?.line;
      const name = cell(test.fullName);
      const url = repo && sha ? `https://github.com/${repo}/blob/${sha}/${path}${line ? `#L${line}` : ''}` : undefined;
      const error = cell((test.failureMessages?.[0] ?? '').split('\n')[0] ?? '').replace(/`/g, "'").slice(0, 160);
      return { path, status: test.status, link: url ? `[${name}](${url})` : name, error };
    }),
  );
  const count = (...statuses: string[]): number => tests.filter((t) => statuses.includes(t.status)).length;
  const failed = tests.filter((t) => t.status === 'failed');
  const passed = count('passed');
  const skipped = count('skipped', 'pending');
  const ok = failed.length === 0 && report.success;

  const out: string[] = [MARKER];
  const result = ok ? '✅ all green' : failed.length > 0 ? `❌ ${failed.length} failed` : '❌ run failed';
  out.push(`### Tests: ${result} · ${passed} passed${skipped ? ` · ${skipped} skipped` : ''}`);
  if (ctx.appUrl) out.push(`**[Open the app preview](${ctx.appUrl})**: this PR's build, to try on a phone.`);
  if (ctx.uiUrl) out.push(`**[Open the full report (Vitest UI)](${ctx.uiUrl})**: every test with its code and errors.`);
  out.push(`\n<sub>Commit ${sha ? sha.slice(0, 7) : 'local'}. Each test name links to its code at that commit.</sub>\n`);

  if (failed.length > 0) {
    out.push('| | Test | Error |', '|---|---|---|');
    for (const t of failed) out.push(`| ❌ | ${t.link} | \`${t.error}\` |`);
    out.push('');
  }

  out.push(`<details><summary>All ${tests.length} tests</summary>\n`);
  let current = '';
  for (const t of tests) {
    if (t.path !== current) out.push(`\n**${(current = t.path)}**\n`);
    out.push(`- ${ICON[t.status] ?? '•'} ${t.link}`);
  }
  out.push('\n</details>');

  // History: one row per commit, newest first, each with its own report and app, so a red run
  // stays visible after the next green one.
  const short = sha?.slice(0, 7);
  const previousHistory = ctx.previous?.split('<!-- history -->')[1]?.split('<!-- /history -->')[0] ?? '';
  const oldRows = previousHistory
    .split('\n')
    .filter((line) => line.startsWith('| [`') || line.startsWith('| `'))
    .filter((line) => !short || !line.includes(`\`${short}\``));
  const commit = sha ? (repo ? `[\`${short}\`](https://github.com/${repo}/commit/${sha})` : `\`${short}\``) : '`local`';
  const link = (label: string, url?: string): string => (url ? `[${label}](${url})` : '—');
  const status = `${ok ? '✅' : '❌'} ${passed} passed${failed.length ? `, ${failed.length} failed` : ''}`;
  const row = `| ${commit} | ${status} | ${link('report', ctx.uiVersionUrl)} | ${link('app', ctx.appVersionUrl)} |`;
  out.push("\n**History** (newest first; each commit's own Vitest UI report and app build)\n");
  out.push('<!-- history -->', '| Commit | Tests | Report | App |', '|---|---|---|---|');
  out.push(...[row, ...oldRows].slice(0, HISTORY_ROWS), '<!-- /history -->');
  return out.join('\n');
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
