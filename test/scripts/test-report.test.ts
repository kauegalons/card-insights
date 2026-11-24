import { describe, expect, it } from 'vitest';
import { renderTestReport, type VitestJsonReport } from '../../scripts/test-report';

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
});
