/**
 * Default rules for common Brazilian merchants (spec v1 §5, ADR 007). Each is a regex over the normalized merchant
 * (lowercase, no accents, acquirer prefix already stripped). Order is priority: earlier wins (e.g. games before
 * software, so a console store isn't taken as a cloud bill). Ids are fixed UUIDs, like the default tree's.
 */
import type { Rule } from '../domain/category';
import { defaultId, defaultSubcategoryId } from './tree';

/** Priority of the first default rule; defaults step by 10. User rules (T09) go below this number, so they win. */
export const DEFAULT_RULE_PRIORITY = 1000;

const PATTERNS: readonly (readonly [string, string, string])[] = [
  ['Transporte', 'Combustível', '\\b(?:auto ?)?posto\\b|\\b(?:combustive(?:l|is)|shell|ipiranga|petrobras|br mania)\\b'],
  ['Transporte', 'Apps de corrida', '\\b(?:uber(?! ?eats)|99 ?(?:app|pop|taxi)|corridas?|cabify|indriver)\\b'],
  ['Transporte', 'Estacionamento e pedágio', '\\b(?:estacionamento|estapar|sem parar|conectcar|veloe|pedagio)\\b'],
  ['Transporte', 'Transporte público', '\\b(?:metro|sptrans|bilhete unico|cptm|onibus|brt)\\b'],
  ['Alimentação', 'Mercado', '\\b(?:super|hiper|mini)?mercado\\b(?! ?(?:livre|pago))|\\b(?:atacadao|assai|carrefour|pao de acucar)\\b'],
  ['Alimentação', 'Hortifrúti', '\\b(?:hortifrut+i|sacolao|quitanda|feira)\\b'],
  ['Alimentação', 'Padaria', '\\b(?:padaria|panificadora|panificacao|confeitaria)\\b'],
  // Brands only: a bare "delivery" also names pharmacies and restaurants that deliver.
  ['Alimentação', 'Delivery', '\\b(?:ifood|rappi|ze delivery|uber ?eats)\\b'],
  ['Alimentação', 'Restaurante', "\\b(?:restaurante|lanchonete|churrascaria|pizzaria|hamburgueria|mcdonald'?s|burger king|outback)\\b"],
  ['Moradia', 'Aluguel e condomínio', '\\b(?:aluguel|condominio|imobiliaria|quinto ?andar)\\b'],
  ['Moradia', 'Energia, água e gás', '\\b(?:enel|cemig|copel|sabesp|cedae|comgas|ultragaz|liquigas|energia|saneamento)\\b'],
  ['Moradia', 'Manutenção e móveis', '\\b(?:leroy merlin|telhanorte|madeiramadeira|moveis|materia(?:l|is) de construcao|home ?center)\\b'],
  ['Saúde', 'Farmácia', '\\b(?:farmacias?|drogarias?|drogasil|droga raia|pague menos|panvel)\\b'],
  ['Saúde', 'Consultas e exames', '\\b(?:clinica|consultorio|laboratorio|hospital|odonto\\w*|medic[oa]s?)\\b'],
  ['Educação', 'Cursos', '\\b(?:udemy|alura|coursera|escola|colegio|faculdade|universidade|cursos?)\\b'],
  ['Educação', 'Livros', '\\b(?:livraria|livros?|kindle|estante virtual)\\b'],
  ['Assinaturas', 'Jogos', '\\b(?:jogos?|games?|steam|playstation|psn|xbox|nintendo)\\b'],
  ['Assinaturas', 'Software/Nuvem', '\\b(?:github|google (?:one|cloud|storage)|microsoft|aws|dropbox|icloud|adobe|notion)\\b'],
  ['Assinaturas', 'Streaming', '\\b(?:netflix|spotify|disney|hbo ?max|globoplay|prime video|youtube premium|deezer|paramount|crunchyroll|streaming)\\b'],
  ['Compras', 'Eletrônicos', '\\b(?:kabum|eletronicos?|fast shop|magazine luiza|magalu)\\b'],
  ['Compras', 'Vestuário e calçados', '\\b(?:renner|riachuelo|c&a|zara|centauro|netshoes|hering|calcados|roupas|vestuario)\\b'],
  // Carrier names are common words: a merchant that starts as a bar ("Bar Claro") is left to Bares below.
  ['Casa e serviços', 'Telefonia e internet', '^(?!(?:bar|boteco|choperia|cervejaria|pub)\\b).*?\\b(?:vivo|claro|tim|telefonica|telecom|internet|fibra)\\b'],
  ['Casa e serviços', 'Consultoria', '\\b(?:consultoria|assessoria|contabilidade|contador)\\b'],
  ['Lazer e viagem', 'Passagens', '\\b(?:latam|gol linhas|azul linhas|passagens?|aerea|rodoviaria|buser|clickbus|decolar)\\b'],
  ['Lazer e viagem', 'Hospedagem', '\\b(?:hote(?:l|is)|pousada|hostel|airbnb|booking)\\b'],
  ['Lazer e viagem', 'Passeios e eventos', '\\b(?:ingressos?|sympla|eventim|ticketmaster|cinemas?|cinemark|teatro|museu)\\b'],
  ['Lazer e viagem', 'Bares', '\\b(?:bar|boteco|choperia|cervejaria|pub)\\b'],
  ['Pets e cuidados pessoais', 'Pet shop e veterinário', '\\b(?:pet ?shop|petz|cobasi|petlove|pet|veterinari[ao])\\b'],
  ['Pets e cuidados pessoais', 'Beleza', '\\b(?:salao|barbearia|cabeleireir[oa]|estetica|manicure|boticario|sephora|beleza)\\b'],
  ['Pets e cuidados pessoais', 'Academia', '\\b(?:academia|smart ?fit|bodytech|gympass|wellhub|crossfit)\\b'],
  ['Presentes e doações', 'Presentes', '\\b(?:presentes?|floricultura|flores)\\b'],
  ['Presentes e doações', 'Doações', '\\b(?:doac(?:ao|oes)|vakinha)\\b'],
  ['Taxas', 'IOF', '^iof\\b'],
  ['Taxas', 'Juros', '^juros\\b'],
  ['Taxas', 'Anuidade', '\\banuidade\\b'],
];

export const DEFAULT_RULES: readonly Rule[] = PATTERNS.map(([parent, sub, pattern], i) => ({
  id: defaultId('8001', i + 1),
  match: 'regex',
  pattern,
  categoryId: defaultSubcategoryId(parent, sub),
  priority: DEFAULT_RULE_PRIORITY + i * 10,
  origin: 'default',
}));
