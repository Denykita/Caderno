/**
 * Camada de dados do caderno.
 *
 * Duas fontes, mesma interface:
 *   local  — o servidor de casa (/api), quando você roda node servidor.mjs
 *   drive  — a pasta do Google Drive, para usar no celular sem o PC ligado
 *
 * A escolha é automática: se /api responder, usa local; senão, Drive
 * (quando config.js tem Client ID e pasta). Dá para forçar com ?fonte=drive.
 */

import { CONFIG } from './config.js';
import { separar, montarItem, serializar, sanear, slug, idValido } from './formato.js';
import { criarClienteDrive } from './drive.js';
import { pedirToken, temToken } from './google-auth.js';

const CHAVE_CACHE = 'caderno:drive:v1';
const TAMANHO_LOTE = 6;

let fonte = 'local';
let clienteDrive = null;
let indice = new Map(); // id -> { fileId, modifiedTime }
let textos = new Map(); // id -> markdown em cache

/* ------------------------------------------------------------------ cache */

function lerCache() {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE_CACHE) || 'null');
    if (!bruto) return;
    indice = new Map(Object.entries(bruto.indice || {}));
    textos = new Map(Object.entries(bruto.textos || {}));
  } catch {
    /* cache corrompido: começa vazio */
  }
}

function gravarCache() {
  try {
    localStorage.setItem(
      CHAVE_CACHE,
      JSON.stringify({
        indice: Object.fromEntries(indice),
        textos: Object.fromEntries(textos),
      }),
    );
  } catch {
    /* sem espaço: segue só com a memória */
  }
}

export function limparCache() {
  indice = new Map();
  textos = new Map();
  try {
    localStorage.removeItem(CHAVE_CACHE);
  } catch {
    /* nada a fazer */
  }
}

/* ---------------------------------------------------------------- util */

async function emLotes(lista, tamanho, tarefa) {
  const saida = [];
  for (let i = 0; i < lista.length; i += tamanho) {
    const lote = lista.slice(i, i + tamanho);
    saida.push(...(await Promise.all(lote.map(tarefa))));
  }
  return saida;
}

