/**
 * Núcleo do modo cozinha: transforma a receita em um roteiro falado.
 *
 * Funções puras (sem DOM, sem voz, sem relógio) — testadas em
 * ferramentas/teste-cozinha.mjs. Quem fala e quem conta o tempo é o cozinha.js.
 */

import { norm } from './nucleo.js';

const NUM = '(\\d+(?:[.,]\\d+)?)';
const SECAO_PASSOS =
  /^(modo de (fazer|preparo)|preparo|instru[cç][oõ]es( de cozinha)?|como fazer|montagem)\b/;

/* --------------------------------------------------------------- texto */

/** Tira a marcação do markdown: o leitor de voz não deve falar asteriscos. */
export function limparMarkdown(texto) {
  return String(texto ?? '')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|\s)_([^_]+)_/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ------------------------------------------------------------ números */

function paraMinutos(valor, unidade) {
  const numero = Number(String(valor).replace(',', '.'));
  return Math.round(unidade === 'h' ? numero * 60 : numero);
}

export function rotuloDuracao(minutos) {
  if (!Number.isFinite(minutos) || minutos <= 0) return '';
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}

/**
 * Primeira duração citada no texto.
 * "30 minutos" → 30 · "1 h 30 min" → 90 · "50 a 70 min" → 50 · "1,5 a 2 h" → 90
 */
export function analisarDuracao(texto) {
  const t = norm(texto);

  const faixa = t.match(new RegExp(`${NUM}\\s*(?:a|–|—|-|ate)\\s*${NUM}\\s*(min|h)`));
  if (faixa) return { minutos: paraMinutos(faixa[1], faixa[3]) };

  const horas = t.match(new RegExp(`${NUM}\\s*(?:h\\b|horas?)`));
  const minutos = t.match(new RegExp(`${NUM}\\s*(?:min\\b|minutos?)`));

  if (!horas && !minutos) return null;
  const total = (horas ? paraMinutos(horas[1], 'h') : 0) + (minutos ? paraMinutos(minutos[1], 'min') : 0);
  if (!total) return null;
  return { minutos: total };
}

/** Temperatura citada: "180 graus", "200 °C", "250graus". */
export function analisarTemperatura(texto) {
  const achado = norm(texto).match(/(\d{2,3})\s*(?:°|graus?|gr\b)/);
  return achado ? Number(achado[1]) : null;
}

/** O passo manda preaquecer forno/chapa? */
export function pedePreaquecer(texto) {
  return /pr[eé][-\s]?aquec/.test(norm(texto));
}

/** O passo sugere virar/ mexer no meio do tempo? */
export function pedeVirar(texto) {
  return /\bvir(ar|e|a|ando)\b|\bmex(er|a|endo)\b/.test(norm(texto));
}

/** Analisa uma linha de passo: duração, temperatura, preaquecimento. */
export function analisarPasso(texto) {
  const limpo = limparMarkdown(texto);
  const duracao = analisarDuracao(limpo);
  return {
    tipo: 'passo',
    texto: limpo,
    minutos: duracao ? duracao.minutos : null,
    rotuloTempo: duracao ? rotuloDuracao(duracao.minutos) : '',
    temperatura: analisarTemperatura(limpo),
    preaquecer: pedePreaquecer(limpo),
    virar: pedeVirar(limpo),
  };
}

/* --------------------------------------------------------------- roteiro */

/**
 * Separa a seção de modo de fazer em blocos e passos.
 * Retorna { temSecao, passos } — receita só com ingredientes devolve temSecao: false.
 */
export function dividirPassos(corpo) {
  const linhas = String(corpo ?? '').split(/\r?\n/);
  const brutos = [];
  let dentro = false;
  let temSecao = false;

  for (const linha of linhas) {
    const titulo = linha.match(/^#{2,4}\s+(.+?)\s*$/);
    if (titulo) {
      dentro = SECAO_PASSOS.test(norm(titulo[1]).trim());
      if (dentro) temSecao = true;
      continue;
    }
    if (!dentro) continue;

    const t = linha.trim();
    if (!t || t.startsWith('>')) continue;

    // **Molho branco** — rótulo de bloco
    if (/^\*\*[^*]+\*\*$/.test(t)) {
      brutos.push({ tipo: 'bloco', texto: limparMarkdown(t) });
      continue;
    }

    const item = t.match(/^(?:[-*+]|\d+[.)])\s+(.+)$/);
    brutos.push(analisarPasso(item ? item[1] : t));
  }

  return { temSecao, passos: brutos };
}

