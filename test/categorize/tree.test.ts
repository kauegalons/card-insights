import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '../../src/categorize/tree';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const tree = (): Record<string, string[]> =>
  Object.fromEntries(
    DEFAULT_CATEGORIES.filter((c) => c.parentId === undefined).map((top) => [
      top.name,
      DEFAULT_CATEGORIES.filter((c) => c.parentId === top.id).map((c) => c.name),
    ]),
  );

describe('DEFAULT_CATEGORIES', () => {
  it('is the two-level tree from the plan, in pt-BR', () => {
    expect(tree()).toEqual({
      Transporte: ['Combustível', 'Apps de corrida', 'Estacionamento e pedágio', 'Transporte público'],
      Alimentação: ['Mercado', 'Hortifrúti', 'Padaria', 'Delivery', 'Restaurante'],
      Moradia: ['Aluguel e condomínio', 'Energia, água e gás', 'Manutenção e móveis'],
      Saúde: ['Farmácia', 'Consultas e exames'],
      Educação: ['Cursos', 'Livros'],
      Assinaturas: ['Software/Nuvem', 'Jogos', 'Streaming'],
      Compras: ['Eletrônicos', 'Vestuário e calçados'],
      'Casa e serviços': ['Telefonia e internet', 'Consultoria'],
      'Lazer e viagem': ['Passagens', 'Hospedagem', 'Passeios e eventos', 'Bares'],
      'Pets e cuidados pessoais': ['Pet shop e veterinário', 'Beleza', 'Academia'],
      'Presentes e doações': ['Presentes', 'Doações'],
      Taxas: ['IOF', 'Juros', 'Anuidade'],
    });
  });

  it('has only two levels: every parent is a top-level category', () => {
    const topIds = new Set(DEFAULT_CATEGORIES.filter((c) => c.parentId === undefined).map((c) => c.id));
    for (const c of DEFAULT_CATEGORIES) if (c.parentId !== undefined) expect(topIds.has(c.parentId)).toBe(true);
  });

  it('uses unique UUIDs, never names, as ids', () => {
    const ids = DEFAULT_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(UUID);
  });

  it('keeps the same ids on every install, so two devices seeding defaults write the same records', () => {
    const byName = (name: string) => DEFAULT_CATEGORIES.find((c) => c.name === name)?.id;
    expect(byName('Transporte')).toBe('00000000-0000-4000-8000-000000000100');
    expect(byName('Combustível')).toBe('00000000-0000-4000-8000-000000000101');
    expect(byName('Anuidade')).toBe('00000000-0000-4000-8000-000000001203');
  });
});
