/// <reference types="node" />
// Reads `wrangler versions upload` output on stdin and prints its preview URLs as GITHUB_OUTPUT
// lines, so CI never hardcodes the account's workers.dev subdomain.
// Usage: npx wrangler versions upload --preview-alias pr-7 | node scripts/preview-urls.ts >> "$GITHUB_OUTPUT"
import { readFileSync } from 'node:fs';

export interface PreviewUrls {
  versionUrl?: string;
  aliasUrl?: string;
}

function urlAfter(label: string, output: string): string | undefined {
  return output.match(new RegExp(`^${label}: (https://\\S+)`, 'm'))?.[1];
}

export function parsePreviewUrls(output: string): PreviewUrls {
  const versionUrl = urlAfter('Version Preview URL', output);
  const aliasUrl = urlAfter('Version Preview Alias URL', output);
  return { ...(versionUrl && { versionUrl }), ...(aliasUrl && { aliasUrl }) };
}

export function toGithubOutput({ versionUrl, aliasUrl }: PreviewUrls): string {
  return (versionUrl ? `version_url=${versionUrl}\n` : '') + (aliasUrl ? `alias_url=${aliasUrl}\n` : '');
}

if (import.meta.main) {
  process.stdout.write(toGithubOutput(parsePreviewUrls(readFileSync(0, 'utf8'))));
}
