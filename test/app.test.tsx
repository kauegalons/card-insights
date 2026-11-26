// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/ui/app';

afterEach(cleanup);

describe('App', () => {
  it('renders the app name with React', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'card-insights' })).toBeTruthy();
  });
});
