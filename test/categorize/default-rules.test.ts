import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../../src/categorize/default-rules';
import { categorize, validateRule } from '../../src/categorize/rules';
import { DEFAULT_CATEGORIES } from '../../src/categorize/tree';
import { nubankCardCsv } from '../../src/import/adapters/nubank-card-csv';

const text = readFileSync(new URL('../fixtures/categorize-merchants.csv', import.meta.url), 'utf8');
const rows = nubankCardCsv.parse(text, { fileName: 'categorize-merchants.csv' });
const nameOf = (id: string | undefined) =>
  id === undefined ? 'Sem categoria' : DEFAULT_CATEGORIES.find((c) => c.id === id)?.name;

describe('DEFAULT_RULES', () => {
  it.each([
    ['Posto Exemplo', 'Combustível'],
    ['Dl*Corridas Exemplo', 'Apps de corrida'],
    ['Pg *Farmacia Exemplo', 'Farmácia'],
    ['Loja de Jogos Exemplo', 'Jogos'],
    ['Pet Shop Exemplo', 'Pet shop e veterinário'],
    ['Padaria Exemplo', 'Padaria'],
    ['Wl *Supermercado Exemplo', 'Mercado'],
    ['Hortifruti Exemplo', 'Hortifrúti'],
    ['Estacionamento Exemplo', 'Estacionamento e pedágio'],
    ['Restaurante Exemplo', 'Restaurante'],
    ['Dl*Streaming Exemplo', 'Streaming'],
    ['Htm*Hotel Exemplo', 'Hospedagem'],
    ['Livraria Exemplo', 'Livros'],
    ['Academia Exemplo', 'Academia'],
    ['Barbearia Exemplo', 'Beleza'],
    ['Drogaria Exemplo - Parcela 1/2', 'Farmácia'],
    ['IOF de compra internacional', 'IOF'],
    ['Juros de dívida encerrada', 'Juros'],
    ['Anuidade Exemplo', 'Anuidade'],
    ['Cafe Exemplo I*Vmt*Cielo', 'Sem categoria'],
    ['Loja Exemplo', 'Sem categoria'],
    ['Uber Eats Exemplo', 'Delivery'],
    ['Drogaria Delivery Exemplo', 'Farmácia'],
    ['Bar Claro Exemplo', 'Bares'],
    ['Uber Viagem Exemplo', 'Apps de corrida'],
    ['Claro Telefonia Exemplo', 'Telefonia e internet'],
  ])('puts the fixture merchant %s in %s', (rawTitle, expected) => {
    const row = rows.find((r) => r.rawTitle === rawTitle);
    expect(row).toBeDefined();
    expect(nameOf(categorize(row ? [row] : [], DEFAULT_RULES)[0]?.categoryId)).toBe(expected);
  });

  it('are valid default rules pointing at default subcategories, with unique UUID ids', () => {
    const subIds = new Set(DEFAULT_CATEGORIES.filter((c) => c.parentId !== undefined).map((c) => c.id));
    for (const r of DEFAULT_RULES) {
      expect(() => validateRule(r)).not.toThrow();
      expect(subIds.has(r.categoryId)).toBe(true);
      expect(r.origin).toBe('default');
    }
    expect(new Set(DEFAULT_RULES.map((r) => r.id)).size).toBe(DEFAULT_RULES.length);
    expect(DEFAULT_RULES[0]?.id).toBe('00000000-0000-4000-8001-000000000001');
  });

  it('does not take Mercado Livre or Mercado Pago as groceries', () => {
    const out = categorize([{ merchant: 'Mercado Livre' }, { merchant: 'Mercado Pago Exemplo' }], DEFAULT_RULES);
    expect(out.map((r) => r.categoryId)).toEqual([undefined, undefined]);
  });
});
