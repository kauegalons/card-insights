import { describe, expect, it } from 'vitest';
import { formatBrl, parseBrlAmount } from '../../src/domain/money';

describe('parseBrlAmount', () => {
  it('parses an amount with a thousands separator into cents', () => {
    expect(parseBrlAmount('1.234,56')).toBe(123456);
  });

  it('parses several thousands groups', () => {
    expect(parseBrlAmount('12.345.678,90')).toBe(1234567890);
  });

  it('parses an amount without a thousands separator', () => {
    expect(parseBrlAmount('60,00')).toBe(6000);
    expect(parseBrlAmount('1234,56')).toBe(123456);
    expect(parseBrlAmount('0,07')).toBe(7);
  });

  it('parses a negative amount with a space after the sign', () => {
    expect(parseBrlAmount('- 1.234,56')).toBe(-123456);
  });

  it('parses a negative amount without a space after the sign', () => {
    expect(parseBrlAmount('-49,90')).toBe(-4990);
  });

  it('ignores surrounding whitespace', () => {
    expect(parseBrlAmount('  149,90 ')).toBe(14990);
  });

  it('returns 0, not -0, for a negative zero', () => {
    expect(Object.is(parseBrlAmount('- 0,00'), 0)).toBe(true);
  });

  it.each([
    ['', 'empty'],
    ['abc', 'letters'],
    ['1234.56', 'dot as decimal separator'],
    ['1,234.56', 'en-US format'],
    ['60', 'no decimals'],
    ['60,0', 'one decimal'],
    ['60,000', 'three decimals'],
    ['1.23,45', 'bad thousands group'],
    ['1234.567,89', 'misplaced thousands separator'],
    ['--10,00', 'double sign'],
    ['10,00-', 'trailing sign'],
    ['R$ 10,00', 'currency symbol'],
  ])('throws a clear error naming the input for %j (%s)', (input) => {
    expect(() => parseBrlAmount(input)).toThrow(`Invalid BRL amount: ${JSON.stringify(input)}`);
  });

  it('throws when the amount is too large to be exact', () => {
    expect(() => parseBrlAmount('999.999.999.999.999,99')).toThrow('Invalid BRL amount');
  });
});

describe('formatBrl', () => {
  // Intl pt-BR puts a no-break space (U+00A0) between "R$" and the number; pinned here.
  it('formats cents as pt-BR currency with thousands and decimals', () => {
    expect(formatBrl(123456)).toBe('R$ 1.234,56');
  });

  it('formats small amounts with two decimals', () => {
    expect(formatBrl(7)).toBe('R$ 0,07');
    expect(formatBrl(0)).toBe('R$ 0,00');
  });

  it('formats negative amounts with a leading minus', () => {
    expect(formatBrl(-123456)).toBe('-R$ 1.234,56');
  });

  it('round-trips with parseBrlAmount', () => {
    expect(parseBrlAmount(formatBrl(98765432).replace('R$ ', ''))).toBe(98765432);
  });

  it('rejects a value that is not integer cents', () => {
    expect(() => formatBrl(12.5)).toThrow('Invalid cents: 12.5');
  });
});
