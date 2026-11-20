/* Caderno de Cozinha — interface. Lógica pura em nucleo.js. */

import {
  esc,
  norm,
  dataBR,
  analisarConsulta,
  combina,
  contagens,
  marcar,
  renderMarkdown,
  trechoBusca,
  anexarNota,
} from './nucleo.js';
import * as dados from './dados.js';

const $ = (sel) => document.querySelector(sel);

const hojeBR = () => new Date().toLocaleDateString('pt-BR');

let avisoTimer = null;
function avisar(mensagem, tipo = 'ok') {
  const alvo = $('#toast');
  alvo.textContent = mensagem;
  alvo.className = tipo === 'erro' ? 'erro' : '';
  alvo.dataset.visivel = '1';
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { alvo.dataset.visivel = '0'; }, tipo === 'erro' ? 5200 : 2600);
}

/* ------------------------------------------------------------------- dados */

const CHAVE_FAVORITOS = 'caderno:favoritos:v1';

const estado = {
  itens: [],
  consulta: '',
  categoria: '',
  soFavoritos: false,
  termos: [],
  favoritos: new Set(),
  aberto: null,
  editando: null,
  sujo: false,
  voltarAoDetalhe: false,
};

function carregarFavoritos() {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE_FAVORITOS) || '[]');
    if (Array.isArray(bruto)) estado.favoritos = new Set(bruto.map(String));
  } catch {
    estado.favoritos = new Set();
  }
}

function salvarFavoritos() {
  try {
    localStorage.setItem(CHAVE_FAVORITOS, JSON.stringify([...estado.favoritos]));
  } catch {
    /* navegação privada: favoritos duram só a sessão */
  }
}

/** Descarta favoritos de itens que não existem mais (excluídos em outro aparelho). */
function podarFavoritos() {
  const existentes = new Set(estado.itens.map((item) => item.id));
  const antes = estado.favoritos.size;
  for (const id of [...estado.favoritos]) {
    if (!existentes.has(id)) estado.favoritos.delete(id);
  }
  if (estado.favoritos.size !== antes) salvarFavoritos();
}

async function carregar() {
  esconderConexao();
  try {
    await dados.detectar();

    if (dados.precisaConectar()) {
      estado.itens = [];
      $('#grade').innerHTML = '';
      $('#status').textContent = '';
      $('#rodape-info').textContent = 'Drive não conectado';
      mostrarConexao();
      return;
    }

    estado.itens = (await dados.listar()).sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
    podarFavoritos();
    render();
    atualizarFonte();
    $('#rodape-info').textContent = `${estado.itens.length} ${estado.itens.length === 1 ? 'item' : 'itens'} no caderno`;
  } catch (falha) {
    estado.itens = [];
    $('#grade').innerHTML = `<div class="vazio"><b>Não consegui carregar o caderno</b>
      ${dados.fonteAtual() === 'drive'
        ? 'Confira a conexão com o Google Drive.'
        : 'Confira se o servidor está rodando: <code>node servidor.mjs</code> nesta pasta.'}<br>
      <span style="font-size:.8rem">${esc(falha.message)}</span></div>`;
    $('#status').textContent = '';
    $('#rodape-info').textContent = 'sem conexão';
    atualizarFonte();
  }
}

function atualizarFonte() {
  const alvo = $('#rodape-fonte');
  if (!alvo) return;
  alvo.textContent = dados.fonteAtual() === 'drive' ? 'fonte: Google Drive' : 'fonte: servidor local';
}

function mostrarConexao() {
  const caixa = $('#conexao');
  if (!caixa) return;
  caixa.hidden = false;
  $('#btn-conectar').disabled = false;
}

function esconderConexao() {
  const caixa = $('#conexao');
  if (caixa) caixa.hidden = true;
}

/* ------------------------------------------------------------------ render */

function filtrar() {
  const consulta = analisarConsulta(estado.consulta);
  estado.termos = consulta.termos;
  const opcoes = {
    categoria: estado.categoria,
    soFavoritos: estado.soFavoritos,
    favoritos: estado.favoritos,
  };
  return { lista: estado.itens.filter((item) => combina(item, consulta, opcoes)), consulta };
}