function idLivre(titulo) {
  const base = slug(titulo);
  if (!indice.has(base)) return base;
  let n = 2;
  while (indice.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

async function servidorLocalResponde() {
  try {
    const controle = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
      ? AbortSignal.timeout(2500)
      : undefined;
    const resposta = await fetch('/api/itens', { signal: controle });
    if (!resposta.ok) return false;
    const dados = await resposta.json();
    return Array.isArray(dados?.itens);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ fonte */

export async function detectar() {
  const forcada = new URLSearchParams(location.search).get('fonte');
  if (forcada === 'drive' || forcada === 'local') {
    fonte = forcada;
  } else if (CONFIG.clientId && CONFIG.pastaId && !(await servidorLocalResponde())) {
    fonte = 'drive';
  } else {
    fonte = 'local';
  }

  if (fonte === 'drive' && !clienteDrive) {
    lerCache();
    clienteDrive = criarClienteDrive({
      pastaId: CONFIG.pastaId,
      obterToken: async (forcar = false) => pedirToken(CONFIG.clientId, { forcar }),
    });
  }
  return fonte;
}

export function fonteAtual() {
  return fonte;
}

export function precisaConectar() {
  return fonte === 'drive' && !temToken();
}

export function driveConfigurado() {
  return Boolean(CONFIG.clientId && CONFIG.pastaId);
}

/** Abre a tela de consentimento do Google — chame no clique do usuário. */
export async function conectar() {
  await pedirToken(CONFIG.clientId, { prompt: 'consent', forcar: true });
}

/* ------------------------------------------------------------------ leitura */

async function listarLocal() {
  const resposta = await fetch('/api/itens');
  if (!resposta.ok) throw new Error(`servidor local respondeu ${resposta.status}`);
  const dados = await resposta.json();
  return dados.itens || [];
}

async function listarDrive() {
  const arquivos = (await clienteDrive.listar()).filter((arquivo) => /\.md$/i.test(arquivo.name));
  const vistos = new Set();

  const itens = await emLotes(arquivos, TAMANHO_LOTE, async (arquivo) => {
    const id = arquivo.name.replace(/\.md$/i, '');
    if (!idValido(id)) return null;
    vistos.add(id);

    const anterior = indice.get(id);
    let texto = anterior?.modifiedTime === arquivo.modifiedTime ? textos.get(id) : null;
    if (!texto) {
      texto = await clienteDrive.baixarConteudo(arquivo.id);
      textos.set(id, texto);
    }
    indice.set(id, { fileId: arquivo.id, modifiedTime: arquivo.modifiedTime });

    const { meta, corpo } = separar(texto);
    return montarItem(id, meta, corpo);
  });

  // tira do cache o que não existe mais no Drive
  for (const id of [...indice.keys()]) {
    if (!vistos.has(id)) {
      indice.delete(id);
      textos.delete(id);
    }
  }
  gravarCache();
  return itens.filter(Boolean);
}

export async function listar() {
  return fonte === 'drive' ? listarDrive() : listarLocal();
}

export async function ler(id) {
  if (fonte === 'local') {
    const resposta = await fetch(`/api/itens/${encodeURIComponent(id)}`);
    if (!resposta.ok) throw new Error(resposta.status === 404 ? 'receita não encontrada' : `falha ${resposta.status}`);
    const { item } = await resposta.json();
    return item;
  }
  const todos = await listar();
  const achado = todos.find((item) => item.id === id);
  if (!achado) throw new Error('receita não encontrada');
  return achado;
}

/* ---------------------------------------------------------------- escrita */

export async function criar(dados) {
  if (fonte === 'local') {
    const resposta = await fetch('/api/itens', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(dados),
    });
    if (!resposta.ok) throw new Error(`falha ${resposta.status}`);
    const { item } = await resposta.json();
    return item;
  }

  const id = idLivre(dados.titulo);
  const item = sanear(dados);
  const texto = serializar(item);
  const arquivo = await clienteDrive.criar(`${id}.md`, texto);

  indice.set(id, { fileId: arquivo.id, modifiedTime: arquivo.modifiedTime });
  textos.set(id, texto);
  gravarCache();

  const { meta, corpo } = separar(texto);
  return montarItem(id, meta, corpo);
}

export async function atualizar(id, dados) {
  if (fonte === 'local') {
    const resposta = await fetch(`/api/itens/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(dados),
    });
    if (!resposta.ok) throw new Error(`falha ${resposta.status}`);
    const { item } = await resposta.json();
    return item;
  }

  const item = sanear(dados, { criado: dados.criado || '' });
  const texto = serializar(item);
  const arquivo = await clienteDrive.atualizar(indice.get(id)?.fileId, texto);

  indice.set(id, {
    fileId: arquivo.id || indice.get(id)?.fileId,
    modifiedTime: arquivo.modifiedTime || new Date().toISOString(),
  });
  textos.set(id, texto);
  gravarCache();

  const { meta, corpo } = separar(texto);
  return montarItem(id, meta, corpo);
}

export async function excluir(id) {
  if (fonte === 'local') {
    const resposta = await fetch(`/api/itens/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!resposta.ok) throw new Error(`falha ${resposta.status}`);
    return;
  }
  const arquivo = indice.get(id);
  if (!arquivo) throw new Error('receita não encontrada');
  await clienteDrive.excluir(arquivo.fileId);
  indice.delete(id);
  textos.delete(id);
  gravarCache();
}

export async function exportar() {
  if (fonte === 'local') {
    const resposta = await fetch('/api/exportar');
    if (!resposta.ok) throw new Error(`falha ${resposta.status}`);
    return resposta.json();
  }
  const itens = await listar();
  return {
    geradoEm: new Date().toISOString(),
    fonte: 'drive',
    itens: itens.map(({ busca, ...resto }) => resto),
  };
}

/** Só para testes: injeta um cliente Drive controlado. */
export function _injetarFonte(nome, cliente = null) {
  fonte = nome;
  if (cliente) clienteDrive = cliente;
}