/** Linhas da seção "Anotações". */
export function extrairAnotacoes(corpo) {
  const linhas = String(corpo ?? '').split(/\r?\n/);
  const notas = [];
  let dentro = false;
  for (const linha of linhas) {
    const titulo = linha.match(/^#{2,4}\s+(.+?)\s*$/);
    if (titulo) {
      dentro = /^anota[cç][õo]es\b/.test(norm(titulo[1]).trim());
      continue;
    }
    if (!dentro) continue;
    const t = linha.trim().replace(/^[-*+]\s+/, '');
    if (t) notas.push(limparMarkdown(t));
  }
  return notas;
}

/** Objeto do item (API) → tudo que o modo cozinha precisa. */
export function montarRoteiro(item) {
  const { temSecao, passos } = dividirPassos(item.corpo || '');
  return {
    id: item.id,
    titulo: item.titulo,
    categoria: item.categoria || '',
    tempo: item.tempo || '',
    porcoes: item.porcoes || '',
    resumo: item.resumoDerivado || '',
    ingredientes: (item.ingredientes || []).map(limparMarkdown),
    anotacoes: extrairAnotacoes(item.corpo || ''),
    passos,
    temPassos: temSecao && passos.length > 0,
    temCronometro: passos.some((p) => p.tipo === 'passo' && p.minutos),
  };
}

/* ---------------------------------------------------------------- falas */

export function fraseDeResumo(roteiro) {
  const partes = [`Receita ${roteiro.titulo}.`];
  if (roteiro.categoria) partes.push(`Categoria ${roteiro.categoria}.`);
  if (roteiro.tempo) partes.push(`Tempo de preparo: ${roteiro.tempo}.`);
  if (roteiro.porcoes) partes.push(`Rende ${roteiro.porcoes}.`);

  const totalPassos = roteiro.passos.filter((p) => p.tipo === 'passo').length;
  partes.push(`${roteiro.ingredientes.length} ingredientes e ${totalPassos} passos.`);

  if (roteiro.resumo) partes.push(roteiro.resumo);
  if (!roteiro.temPassos) partes.push('Esta receita ainda não tem modo de fazer cadastrado.');

  if (roteiro.anotacoes.length) {
    partes.push(
      roteiro.anotacoes.length === 1
        ? `Tenho uma anotação: ${roteiro.anotacoes[0]}.`
        : `Tenho ${roteiro.anotacoes.length} anotações. A última: ${roteiro.anotacoes.at(-1)}.`,
    );
  }
  return partes.join(' ');
}

export function fraseDoIngrediente(texto, indice, total) {
  return `Ingrediente ${indice} de ${total}: ${texto}.`;
}

export function fraseDoPasso(passo, indice, total) {
  if (passo.tipo === 'bloco') return `Agora: ${passo.texto}.`;
  const partes = [`Passo ${indice} de ${total}.`];
  if (passo.temperatura && passo.preaquecer) {
    partes.push(`Preaqueça a ${passo.temperatura} graus.`);
  }
  partes.push(passo.texto);
  if (passo.minutos) partes.push(`Isso leva ${passo.rotuloTempo}.`);
  return partes.join(' ');
}

export function fraseDoCronometro(passo) {
  return `Cronômetro de ${passo.rotuloTempo} iniciado. Aviso na metade.`;
}

/* ------------------------------------------------------------- intenções */

/**
 * Traduz o que o microfone entendeu em um comando.
 * contextos: 'menu' | 'ingrediente' | 'passo' | 'cronometro' | 'nota'
 */
export function detectarIntencao(frase, contexto = 'menu') {
  const f = norm(frase).trim();
  if (!f) return null;

  if (/\b(parar|sair|encerrar|chega|fechar|desligar)\b/.test(f)) return 'sair';
  if (/\bresum(o|ir|ido)\b/.test(f)) return 'resumo';
  if (/\b(repet(e|ir|ir de novo)|de novo|outra vez|nao (ouvi|entendi))\b/.test(f)) return 'repetir';
  if (/\b(pausar|pausa|silencio|cala)\b/.test(f)) return 'pausar';
  if (/\b(anot(ar|acao|açao)|nota|comentario)\b/.test(f)) return 'anotar';
  if (/\b(mais tempo|aguard(ar|e)|esper(ar|e)|mais \d+ ?min)/.test(f)) return 'mais-tempo';

  // áudio: volume e velocidade da voz
  if (/\b(aument\w*|sobe|subir|mais)\s+(o\s+)?volume\b|\bvolume\s+(mais\s+)?(alto|maior)\b/.test(f)) {
    return 'mais-volume';
  }
  if (/\b(abaix\w*|diminu\w*|baix\w*|menos)\s+(o\s+)?volume\b|\bvolume\s+(mais\s+)?(baixo|menor)\b/.test(f)) {
    return 'menos-volume';
  }
  if (/\b(velocidade|voz)\s+(normal|padr[aã]o)\b|\bvolta (ao|para o) normal\b/.test(f)) return 'voz-normal';
  if (/\b(mais\s+)?devagar\b|\b(mais\s+)?lent[oa]\b|\bdiminu\w*\s+(a\s+)?velocidade\b/.test(f)) {
    return 'mais-devagar';
  }
  if (/\b(mais\s+)?r[aá]pid[oa]\b|\baceler\w*\b|\baument\w*\s+(a\s+)?velocidade\b/.test(f)) {
    return 'mais-rapido';
  }
  // antes de "preparar": "começar a contar" é cronômetro, não início do preparo
  if (/\b(iniciar preparo|come[cç]ar a preparar)\b/.test(f)) return 'preparar';
  if (/\b(iniciar|cronometro|marcar (o )?tempo|come[cç]ar a contar|pode contar)\b/.test(f)) return 'iniciar';
  if (/\b(preparar|executar|cozinhar|come[cç]ar|vamos)\b/.test(f)) return 'preparar';

  if (contexto === 'cronometro') {
    if (/\b(prosseguir|continuar|proximo)\b/.test(f)) return 'proximo';
  }

  if (
    /^(ok|okay|okey|tenho|proximo|pronto|feito|sim|pode|isso|beleza|seguir|confirmo|manda|continuar|continua|certo|claro|segue|show|ta|boa)\b/.test(f)
  ) {
    return 'ok';
  }
  if (/\b(pular|pula|avancar|proximo passo|pula esse)\b/.test(f)) return 'pular';
  return null;
}

/** "mais 10 minutos" / "aguarde mais 5" → minutos extras (padrão 10). */
export function analisarExtensao(frase) {
  const t = norm(frase);
  const achado = t.match(new RegExp(`mais\\s*${NUM}\\s*(min|h)`));
  if (achado) return paraMinutos(achado[1], achado[2]);
  return 10;
}