/** Base dos contadores: com o filtro de favoritos ligado, só os favoritos contam. */
function renderBotaoFavoritos() {
  const botao = $('#btn-favoritos');
  const total = estado.favoritos.size;
  botao.setAttribute('aria-pressed', String(estado.soFavoritos));
  botao.innerHTML = `★ <span class="n">${total}</span>`;
  botao.title = estado.soFavoritos
    ? `Mostrando só favoritos (${total}) — clique para ver tudo`
    : `Mostrar só favoritos (${total})`;
  botao.setAttribute('aria-label', `Mostrar só favoritos (${total})`);
}

function renderChips(conta) {
  // A lista de categorias não muda com o filtro: só os números mudam.
  const categorias = [...new Set(estado.itens.map((item) => item.categoria))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const chips = [`<button class="chip" type="button" data-cat="" aria-pressed="${estado.categoria === ''}">Todas <span class="n">${conta.total}</span></button>`];
  for (const categoria of categorias) {
    const total = conta.porCategoria.get(categoria) || 0;
    chips.push(
      `<button class="chip${total ? '' : ' vazia'}" type="button" data-cat="${esc(categoria)}" aria-pressed="${estado.categoria === categoria}">${esc(categoria)} <span class="n">${total}</span></button>`,
    );
  }
  $('#chips').innerHTML = chips.join('');
}

function cartaoHTML(item, termos) {
  const tempo = item.tempo ? `<span class="tempo">· ${esc(item.tempo)}</span>` : '';
  const rendimento = item.porcoes ? `<span class="tempo">· ${esc(item.porcoes)}</span>` : '';
  const recorte = trechoBusca(item, termos);
  const apoio = item.resumoDerivado
    || (item.ingredientes.length ? item.ingredientes.slice(0, 4).join(' · ') : '');
  const texto = recorte ? marcar(recorte, termos) : marcar(apoio, termos);
  const tags = item.tags.slice(0, 4).map((tag) => {
    const achou = termos.some((t) => norm(tag).includes(t));
    return `<span${achou ? ' class="achou"' : ''}>${esc(tag)}</span>`;
  }).join('');

  return `<article class="cartao" role="button" tabindex="0" data-id="${esc(item.id)}" aria-label="${esc(item.titulo)}">
    <div class="cat">${esc(item.categoria)} ${tempo}${rendimento}</div>
    <h3>${esc(item.titulo)}</h3>
    <div class="texto">${texto}</div>
    ${tags ? `<div class="tags">${tags}</div>` : ''}
    <button class="fav" type="button" data-fav="${esc(item.id)}" aria-pressed="${estado.favoritos.has(item.id)}" aria-label="Favoritar ${esc(item.titulo)}" title="Favoritar">★</button>
  </article>`;
}

function render() {
  const { lista, consulta } = filtrar();
  const conta = contagens(estado.itens, estado.favoritos, estado.soFavoritos);
  renderChips(conta);
  renderBotaoFavoritos();

  if (!estado.itens.length) {
    $('#grade').innerHTML = '';
    $('#status').textContent = '';
    return;
  }

  if (!lista.length) {
    $('#grade').innerHTML = estado.soFavoritos && !conta.total
      ? '<div class="vazio"><b>Nenhum favorito ainda</b>Toque na estrela de um item para guardá-lo aqui.</div>'
      : '<div class="vazio"><b>Nada encontrado</b>Tente menos palavras ou use <code>tem: ingrediente</code>.</div>';
  } else {
    $('#grade').innerHTML = lista.map((item) => cartaoHTML(item, estado.termos)).join('');
  }

  const partes = [`<b>${lista.length}</b> ${lista.length === 1 ? 'item' : 'itens'}`];
  if (lista.length !== conta.total) partes.push(`de ${conta.total}`);
  if (estado.categoria) partes.push(`em <b>${esc(estado.categoria)}</b>`);
  if (estado.soFavoritos) partes.push('só favoritos');
  if (consulta.tem.length) partes.push(`com <b>${esc(consulta.tem.join(', '))}</b>`);
  if (consulta.sem.length) partes.push(`sem <b>${esc(consulta.sem.join(', '))}</b>`);
  if (!estado.consulta && !estado.categoria && !estado.soFavoritos) {
    partes.push('<kbd>/</kbd> busca · <kbd>Esc</kbd> limpa');
  }
  $('#status').innerHTML = partes.join(' · ');
}

/* ----------------------------------------------------------------- detalhe */

function abrirDetalhe(id) {
  const item = estado.itens.find((i) => i.id === id);
  if (!item) return;
  estado.aberto = item;

  $('#d-cat').textContent = item.categoria;
  $('#d-titulo').textContent = item.titulo;
  $('#d-meta').innerHTML = [
    item.tempo ? `<span>${esc(item.tempo)}</span>` : '',
    item.porcoes ? `<span>${esc(item.porcoes)}</span>` : '',
    item.atualizado ? `<span>atualizado ${esc(dataBR(item.atualizado))}</span>` : '',
    item.fonte && /^https?:/i.test(item.fonte)
      ? `<span><a href="${esc(item.fonte)}" target="_blank" rel="noopener">fonte</a></span>`
      : '',
  ].filter(Boolean).join('');

  const tags = item.tags.map((t) => esc(t)).join(' · ');
  $('#d-corpo').innerHTML =
    renderMarkdown(item.corpo, estado.termos) +
    (tags ? `<p style="color:var(--muted);font-size:.8rem;margin-top:1.4rem">${tags}</p>` : '');

  $('#d-fav').setAttribute('aria-pressed', String(estado.favoritos.has(item.id)));
  $('#d-fav').title = estado.favoritos.has(item.id) ? 'Remover dos favoritos' : 'Favoritar';
  $('#d-nota-form').hidden = true;
  $('#d-nota-texto').value = '';

  if (!$('#detalhe').open) $('#detalhe').showModal();
  $('#d-cozinha').href = `cozinha.html?id=${encodeURIComponent(item.id)}`;
  $('#detalhe').querySelector('.folha-corpo').scrollTop = 0;
  history.replaceState(null, '', `#${item.id}`);
}

function fecharDetalhe() {
  if ($('#detalhe').open) $('#detalhe').close();
}

/* ------------------------------------------------------------------ editor */

const CORPO_NOVO = '## Ingredientes\n\n- \n\n## Modo de fazer\n\n1. \n';

function abrirEditor(item = null) {
  estado.editando = item;
  estado.sujo = false;
  estado.voltarAoDetalhe = Boolean(item);

  const novo = !item;
  $('#e-modo').textContent = novo ? 'Novo item' : `Editando · ${item.categoria}`;
  $('#e-titulo-visivel').textContent = novo ? 'Nova receita' : item.titulo;

  $('#f-titulo').value = item ? item.titulo : '';
  $('#f-categoria').value = item ? item.categoria : estado.categoria;
  $('#f-tempo').value = item ? item.tempo : '';
  $('#f-porcoes').value = item ? item.porcoes : '';
  $('#f-tags').value = item ? item.tags.join(', ') : '';
  $('#f-resumo').value = item ? item.resumo : '';
  $('#f-fonte').value = item ? item.fonte : '';
  $('#f-corpo').value = item ? item.corpo : CORPO_NOVO;

  $('#e-apagar').hidden = novo;
  $('#e-previa-btn').setAttribute('aria-pressed', 'false');
  $('#e-previa').classList.remove('ativa');
  $('#editor').classList.remove('duas-colunas');

  const categorias = [...new Set(estado.itens.map((i) => i.categoria))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  $('#lista-categorias').innerHTML = categorias.map((c) => `<option value="${esc(c)}">`).join('');

  if ($('#detalhe').open) $('#detalhe').close();
  if (!$('#editor').open) $('#editor').showModal();
  setTimeout(() => $('#f-titulo').focus(), 40);
}

function coletarEditor() {
  return {
    titulo: $('#f-titulo').value.trim(),
    categoria: $('#f-categoria').value.trim(),
    tempo: $('#f-tempo').value.trim(),
    porcoes: $('#f-porcoes').value.trim(),
    tags: $('#f-tags').value.split(',').map((t) => t.trim()).filter(Boolean),
    resumo: $('#f-resumo').value.trim(),
    fonte: $('#f-fonte').value.trim(),
    corpo: $('#f-corpo').value,
  };
}

async function salvarEditor(evento) {
  evento.preventDefault();
  const campos = coletarEditor();
  if (!campos.titulo) {
    avisar('Dê um título ao item.', 'erro');
    $('#f-titulo').focus();
    return;
  }

  const botao = $('#e-salvar');
  const editando = Boolean(estado.editando);
  botao.disabled = true;
  try {
    let salvo;
    if (editando) {
      salvo = await dados.atualizar(estado.editando.id, campos);
      const i = estado.itens.findIndex((x) => x.id === salvo.id);
      if (i >= 0) estado.itens[i] = salvo;
    } else {
      salvo = await dados.criar(campos);
      estado.itens.push(salvo);
    }
    estado.itens.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
    estado.sujo = false;
    estado.editando = salvo;
    $('#editor').close();
    render();
    avisar(editando ? 'Alterações salvas.' : 'Item criado.');
    if (estado.voltarAoDetalhe) abrirDetalhe(salvo.id);
  } catch (falha) {
    avisar(`Não deu para salvar: ${falha.message}`, 'erro');
  } finally {
    botao.disabled = false;
  }
}

async function excluirItem(item) {
  if (!item) return;
  const confirmou = window.confirm(`Mover "${item.titulo}" para a lixeira?\n\nO arquivo vai para receitas/_lixeira e pode ser recuperado.`);
  if (!confirmou) return;

  try {
    await dados.excluir(item.id);
    estado.itens = estado.itens.filter((i) => i.id !== item.id);
    estado.favoritos.delete(item.id);
    salvarFavoritos();
    estado.sujo = false;
    if ($('#editor').open) $('#editor').close();
    fecharDetalhe();
    history.replaceState(null, '', '#');
    render();
    avisar('Item movido para a lixeira.');
  } catch (falha) {
    avisar(`Não deu para excluir: ${falha.message}`, 'erro');
  }
}

function tentarFecharEditor() {
  if (estado.sujo && !window.confirm('Descartar as alterações não salvas?')) return;
  estado.sujo = false;
  $('#editor').close();
}

/* ------------------------------------------------------------------ eventos */

function ligarEventos() {
  const busca = $('#q');
  busca.addEventListener('input', () => {
    estado.consulta = busca.value;
    $('#limpar').dataset.visivel = busca.value ? '1' : '0';
    render();
  });

  $('#limpar').addEventListener('click', () => {
    busca.value = '';
    estado.consulta = '';
    $('#limpar').dataset.visivel = '0';
    render();
    busca.focus();
  });

  $('#chips').addEventListener('click', (evento) => {
    const botao = evento.target.closest('button[data-cat]');
    if (!botao) return;
    const categoria = botao.dataset.cat;
    estado.categoria = estado.categoria === categoria ? '' : categoria;
    render();
  });

  $('#btn-favoritos').addEventListener('click', () => {
    estado.soFavoritos = !estado.soFavoritos;
    render();
  });

  $('#btn-nova').addEventListener('click', () => abrirEditor(null));

  $('#btn-conectar')?.addEventListener('click', async () => {
    const botao = $('#btn-conectar');
    botao.disabled = true;
    try {
      await dados.conectar();
      await carregar();
    } catch (falha) {
      avisar(`Não deu para conectar: ${falha.message}`, 'erro');
      botao.disabled = false;
    }
  });

  $('#btn-backup')?.addEventListener('click', async () => {
    try {
      const pacote = await dados.exportar();
      const blob = new Blob([JSON.stringify(pacote, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'caderno-backup.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 4000);
      avisar('Backup gerado.');
    } catch (falha) {
      avisar(`Não deu para exportar: ${falha.message}`, 'erro');
    }
  });

  $('#grade').addEventListener('click', (evento) => {
    const favorito = evento.target.closest('button[data-fav]');
    if (favorito) {
      evento.stopPropagation();
      const id = favorito.dataset.fav;
      if (estado.favoritos.has(id)) estado.favoritos.delete(id);
      else estado.favoritos.add(id);
      salvarFavoritos();
      if (estado.aberto && estado.aberto.id === id) {
        $('#d-fav').setAttribute('aria-pressed', String(estado.favoritos.has(id)));
      }
      render();
      return;
    }
    const cartao = evento.target.closest('.cartao');
    if (cartao) abrirDetalhe(cartao.dataset.id);
  });

  $('#grade').addEventListener('keydown', (evento) => {
    const cartao = evento.target.closest('.cartao');
    if (cartao && (evento.key === 'Enter' || evento.key === ' ')) {
      evento.preventDefault();
      abrirDetalhe(cartao.dataset.id);
    }
  });

  /* ---- detalhe ---- */
  $('#d-fechar').addEventListener('click', fecharDetalhe);

  $('#d-fav').addEventListener('click', () => {
    const item = estado.aberto;
    if (!item) return;
    if (estado.favoritos.has(item.id)) estado.favoritos.delete(item.id);
    else estado.favoritos.add(item.id);
    salvarFavoritos();
    $('#d-fav').setAttribute('aria-pressed', String(estado.favoritos.has(item.id)));
    render();
  });

  $('#d-editar').addEventListener('click', () => abrirEditor(estado.aberto));
  $('#d-excluir').addEventListener('click', () => excluirItem(estado.aberto));

  $('#d-nota-btn').addEventListener('click', () => {
    const caixa = $('#d-nota-form');
    caixa.hidden = !caixa.hidden;
    if (!caixa.hidden) $('#d-nota-texto').focus();
  });
  $('#d-nota-cancelar').addEventListener('click', () => { $('#d-nota-form').hidden = true; });

  $('#d-nota-salvar').addEventListener('click', async () => {
    const item = estado.aberto;
    const texto = $('#d-nota-texto').value.trim();
    if (!item || !texto) {
      avisar('Escreva a anotação antes de salvar.', 'erro');
      return;
    }
    const botao = $('#d-nota-salvar');
    botao.disabled = true;
    try {
      const salvo = await dados.atualizar(item.id, {
        ...item,
        corpo: anexarNota(item.corpo, texto, hojeBR()),
      });
      const i = estado.itens.findIndex((x) => x.id === salvo.id);
      if (i >= 0) estado.itens[i] = salvo;
      abrirDetalhe(salvo.id);
      avisar('Anotação salva.');
    } catch (falha) {
      avisar(`Não deu para anotar: ${falha.message}`, 'erro');
    } finally {
      botao.disabled = false;
    }
  });

  /* ---- editor ---- */
  $('#e-form').addEventListener('submit', salvarEditor);
  $('#e-cancelar').addEventListener('click', tentarFecharEditor);
  $('#e-fechar').addEventListener('click', tentarFecharEditor);
  $('#e-apagar').addEventListener('click', () => excluirItem(estado.editando));
  $('#e-form').addEventListener('input', () => { estado.sujo = true; });

  $('#e-previa-btn').addEventListener('click', () => {
    const proximo = $('#e-previa-btn').getAttribute('aria-pressed') !== 'true';
    $('#e-previa-btn').setAttribute('aria-pressed', String(proximo));
    $('#e-previa').classList.toggle('ativa', proximo);
    $('#editor').classList.toggle('duas-colunas', proximo);
    if (proximo) $('#e-previa').innerHTML = renderMarkdown($('#f-corpo').value);
  });

  $('#f-corpo').addEventListener('input', () => {
    if ($('#e-previa').classList.contains('ativa')) {
      $('#e-previa').innerHTML = renderMarkdown($('#f-corpo').value);
    }
  });

  $('#editor').addEventListener('cancel', (evento) => {
    if (estado.sujo && !window.confirm('Descartar as alterações não salvas?')) evento.preventDefault();
  });

  $('#detalhe').addEventListener('close', () => {
    if (location.hash) history.replaceState(null, '', '#');
    estado.aberto = null;
  });

  /* ---- teclado ---- */
  document.addEventListener('keydown', (evento) => {
    const digitando = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if (evento.key === '/' && !digitando && !$('#editor').open) {
      evento.preventDefault();
      $('#q').focus();
    }
    if (evento.key === 'Escape' && !digitando && $('#q').value) {
      $('#q').value = '';
      estado.consulta = '';
      $('#limpar').dataset.visivel = '0';
      render();
    }
  });
}

/* -------------------------------------------------------------------- boot */

carregarFavoritos();
ligarEventos();
carregar().then(() => {
  const alvo = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (alvo) abrirDetalhe(alvo);
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline é opcional */ });
  });
}
