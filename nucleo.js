/**
 * Nucleo do caderno: funções puras usadas pela interface.
 * Fica separado para poder ser testado no Node (ferramentas/teste-nucleo.mjs).
 * Nada aqui toca no DOM.
 */

export const esc = (valor) =>
  String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

export const norm = (texto) =>
  String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Normaliza mantendo o mapa posição -> índice no texto original. */
export function normComMapa(texto) {
  let saida = '';
  const mapa = [];
  for (let i = 0; i < texto.length; i++) {
    const base = texto[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    for (let j = 0; j < base.length; j++) {
      saida += base[j];
      mapa.push(i);
    }
  }
  return { saida, mapa };
}

export function dataBR(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/* ------------------------------------------------------------------ busca */

/** "tem: tomate sem: forno salmão" -> { tem: [...], sem: [...], termos: [...] } */
export function analisarConsulta(texto) {
  const tem = [];
  const sem = [];
  const resto = String(texto ?? '').replace(/(tem|sem):\s*("[^"]*"|\S+)/gi, (_, chave, valor) => {
    const palavra = norm(valor.replace(/"/g, '')).trim();
    if (palavra) (chave.toLowerCase() === 'tem' ? tem : sem).push(palavra);
    return ' ';
  });
  const termos = norm(resto).split(/\s+/).filter(Boolean);
  return { termos, tem, sem };
}

/** Um item passa pelos filtros? consulta = saída de analisarConsulta. */export function combina(item, consulta, opcoes = {}) {
  const { categoria = '', soFavoritos = false, favoritos = new Set() } = opcoes;
  if (soFavoritos && !favoritos.has(item.id)) return false;
  if (categoria && item.categoria !== categoria) return false;

  const ingredientes = norm((item.ingredientes || []).join(' | '));
  if (consulta.tem.some((t) => !ingredientes.includes(t))) return false;
  if (consulta.sem.some((t) => ingredientes.includes(t))) return false;

  if (!consulta.termos.length) return true;
  const alvo = item.busca ?? norm([item.titulo, item.corpo, (item.tags || []).join(' ')].join(' '));
  return consulta.termos.every((t) => alvo.includes(t));
}

/**
 * Contadores dos botões (chips e estrela).
 * Com o filtro de favoritos ligado, contam só os favoritos — é o que está na tela.
 */
export function contagens(itens, favoritos = new Set(), soFavoritos = false) {
  const base = soFavoritos ? itens.filter((item) => favoritos.has(item.id)) : itens;
  const porCategoria = new Map();
  for (const item of base) {
    porCategoria.set(item.categoria, (porCategoria.get(item.categoria) || 0) + 1);
  }
  return { total: base.length, porCategoria };
}

export function marcar(texto, termos) {
  if (!termos || !termos.length) return esc(texto);
  return String(texto)
    .split(/(\s+)/)
    .map((parte) => {
      if (!parte.trim()) return parte;
      const alvo = norm(parte);
      return termos.some((t) => alvo.includes(t)) ? `<mark>${esc(parte)}</mark>` : esc(parte);
    })
    .join('');
}

/** Marca termos sem quebrar o HTML já gerado. */
export function marcarHTML(html, termos) {
  if (!termos || !termos.length) return html;
  return String(html)
    .split(/(<[^>]+>)/)
    .map((parte) => (parte.startsWith('<') ? parte : marcar(parte, termos)))
    .join('');
}

/** Recorte do corpo em volta do primeiro termo encontrado. */
export function trechoBusca(item, termos, largura = 190) {
  if (!termos || !termos.length) return '';
  const { saida, mapa } = normComMapa(item.corpo);
  let posicao = -1;
  for (const termo of termos) {
    const achou = saida.indexOf(termo);
    if (achou >= 0 && (posicao < 0 || achou < posicao)) posicao = achou;
  }
  if (posicao < 0) return '';
  const inicio = Math.max(0, posicao - 55);
  const fim = Math.min(saida.length, inicio + largura);
  const de = mapa[inicio] ?? 0;
  const ate = fim - 1 < mapa.length ? (mapa[fim - 1] ?? item.corpo.length - 1) + 1 : item.corpo.length;
  let recorte = item.corpo.slice(de, ate).replace(/\s+/g, ' ').trim();
  if (de > 0) recorte = `… ${recorte}`;
  if (ate < item.corpo.length) recorte = `${recorte} …`;
  return recorte;
}

/* --------------------------------------------------------------- markdown */

export function renderMarkdown(markdown, termos = []) {
  const linhas = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const saida = [];

  const inline = (texto) => {
    const html = esc(texto)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return marcarHTML(html, termos);
  };

  const cortaBloco = (teste) => {
    const bloco = [];
    while (linhas.length && teste(linhas[0])) bloco.push(linhas.shift());
    return bloco;
  };

  while (linhas.length) {
    const linha = linhas.shift();
    if (!linha.trim()) continue;

    const titulo = linha.match(/^(#{1,4})\s+(.*)$/);
    if (titulo) {
      const nivel = Math.min(4, Math.max(2, titulo[1].length));
      saida.push(`<h${nivel}>${inline(titulo[2])}</h${nivel}>`);
      continue;
    }

    if (/^\s*>\s?/.test(linha)) {
      const bloco = [linha.replace(/^\s*>\s?/, '')];
      while (linhas.length && /^\s*>\s?/.test(linhas[0])) bloco.push(linhas.shift().replace(/^\s*>\s?/, ''));
      saida.push(`<blockquote>${bloco.map(inline).join('<br>')}</blockquote>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(linha)) {
      const itens = [linha.replace(/^\s*[-*+]\s+/, '')];
      while (linhas.length && /^\s*[-*+]\s+/.test(linhas[0])) itens.push(linhas.shift().replace(/^\s*[-*+]\s+/, ''));
      saida.push(`<ul>${itens.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(linha)) {
      const itens = [linha.replace(/^\s*\d+[.)]\s+/, '')];
      while (linhas.length && /^\s*\d+[.)]\s+/.test(linhas[0])) itens.push(linhas.shift().replace(/^\s*\d+[.)]\s+/, ''));
      saida.push(`<ol>${itens.map((t) => `<li>${inline(t)}</li>`).join('')}</ol>`);
      continue;
    }

    if (/^\s*\|/.test(linha)) {
      const bloco = [linha, ...cortaBloco((l) => /^\s*\|/.test(l))];
      const celulas = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const uteis = bloco.map(celulas).filter((cols) => !cols.every((c) => /^:?-{2,}:?$/.test(c) || c === ''));
      const [cabecalho, ...corpo] = uteis;
      if (cabecalho) {
        saida.push(
          `<table><thead><tr>${cabecalho.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>` +
            `<tbody>${corpo.map((l) => `<tr>${l.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`,
        );
      }
      continue;
    }

    const paragrafo = [linha];
    while (
      linhas.length &&
      linhas[0].trim() &&
      !/^(#{1,4}\s|\s*>|\s*[-*+]\s|\s*\d+[.)]\s|\s*\|)/.test(linhas[0])
    ) {
      paragrafo.push(linhas.shift());
    }
    saida.push(`<p>${paragrafo.map((l) => inline(l.trim())).join(' ')}</p>`);
  }

  return saida.join('\n');
}

/* --------------------------------------------------------------- anotações */

/** Acrescenta uma anotação datada ao fim da seção "Anotações" (cria se faltar). */
export function anexarNota(corpo, texto, data = new Date().toLocaleDateString('pt-BR')) {
  const linha = `- ${data} — ${String(texto).trim().replace(/\s+/g, ' ')}`;
  const linhas = String(corpo).split('\n');
  const indice = linhas.findIndex((l) => /^#{2,4}\s+anota[çc][õo]es/i.test(l.trim()));

  if (indice < 0) {
    return `${String(corpo).trim()}\n\n## Anotações\n\n${linha}\n`;
  }

  let fim = linhas.length;
  for (let i = indice + 1; i < linhas.length; i++) {
    if (/^#{1,4}\s+/.test(linhas[i])) { fim = i; break; }
  }
  let ultima = fim - 1;
  while (ultima > indice && !linhas[ultima].trim()) ultima--;

  const bloco = linhas.slice(indice + 1, ultima + 1).filter((l) => l.trim() && !/^#{1,4}\s/.test(l));
  const antes = linhas.slice(0, indice + 1);
  const depois = linhas.slice(fim);

  return [...antes, '', ...bloco, linha, '', ...depois]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}
