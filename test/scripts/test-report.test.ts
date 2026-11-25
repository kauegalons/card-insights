import { describe, expect, it } from 'vitest';
import { COMMENT_BUDGET, renderTestReport, type VitestJsonReport } from '../../scripts/test-report';

const CWD = '/work/card-insights';
const SHA = 'abc1234def5678900000000000000000000000ff';
const OLD_SHA = '0011223344556677889900112233445566778899';

function report(overrides: Partial<VitestJsonReport> = {}): VitestJsonReport {
  return {
    success: true,
    testResults: [
      {
        name: `${CWD}/test/money.test.ts`,
        assertionResults: [
          { fullName: 'parseBrlAmount reads thousands', status: 'passed', location: { line: 5, column: 3 } },
          { fullName: 'parseBrlAmount reads a negative', status: 'passed', location: { line: 9, column: 3 } },
        ],
      },
      {
        name: `${CWD}/test/dedupe.test.ts`,
        assertionResults: [{ fullName: 'dedupe skips a repeat', status: 'skipped' }],
      },
    ],
    ...overrides,
  };
}

const failing = report({
  success: false,
  testResults: [
    {
      name: `${CWD}/test/money.test.ts`,
      assertionResults: [
        { fullName: 'parseBrlAmount reads thousands', status: 'passed', location: { line: 5, column: 3 } },
        {
          fullName: 'parseBrlAmount a|b',
          status: 'failed',
          location: { line: 12, column: 3 },
          failureMessages: ['AssertionError: expected `1` to be 2 | x\n    at money.test.ts:13'],
        },
      ],
    },
  ],
});

const base = { cwd: CWD, repo: 'owner/card-insights', sha: SHA };

describe('renderTestReport', () => {
  it('starts with the sticky comment marker', () => {
    expect(renderTestReport(report(), base).split('\n')[0]).toBe('<!-- test-report -->');
  });

  it('shows a green header with the passed and skipped counts', () => {
    expect(renderTestReport(report(), base)).toContain('### Tests: ✅ all green · 2 passed · 1 skipped');
  });

  it('shows a red header and a row per failed test with the first error line escaped', () => {
    const md = renderTestReport(failing, base);
    expect(md).toContain('### Tests: ❌ 1 failed · 1 passed');
    expect(md).toContain(
      `| ❌ | [parseBrlAmount a\\|b](https://github.com/owner/card-insights/blob/${SHA}/test/money.test.ts#L12) | \`AssertionError: expected '1' to be 2 \\| x\` |`,
    );
  });

  it('is red when Vitest reports failure even with no failed test (a file that does not load)', () => {
    expect(renderTestReport(report({ success: false }), base)).toContain('### Tests: ❌');
  });

  it('links each test to its line at the commit', () => {
    expect(renderTestReport(report(), base)).toContain(
      `- ✅ [parseBrlAmount reads a negative](https://github.com/owner/card-insights/blob/${SHA}/test/money.test.ts#L9)`,
    );
  });

  it('shows plain names when the repository and commit are unknown', () => {
    const md = renderTestReport(report(), { cwd: CWD });
    expect(md).toContain('- ✅ parseBrlAmount reads thousands');
    expect(md).not.toContain('https://github.com');
  });

  it('links the app preview and the Vitest UI when their URLs are given', () => {
    const md = renderTestReport(report(), {
      ...base,
      appUrl: 'https://pr-7-card-insights.example.workers.dev',
      uiUrl: 'https://pr-7-card-insights-tests.example.workers.dev',
    });
    expect(md).toContain('[Open the app preview](https://pr-7-card-insights.example.workers.dev)');
    expect(md).toContain('[Open the full report (Vitest UI)](https://pr-7-card-insights-tests.example.workers.dev)');
  });

  it('omits the preview links when there are no URLs (fork PRs, previews disabled)', () => {
    const md = renderTestReport(report(), base);
    expect(md).not.toContain('app preview');
    expect(md).not.toContain('Vitest UI)');
  });

  it('adds a history row for this commit with its own report and app links', () => {
    const md = renderTestReport(report(), {
      ...base,
      uiVersionUrl: 'https://aaaa1111-card-insights-tests.example.workers.dev',
      appVersionUrl: 'https://bbbb2222-card-insights.example.workers.dev',
    });
    expect(md).toContain(
      `| [\`abc1234\`](https://github.com/owner/card-insights/commit/${SHA}) | ✅ 2 passed | [report](https://aaaa1111-card-insights-tests.example.workers.dev) | [app](https://bbbb2222-card-insights.example.workers.dev) |`,
    );
  });

  it('keeps the rows of the previous comment below the new one and replaces a row for the same commit', () => {
    const previous = renderTestReport(failing, { ...base, sha: OLD_SHA });
    const again = renderTestReport(report(), { ...base, previous });
    const md = renderTestReport(report(), { ...base, previous: again });
    const rows = md.split('\n').filter((line) => line.startsWith('| [`'));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('`abc1234`');
    expect(rows[1]).toContain('`0011223`');
    expect(rows[1]).toContain('❌ 1 passed, 1 failed');
  });

  it('keeps at most 30 history rows', () => {
    let previous = '';
    for (let i = 0; i < 35; i++) {
      previous = renderTestReport(report(), { ...base, sha: String(i).padStart(7, '0').padEnd(40, '0'), previous });
    }
    const rows = previous.split('\n').filter((line) => line.startsWith('| [`'));
    expect(rows).toHaveLength(30);
  });

  it('counts todo tests in the header so it adds up to the total', () => {
    const md = renderTestReport(
      report({
        testResults: [
          {
            name: `${CWD}/test/money.test.ts`,
            assertionResults: [
              { fullName: 'a', status: 'passed' },
              { fullName: 'b', status: 'todo' },
              { fullName: 'c', status: 'skipped' },
            ],
          },
        ],
      }),
      base,
    );
    expect(md).toContain('### Tests: ✅ all green · 1 passed · 1 skipped · 1 todo');
    expect(md).toContain('All 3 tests');
  });
});

