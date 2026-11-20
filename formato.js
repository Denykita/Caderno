/**
 * Formato do caderno — parte pura, compartilhada entre Node e navegador.
 *
 * Um item = um arquivo .md com frontmatter YAML simples:
 *   - bloco entre --- e --- no topo;
 *   - uma linha por campo: `chave: valor`;
 *   - listas em linha: `tags: [salmão, grelhado]` ou em bloco (`- item`);
 *   - valores com dois-pontos, vírgula ou colchete vão entre aspas.
 * O corpo é markdown. Ingredientes ficam sob `## Ingredientes`, como lista.
 *
 * `lib/receitas.mjs` reexporta estas funções e cuida só do disco.
 */

/** Ordem em que os campos aparecem no arquivo. */
export const ORDEM_CAMPOS = [
  'titulo',
  'categoria',
  'tempo',
  'porcoes',
  'tags',
  'resumo',
  'fonte',
  'criado',
  'atualizado',
];

/** Remove acentos e caixa alta — base de toda comparação de busca. */
export function norm(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Identificador estável a partir do título. */
export function slug(texto) {
  const s = norm(texto)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || 'item';
}

const precisaAspas = (v) =>
  /^\s|\s$|^\d+$|^[-\[\]{}&*!|>'"%@`,]|:\s|#|^(true|false|null|yes|no|~)$/i.test(v);

function escalar(valor, emLista = false) {
  const v = String(valor ?? '').trim();
  if (!precisaAspas(v) && !(emLista && /[,[\]]/.test(v))) return v;
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function lista(valores) {
  return `[${valores.map((v) => escalar(v, true)).join(', ')}]`;
}

function desaspas(bruto) {
  const v = String(bruto ?? '').trim();
  if (v.length > 1 && (v.startsWith('"') || v.startsWith("'"))) {
    const q = v[0];
    if (v.endsWith(q)) {
      return v
        .slice(1, -1)
        .replace(/\\(["'\\])/g, '$1');
    }
  }
  return v;
}

function dividirLista(bruto) {
  const interno = bruto.trim().replace(/^\[/, '').replace(/\]$/, '');
  const out = [];
  let atual = '';
  let aspas = null;
  for (const ch of interno) {
    if (aspas) {
      if (ch === aspas) aspas = null;
      else atual += ch;
    } else if (ch === '"' || ch === "'") {
      aspas = ch;
    } else if (ch === ',') {
      out.push(atual);
      atual = '';
    } else {
      atual += ch;
    }
  }
  out.push(atual);
  return out.map(desaspas).filter((v) => v !== '');
}

/** Lê o bloco de frontmatter. Tolerante: linha inválida é ignorada. */
export function lerFrontmatter(bloco) {
  const meta = {};
  const linhas = String(bloco).split(/\r?\n/);
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (!linha.trim() || linha.trim().startsWith('#')) continue;
    const m = linha.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const chave = m[1];
    const valor = m[2].trim();

    if (valor === '' || valor === '~' || valor === 'null') {
      // Pode ser lista em bloco logo abaixo.
      const itens = [];
      let j = i + 1;
      while (j < linhas.length && /^\s*-\s+/.test(linhas[j])) {
        itens.push(desaspas(linhas[j].replace(/^\s*-\s+/, '')));
        j++;
      }
      meta[chave] = itens.length ? itens : '';
      if (itens.length) i = j - 1;
      continue;
    }
    if (valor.startsWith('[')) {
      meta[chave] = valor.endsWith(']') ? dividirLista(valor) : [desaspas(valor.slice(1))];
      continue;
    }
    meta[chave] = desaspas(valor);
  }
  return meta;
}

/** Separa frontmatter e corpo. Funciona também com .md sem frontmatter. */
export function separar(texto) {
  const original = String(texto ?? '').replace(/^\uFEFF/, '');
  const m = original.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!m) return { meta: {}, corpo: original };
  return { meta: lerFrontmatter(m[1]), corpo: original.slice(m[0].length) };
}

/** Ingredientes = linhas de lista da seção "Ingredientes" (ou "Ingredientes e temperos"). */
export function extrairIngredientes(corpo) {
  const out = [];
  let dentro = false;
  for (const linha of String(corpo).split(/\r?\n/)) {
    const h = linha.match(/^#{2,4}\s+(.+?)\s*$/);
    if (h) {
      dentro = /^ingredientes?\b|^ingredientes e/i.test(norm(h[1]).trim());
      continue;
    }
    if (!dentro) continue;
    const t = linha.trim();
    const m = t.match(/^(?:[-*+]|\d+[.)])\s+(.+)$/);
    if (m) out.push(m[1].trim());
  }
  return [...new Set(out)];
}

/** Minutos aproximados a partir de "15 min", "1 h 30", "50 a 70 min" (usa o menor). */
export function parseTempo(tempo) {
  const t = norm(tempo);
  if (!t) return 0;

  const faixa = t.match(/(\d+)\s*(?:a|–|—|-|até|ate)\s*(\d+)\s*(min|h)/);
  if (faixa) return Number(faixa[1]) * (faixa[3] === 'h' ? 60 : 1);

  const horas = t.match(/(\d+)\s*(?:h|hora)/);
  const minutos = t.match(/(\d+)\s*(?:min|m\b)/);
  let total = 0;
  if (horas) total += Number(horas[1]) * 60;
  if (minutos) total += Number(minutos[1]);
  if (!total) {
    const n = t.match(/\d+/);
    if (n) total = Number(n[0]);
  }
  return total;
}

/** Primeiro parágrafo de verdade do corpo, para quando não há resumo no frontmatter. */
export function resumoCorpo(corpo) {
  const paragrafos = [];
  let atual = [];
  const fechar = () => {
    if (atual.length) {
      paragrafos.push(atual.join(' '));
      atual = [];
    }
  };

  for (const linha of String(corpo).split(/\r?\n/)) {
    const t = linha.trim();
    if (!t) {
      fechar();
      continue;
    }
    if (/^(#{1,6}\s|[-*+]\s|\d+[.)]\s|\||>)/.test(t)) {
      fechar();
      continue;
    }
    atual.push(t);
  }
  fechar();

  const bom = paragrafos
    .map((p) => p.replace(/\*\*|__|`|\*/g, '').trim())
    .find((p) => p.length >= 40 && !/^\d/.test(p));

  if (!bom) return '';
  return bom.length > 220 ? `${bom.slice(0, 217).trimEnd()}…` : bom;
}

function comoLista(valor) {
  if (Array.isArray(valor)) return valor.map((v) => String(v).trim()).filter(Boolean);
  if (!valor) return [];
  return String(valor)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Junta metadados + corpo no objeto que o app consome. */
export function montarItem(id, meta, corpo) {
  const corpoLimpo = String(corpo).replace(/^\s*\n/, '').trimEnd() + '\n';

  // Sem frontmatter (arquivo vindo do Drive), o título é o H1 do próprio texto.
  const h1Titulo = corpoLimpo.match(/^#\s+(.+?)\s*$/m);
  const titulo = String(meta.titulo || '').trim() || (h1Titulo ? h1Titulo[1].trim() : '') || 'Sem título';

  // Se o corpo repete o título como H1, remove para não aparecer duas vezes.
  let corpoFinal = corpoLimpo;
  const h1 = corpoFinal.match(/^#\s+(.+?)\s*$/m);
  if (h1 && norm(h1[1]) === norm(titulo)) {
    corpoFinal = corpoFinal.replace(h1[0], '').replace(/^\s*\n/, '');
  }

  const item = {
    id,
    titulo,
    categoria: String(meta.categoria || '').trim() || 'Sem categoria',
    tempo: String(meta.tempo || '').trim(),
    porcoes: String(meta.porcoes || '').trim(),
    tags: comoLista(meta.tags),
    resumo: String(meta.resumo || '').trim(),
    fonte: String(meta.fonte || '').trim(),
    criado: String(meta.criado || '').trim(),
    atualizado: String(meta.atualizado || '').trim(),
    corpo: corpoFinal,
  };

  item.ingredientes = extrairIngredientes(corpoFinal);
  item.tempoMin = parseTempo(item.tempo);
  item.resumoDerivado = item.resumo || resumoCorpo(corpoFinal);
  item.busca = [
    item.titulo,
    item.categoria,
    item.tags.join(' '),
    item.resumo,
    item.ingredientes.join(' '),
    corpoFinal,
  ]
    .join(' \n ')
    .split('\n')
    .map(norm)
    .join('\n');
  return item;
}

/** Objeto do app -> texto do arquivo. */
export function serializar(item) {
  const linhas = ['---'];
  for (const campo of ORDEM_CAMPOS) {
    const valor = item[campo];
    if (valor === undefined || valor === null || valor === '') continue;
    if (Array.isArray(valor) && valor.length === 0) continue;
    linhas.push(`${campo}: ${Array.isArray(valor) ? lista(valor) : escalar(valor)}`);
  }
  linhas.push('---', '');
  const corpo = String(item.corpo ?? '').replace(/\r\n/g, '\n').trim();
  return `${linhas.join('\n')}${corpo}\n`;
}

export function hoje() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Normaliza o que veio do navegador para o formato do arquivo. */
export function sanear(dados, anterior = null) {
  const item = {
    titulo: String(dados.titulo ?? '').trim() || 'Sem título',
    categoria: String(dados.categoria ?? '').trim() || 'Sem categoria',
    tempo: String(dados.tempo ?? '').trim(),
    porcoes: String(dados.porcoes ?? '').trim(),
    tags: comoLista(dados.tags),
    resumo: String(dados.resumo ?? '').trim(),
    fonte: String(dados.fonte ?? '').trim(),
    criado: anterior?.criado || hoje(),
    atualizado: hoje(),
    corpo: String(dados.corpo ?? ''),
  };
  return item;
}

const ID_VALIDO = /^[a-z0-9][a-z0-9-]{0,80}$/;

export function idValido(id) {
  return ID_VALIDO.test(String(id ?? ''));
}
