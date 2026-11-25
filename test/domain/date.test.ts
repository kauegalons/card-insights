import { describe, expect, it } from 'vitest';
import { parseIsoDate } from '../../src/domain/date';

describe('parseIsoDate', () => {
  it('returns a valid ISO date unchanged, with no time zone shift', () => {
    expect(parseIsoDate('2026-10-14')).toBe('2026-10-14');
    expect(parseIsoDate('2026-01-01')).toBe('2026-01-01');
  });

  it('accepts 29 February in a leap year', () => {
    expect(parseIsoDate('2028-02-29')).toBe('2028-02-29');
  });

  it('ignores surrounding whitespace', () => {
    expect(parseIsoDate(' 2026-12-31 ')).toBe('2026-12-31');
  });

  it.each([
    ['', 'empty'],
    ['14/10/2026', 'pt-BR format'],
    ['2026-10-14T00:00:00Z', 'with time'],
    ['2026-1-4', 'no zero padding'],
    ['2026-13-01', 'month 13'],
    ['2026-04-31', 'day 31 in April'],
    ['2026-02-29', '29 February in a common year'],
    ['2100-02-29', '29 February in a century common year'],
    ['2026-00-10', 'month 0'],
    ['2026-10-00', 'day 0'],
  ])('throws a clear error naming the input for %j (%s)', (input) => {
    expect(() => parseIsoDate(input)).toThrow(`Invalid date: ${JSON.stringify(input)}`);
  });
});