describe('renderTestReport escaping', () => {
  const named = (fullName: string, failureMessages?: string[]): VitestJsonReport => ({
    success: !failureMessages,
    testResults: [
      {
        name: `${CWD}/test/x.test.ts`,
        assertionResults: [
          { fullName, status: failureMessages ? 'failed' : 'passed', ...(failureMessages && { failureMessages }) },
        ],
      },
    ],
  });

  it('collapses whitespace and newlines in a test name to one line', () => {
    const md = renderTestReport(named('reads\n\n| `abc` |  a   b'), { cwd: CWD });
    expect(md).toContain(String.raw`- ✅ reads \| \`abc\` \| a b`);
  });

  it('escapes link and HTML characters in a test name', () => {
    const md = renderTestReport(named('a [b](c) <d>'), { cwd: CWD });
    expect(md).toContain(String.raw`- ✅ a \[b\]\(c\) \<d\>`);
  });

  it('strips HTML comment markers so a test name cannot fake the history block', () => {
    const md = renderTestReport(named('x <!-- history --> y <!-- /history -->'), { cwd: CWD });
    expect(md.match(/<!-- history -->/g)).toHaveLength(1);
    expect(md.match(/<!-- \/history -->/g)).toHaveLength(1);
    const again = renderTestReport(report(), { ...base, previous: md });
    expect(again.split('\n').filter((line) => line.startsWith('| [`') || line.startsWith('| `'))).toHaveLength(2);
  });

  it('keeps an error on one line, without comment markers, with pipes escaped', () => {
    const md = renderTestReport(named('t', ['Error: a | b <!-- c -->\n    at x']), { cwd: CWD });
    expect(md).toContain('| ❌ | t | `Error: a ' + String.raw`\|` + ' b c` |');
  });
});

describe('renderTestReport size budget', () => {
  const many = (count: number, failEvery: number): VitestJsonReport => ({
    success: false,
    testResults: Array.from({ length: count / 10 }, (_, f) => ({
      name: `${CWD}/test/area-${f}/some-long-module-name-${f}.test.ts`,
      assertionResults: Array.from({ length: 10 }, (_, t) => {
        const i = f * 10 + t;
        const failed = i % failEvery === 0;
        return {
          fullName: `module ${f} behaves correctly when the input is case number ${i} of a long synthetic series`,
          status: failed ? 'failed' : 'passed',
          location: { line: t * 10 + 1, column: 3 },
          ...(failed && { failureMessages: [`AssertionError: expected ${i} to equal ${i + 1}`] }),
        };
      }),
    })),
  });

  it('stays under the comment budget with 1000 tests and keeps every failure', () => {
    const md = renderTestReport(many(1000, 97), base);
    expect(md.length).toBeLessThanOrEqual(COMMENT_BUDGET);
    expect(COMMENT_BUDGET).toBeLessThan(65536);
    for (const i of [0, 97, 194, 970]) expect(md).toContain(`case number ${i} of`);
    expect(md).toContain('All 1000 tests');
    expect(md).toContain('<!-- history -->');
  });

  it('stays under the budget when 1000 tests all fail, keeping as many failures as fit', () => {
    const md = renderTestReport(many(1000, 1), base);
    expect(md.length).toBeLessThanOrEqual(COMMENT_BUDGET);
    expect(md).toContain('case number 0 of');
    expect(md).toContain('more failed tests');
    expect(md).toContain('<!-- /history -->');
  });

  it('keeps the full linked list when it fits', () => {
    expect(renderTestReport(report(), base)).not.toContain('shortened');
  });
});
