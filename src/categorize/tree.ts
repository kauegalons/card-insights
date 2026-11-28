/** Default two-level category tree (spec v1 §5). Names are pt-BR: they are shown in the UI and the user can edit them. */
import type { Category } from '../domain/category';

/**
 * Fixed UUID for default record `n` (spec v1 §5): every install ships the same ids, so two devices seeding the
 * defaults write the same records instead of duplicates. The id is a constant, never derived from a name (ADR 009).
 * `variant` keeps categories (`8000`) and rules (`8001`) apart.
 */
export function defaultId(variant: '8000' | '8001', n: number): string {
  return `00000000-0000-4000-${variant}-${String(n).padStart(12, '0')}`;
}

const TREE: readonly (readonly [string, readonly string[]])[] = [
  ['Transporte', ['Combustível', 'Apps de corrida', 'Estacionamento e pedágio', 'Transporte público']],
  ['Alimentação', ['Mercado', 'Hortifrúti', 'Padaria', 'Delivery', 'Restaurante']],
  ['Moradia', ['Aluguel e condomínio', 'Energia, água e gás', 'Manutenção e móveis']],
  ['Saúde', ['Farmácia', 'Consultas e exames']],
  ['Educação', ['Cursos', 'Livros']],
  ['Assinaturas', ['Software/Nuvem', 'Jogos', 'Streaming']],
  ['Compras', ['Eletrônicos', 'Vestuário e calçados']],
  ['Casa e serviços', ['Telefonia e internet', 'Consultoria']],
  ['Lazer e viagem', ['Passagens', 'Hospedagem', 'Passeios e eventos', 'Bares']],
  ['Pets e cuidados pessoais', ['Pet shop e veterinário', 'Beleza', 'Academia']],
  ['Presentes e doações', ['Presentes', 'Doações']],
  ['Taxas', ['IOF', 'Juros', 'Anuidade']],
];

/** Category `i` (1-based) has id number `i * 100`; its subcategory `j` (1-based) has `i * 100 + j`. */
export const DEFAULT_CATEGORIES: readonly Category[] = TREE.flatMap(([name, subs], i) => {
  const id = defaultId('8000', (i + 1) * 100);
  return [{ id, name }, ...subs.map((sub, j) => ({ id: defaultId('8000', (i + 1) * 100 + j + 1), name: sub, parentId: id }))];
});

/** Id of the default subcategory `sub` under `parent`; throws if the tree has no such pair. */
export function defaultSubcategoryId(parent: string, sub: string): string {
  const parentId = DEFAULT_CATEGORIES.find((c) => c.name === parent && c.parentId === undefined)?.id;
  const id = DEFAULT_CATEGORIES.find((c) => c.name === sub && c.parentId === parentId && parentId !== undefined)?.id;
  if (id === undefined) throw new Error(`No default subcategory "${parent} → ${sub}"`);
  return id;
}
