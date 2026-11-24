// @vitest-environment happy-dom
import { render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { App } from '../src/ui/app';

describe('App', () => {
  it('renders the app name', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'card-insights' })).toBeTruthy();
  });
});
