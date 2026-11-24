import { describe, expect, it } from 'vitest';
import { parsePreviewUrls, toGithubOutput } from '../../scripts/preview-urls';

// Shape of `wrangler versions upload --preview-alias pr-7` output; subdomain invented.
const UPLOAD_OUTPUT = [
  ' ⛅️ wrangler 4.168.0',
  '───────────────────',
  'Total Upload: 0.50 KiB / gzip: 0.30 KiB',
  'Uploaded card-insights (1.20 sec)',
  'Worker Version ID: 1a2b3c4d-0000-4000-8000-000000000000',
  'Version Preview URL: https://1a2b3c4d-card-insights.example-sub.workers.dev',
  'Version Preview Alias URL: https://pr-7-card-insights.example-sub.workers.dev',
  '',
  'To deploy this version to production traffic use the command wrangler versions deploy',
].join('\n');

describe('parsePreviewUrls', () => {
  it('reads the version and alias preview URLs from wrangler output', () => {
    expect(parsePreviewUrls(UPLOAD_OUTPUT)).toEqual({
      versionUrl: 'https://1a2b3c4d-card-insights.example-sub.workers.dev',
      aliasUrl: 'https://pr-7-card-insights.example-sub.workers.dev',
    });
  });

  it('returns no URLs when preview URLs are disabled or the upload failed', () => {
    expect(parsePreviewUrls('Uploaded card-insights (1.20 sec)\nWorker Version ID: 1a2b3c4d')).toEqual({});
  });

  it('formats the URLs as GITHUB_OUTPUT lines', () => {
    expect(toGithubOutput(parsePreviewUrls(UPLOAD_OUTPUT))).toBe(
      'version_url=https://1a2b3c4d-card-insights.example-sub.workers.dev\nalias_url=https://pr-7-card-insights.example-sub.workers.dev\n',
    );
    expect(toGithubOutput({})).toBe('');
  });
});
