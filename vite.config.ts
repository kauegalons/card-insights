/// <reference types="node" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'node',
    includeTaskLocation: true, // lets the PR report link each test to its line
    // In CI: GitHub annotations, a JSON report for the PR comment, and the Vitest UI as a static
    // site (reports/html) published per PR.
    reporters: process.env.GITHUB_ACTIONS
      ? ['default', 'github-actions', ['json', { outputFile: 'reports/tests.json' }], ['html', { outputDir: 'reports/html' }]]
      : ['default'],
  },
});
