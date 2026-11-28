import { describe, expect, it } from 'vitest';
import { normalizeMerchant } from '../../src/domain/merchant';

describe('normalizeMerchant', () => {
  it('lowercases, strips accents and collapses spacing', () => {
    expect(normalizeMerchant('  Farmácia   SÃO  João ')).toBe('farmacia sao joao');
  });
});
