/**
 * Modo cozinha: conduz a receita falando, ouvindo e contando o tempo.
 * A lógica de texto fica em cozinha-nucleo.js; aqui é DOM, voz e cronômetro.
 */

import { anexarNota } from './nucleo.js';
import * as dados from './dados.js';
import {
  montarRoteiro,
  fraseDeResumo,
  fraseDoIngrediente,
  fraseDoPasso,
  detectarIntencao,
  analisarExtensao,
  rotuloDuracao,
} from './cozinha-nucleo.js';

const $ = (sel) => document.querySelector(sel);
const hojeBR = () => new Date().toLocaleDateString('pt-BR');

/** ?demo=1 — cronômetros de 12 s, para ver o ciclo inteiro sem esperar. */
const DEMO = new URLSearchParams(location.search).get('demo') === '1';
const SEGUNDOS_DEMO = 12;
const duracaoMs = (minutos) => (DEMO ? SEGUNDOS_DEMO : Math.max(1, minutos) * 60) * 1000;

const TELAS = ['cz-carregando', 'cz-erro', 'cz-menu', 'cz-resumo', 'cz-ingrediente', 'cz-passo', 'cz-cronometro', 'cz-notas'];

const estado = {
  item: null,
  roteiro: null,
  tela: 'carregando',
  indiceIng: 0,
  indicePasso: 0,
  passoAtual: null,
  voz: true,
  falando: false,
  ouvindo: false,
  cron: null,
  audio: { volume: 1, velocidade: 1 },
};

/* ------------------------------------------------------------------ áudio */

const CHAVE_AUDIO = 'caderno:voz';
const AUDIO = { volMin: 0.2, volMax: 1, volPasso: 0.2, velMin: 0.6, velMax: 1.6, velPasso: 0.1 };

const limitar = (valor, minimo, maximo, padrao) => {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return padrao;
  return Math.min(maximo, Math.max(minimo, numero));
};
const arredondar = (valor) => Math.round(valor * 10) / 10;

function carregarAudio() {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_AUDIO) || 'null');
    if (!salvo) return;
    estado.audio.volume = arredondar(limitar(salvo.volume, AUDIO.volMin, AUDIO.volMax, 1));
    estado.audio.velocidade = arredondar(limitar(salvo.velocidade, AUDIO.velMin, AUDIO.velMax, 1));
  } catch {
    /* sem localStorage: fica no padrão */
  }
}

function salvarAudio() {
  try {
    localStorage.setItem(CHAVE_AUDIO, JSON.stringify(estado.audio));
  } catch {
    /* segue só na sessão */
  }
}

function renderAudio() {
  const alvoVolume = $('#cz-vol-valor');
  const alvoVelocidade = $('#cz-vel-valor');
  if (alvoVolume) alvoVolume.textContent = `${Math.round(estado.audio.volume * 100)}%`;
  if (alvoVelocidade) alvoVelocidade.textContent = `${estado.audio.velocidade.toFixed(1).replace('.', ',')}×`;
}

function ajustarVolume(delta) {
  estado.audio.volume = arredondar(limitar(estado.audio.volume + delta, AUDIO.volMin, AUDIO.volMax, 1));
  salvarAudio();
  renderAudio();
  avisar(`Volume ${Math.round(estado.audio.volume * 100)}%`);
  falar(delta > 0 ? 'Volume mais alto.' : 'Volume mais baixo.');
}

function ajustarVelocidade(delta) {
  estado.audio.velocidade = arredondar(limitar(estado.audio.velocidade + delta, AUDIO.velMin, AUDIO.velMax, 1));
  salvarAudio();
  renderAudio();
  avisar(`Velocidade ${estado.audio.velocidade.toFixed(1).replace('.', ',')}×`);
  falar(delta > 0 ? 'Falando mais rápido.' : 'Falando mais devagar.');
}

function velocidadeNormal() {
  estado.audio.velocidade = 1;
  salvarAudio();
  renderAudio();
  avisar('Velocidade normal');
  falar('Velocidade normal.');
}

/* ------------------------------------------------------------------ aviso */

let avisoTimer = null;
function avisar(mensagem, tipo = 'ok') {
  const alvo = $('#cz-toast');
  alvo.textContent = mensagem;
  alvo.className = tipo === 'erro' ? 'erro' : '';
  alvo.dataset.visivel = '1';
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { alvo.dataset.visivel = '0'; }, tipo === 'erro' ? 5000 : 2600);
}

/* -------------------------------------------------------------------- voz */

let vozEscolhida = null;
let falaAtual = 0;
let fimFalaEm = 0;
const ESPERA_APOS_FALA = 250;

function carregarVozes() {
  if (!('speechSynthesis' in window)) return;
  const vozes = window.speechSynthesis.getVoices();
  vozEscolhida =
    vozes.find((v) => /^pt[-_]BR/i.test(v.lang)) ||
    vozes.find((v) => /^pt/i.test(v.lang)) ||
    null;
}
if ('speechSynthesis' in window) {
  carregarVozes();
  window.speechSynthesis.onvoiceschanged = carregarVozes;
}

/** Fala e, quando terminar, chama o callback. Pausa o microfone para não ouvir a si mesmo. */
function falar(texto, aoTerminar) {
  const minhaFala = ++falaAtual;

  const terminar = () => {
    // fala antiga (cancelada para dar lugar a outra) não pode reabrir o microfone
    if (minhaFala !== falaAtual) return;
    estado.falando = false;
    fimFalaEm = Date.now();
    aoTerminar?.();
    if (estado.voz && !estado.falando) retomarEscuta();
  };

  if (!('speechSynthesis' in window)) {
    terminar();
    return;
  }
  const Fala = window.SpeechSynthesisUtterance;
  if (!Fala) {
    terminar();
    return;
  }
  pausarEscuta();
  window.speechSynthesis.cancel();
  const fala = new Fala(texto);
  fala.lang = 'pt-BR';
  fala.rate = estado.audio.velocidade;
  fala.volume = estado.audio.volume;
  if (vozEscolhida) fala.voice = vozEscolhida;
  fala.onend = terminar;
  fala.onerror = terminar;
  estado.falando = true;
  window.speechSynthesis.speak(fala);
}

function calar() {
  falaAtual++;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  estado.falando = false;
  fimFalaEm = Date.now();
}

/* --------------------------------------------------------------- microfone */

const ClasseReconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;
let reconhecimento = null;
let reiniciarTimer = null;
let ouvidoTimer = null;
let ultimoComando = { nome: null, quando: 0 };

/** Mostra no rodapé o que o microfone entendeu — sem isso a pessoa fica no escuro. */
function mostrarOuvido(frase, comando) {
  const alvo = $('#cz-ouvido');
  const limpo = String(frase || '').trim();
  if (!limpo) return;
  alvo.textContent = comando ? `ouvi: “${limpo}”` : `não entendi: “${limpo}”`;
  alvo.classList.toggle('entendeu', Boolean(comando));
  clearTimeout(ouvidoTimer);
  ouvidoTimer = setTimeout(() => { alvo.textContent = ''; }, 4500);
}

function iniciarEscuta() {
  if (!ClasseReconhecimento || !estado.voz) return;
  try {
    reconhecimento ||= new ClasseReconhecimento();
  } catch {
    return;
  }
  if (estado.ouvindo) return;

  reconhecimento.lang = 'pt-BR';
  reconhecimento.continuous = true;
  reconhecimento.interimResults = true;
  reconhecimento.maxAlternatives = 1;

  reconhecimento.onresult = (evento) => {
    // enquanto o app fala, o microfone está fechado; resultado atrasado é eco
    if (estado.falando) return;
    if (Date.now() - fimFalaEm < ESPERA_APOS_FALA) return;

    // resultados parciais: "ok" chega rápido e não precisa esperar a finalização
    const ultimo = evento.results[evento.results.length - 1];
    const frase = ultimo?.[0]?.transcript || '';
    if (!frase.trim()) return;

    const comando = detectarIntencao(frase, contextoDeComando());
    mostrarOuvido(frase, comando);
    if (!comando) return;

    // uma fala não dispara duas ações (o reconhecimento manda parciais e final)
    const agora = Date.now();
    if (comando === ultimoComando.nome && agora - ultimoComando.quando < 900) return;
    ultimoComando = { nome: comando, quando: agora };

    bipeEntendi();
    executar(comando);
  };

  reconhecimento.onerror = (evento) => {
    if (evento.error === 'not-allowed' || evento.error === 'service-not-allowed') {
      estado.voz = false;
      atualizarStatusVoz();
      avisar('Microfone bloqueado. Use os botões.', 'erro');
      return;
    }
    if (evento.error === 'audio-capture') {
      estado.voz = false;
      atualizarStatusVoz();
      avisar('Não achei o microfone. Use os botões.', 'erro');
      return;
    }
    if (evento.error === 'network') {
      atualizarStatusVoz();
      // o Chrome volta sozinho; só avisa uma vez por queda
    }
  };

  reconhecimento.onend = () => {
    estado.ouvindo = false;
    atualizarStatusVoz();
    if (estado.voz && !estado.falando) {
      clearTimeout(reiniciarTimer);
      reiniciarTimer = setTimeout(() => iniciarEscuta(), 180);
    }
  };

  try {
    reconhecimento.start();
    estado.ouvindo = true;
    atualizarStatusVoz();
  } catch {
    estado.ouvindo = false;
  }
}

function pausarEscuta() {
  clearTimeout(reiniciarTimer);
  if (!reconhecimento || !estado.ouvindo) return;
  try { reconhecimento.stop(); } catch { /* já parado */ }
  estado.ouvindo = false;
  atualizarStatusVoz();
}

function retomarEscuta() {
  if (!estado.voz || estado.falando) return;
  clearTimeout(reiniciarTimer);
  reiniciarTimer = setTimeout(() => {
    if (estado.voz && !estado.falando) iniciarEscuta();
  }, 200);
}

function contextoDeComando() {
  if (estado.tela === 'ingrediente') return 'ingrediente';
  if (estado.tela === 'passo') return 'passo';
  if (estado.tela === 'cronometro') return 'cronometro';
  if (estado.tela === 'notas') return 'nota';
  return 'menu';
}

function atualizarStatusVoz() {
  const alvo = $('#cz-voz-status');
  const botao = $('#cz-voz');
  botao.setAttribute('aria-pressed', String(estado.voz));

  if (!ClasseReconhecimento) {
    alvo.textContent = 'voz: só leitura (sem microfone)';
    alvo.classList.add('off');
    return;
  }
  if (!estado.voz) {
    alvo.textContent = 'voz desligada';
    alvo.classList.add('off');
    return;
  }
  alvo.classList.remove('off');
  alvo.textContent = estado.ouvindo ? 'voz: ouvindo' : 'voz: aguardando';
}

/* -------------------------------------------------------------- som curto */

let contextoAudio = null;
function bipe(vezes = 1, duracao = 0.18, frequencia = 880) {
  try {
    contextoAudio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (contextoAudio.state === 'suspended') contextoAudio.resume();
    const agora = contextoAudio.currentTime;
    const pico = Math.max(0.06, 0.28 * estado.audio.volume);
    for (let i = 0; i < vezes; i++) {
      const osc = contextoAudio.createOscillator();
      const ganho = contextoAudio.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequencia;
      const inicio = agora + i * (duracao + 0.12);
      ganho.gain.setValueAtTime(0.0001, inicio);
      ganho.gain.exponentialRampToValueAtTime(pico, inicio + 0.02);
      ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao);
      osc.connect(ganho).connect(contextoAudio.destination);
      osc.start(inicio);
      osc.stop(inicio + duracao + 0.02);
    }
  } catch { /* sem áudio: segue só com a voz */ }
}

/** Bipe curto e agudo de "entendi" — diferente dos bipes do cronômetro. */
function bipeEntendi() {
  bipe(1, 0.07, 1240);
}

/* ------------------------------------------------------------------ telas */

function mostrar(id) {
  for (const tela of TELAS) $('#' + tela).hidden = tela !== id;
  estado.tela = id.replace(/^cz-/, '');
  atualizarRodape();
}

function atualizarRodape() {
  const partes = [];
  if (estado.roteiro) {
    const totalIng = estado.roteiro.ingredientes.length;
    const numerados = estado.roteiro.passos.filter((p) => p.tipo === 'passo');
    if (estado.tela === 'ingrediente') partes.push(`ingrediente ${estado.indiceIng + 1}/${totalIng}`);
    if (estado.tela === 'passo' || estado.tela === 'cronometro') {
      const atual = numeroDoPasso(estado.indicePasso);
      partes.push(`passo ${atual || 1}/${numerados.length}`);
    }
  }
  $('#cz-progresso-geral').textContent = partes.join(' · ');
}

/** Número visível do passo (blocos não contam). */
function numeroDoPasso(indice) {
  if (!estado.roteiro) return 0;
  let n = 0;
  for (let i = 0; i <= indice && i < estado.roteiro.passos.length; i++) {
    if (estado.roteiro.passos[i].tipo === 'passo') n++;
  }
  return n;
}

/* ------------------------------------------------------------------ fluxo */

function abrirMenu(comFala = true) {
  mostrar('cz-menu');
  renderAudio();
  const { roteiro } = estado;
  $('#cz-menu-meta').textContent = [
    roteiro.tempo && `⏱ ${roteiro.tempo}`,
    roteiro.porcoes && `🍽 ${roteiro.porcoes}`,
    `${roteiro.ingredientes.length} ingredientes`,
    roteiro.temPassos ? `${roteiro.passos.filter((p) => p.tipo === 'passo').length} passos` : 'sem modo de fazer',
  ].filter(Boolean).join(' · ');

  const precisaHttps = location.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(location.hostname);
  $('#cz-menu-mic').textContent = [
    precisaHttps
      ? '🔇 Sem https o microfone não abre neste aparelho — toque nos botões. A leitura em voz alta funciona.'
      : '',
    DEMO ? `⚡ Modo demonstração: cronômetros de ${SEGUNDOS_DEMO} s.` : '',
  ].filter(Boolean).join(' ');

  if (comFala) falar(`${roteiro.titulo}. Diga resumo ou preparar.`);
}

function abrirResumo() {
  const { roteiro } = estado;
  const frase = fraseDeResumo(roteiro);
  const linhas = [];
  if (roteiro.tempo) linhas.push(`⏱ Tempo: ${roteiro.tempo}`);
  if (roteiro.porcoes) linhas.push(`🍽 Rende: ${roteiro.porcoes}`);
  linhas.push(`🧾 ${roteiro.ingredientes.length} ingredientes · ${roteiro.passos.filter((p) => p.tipo === 'passo').length} passos`);
  if (roteiro.resumo) linhas.push(`\n${roteiro.resumo}`);
  if (roteiro.anotacoes.length) {
    linhas.push(`\n📝 ${roteiro.anotacoes.length} anotação(ões):`);
    for (const nota of roteiro.anotacoes.slice(-3)) linhas.push(`· ${nota}`);
  }
  if (!roteiro.temPassos) linhas.push('\n⚠ Esta receita ainda não tem modo de fazer cadastrado.');
  $('#cz-resumo-texto').textContent = linhas.join('\n');
  mostrar('cz-resumo');
  falar(frase);
}

function comecarPreparo() {
  if (!estado.roteiro.temPassos && !estado.roteiro.ingredientes.length) {
    avisar('Esta receita não tem ingredientes nem passos.', 'erro');
    return;
  }
  pedirTelaAcordada();
  estado.indiceIng = 0;
  estado.indicePasso = 0;
  irParaIngrediente(0);
}

function irParaIngrediente(indice) {
  const { ingredientes } = estado.roteiro;
  if (indice >= ingredientes.length) {
    irParaPasso(0);
    return;
  }
  estado.indiceIng = indice;
  mostrar('cz-ingrediente');
  $('#cz-ing-progresso').textContent = `Ingrediente ${indice + 1} de ${ingredientes.length}`;
  $('#cz-ing-texto').textContent = ingredientes[indice];
  falar(fraseDoIngrediente(ingredientes[indice], indice + 1, ingredientes.length));
}

function irParaPasso(indice) {
  const { passos } = estado.roteiro;

  if (indice >= passos.length) {
    abrirNotas();
    return;
  }

  estado.indicePasso = indice;
  const passo = passos[indice];
  estado.passoAtual = passo;

  if (passo.tipo === 'bloco') {
    mostrar('cz-passo');
    $('#cz-passo-progresso').textContent = 'próximo bloco';
    $('#cz-passo-texto').textContent = passo.texto;
    $('#cz-passo-chips').innerHTML = '';
    $('#cz-passo-extra').hidden = true;
    falar(fraseDoPasso(passo, numeroDoPasso(indice), numeroDePassos()), () => irParaPasso(indice + 1));
    return;
  }

  if (!estado.roteiro.temPassos) {
    avisar('Sem modo de fazer para este item.', 'erro');
    abrirNotas();
    return;
  }

  mostrar('cz-passo');
  $('#cz-passo-progresso').textContent = `Passo ${numeroDoPasso(indice)} de ${numeroDePassos()}`;
  $('#cz-passo-texto').textContent = passo.texto;

  const chips = [];
  if (passo.minutos) chips.push(`⏱ ${passo.rotuloTempo}`);
  if (passo.temperatura) chips.push(`🌡 ${passo.temperatura} °C`);
  if (passo.preaquecer) chips.push('🔥 pré-aquecer');
  if (passo.virar) chips.push('↻ virar/mexer no meio');
  $('#cz-passo-chips').innerHTML = chips.map((c) => `<span>${c}</span>`).join('');

  const botaoCron = $('#cz-btn-cronometro');
  botaoCron.hidden = !passo.minutos;
  botaoCron.textContent = passo.minutos ? `▶ Cronômetro de ${passo.rotuloTempo}` : '';

  const botaoForno = $('#cz-btn-preaquecer');
  botaoForno.hidden = !(passo.preaquecer && passo.temperatura);
  botaoForno.textContent = passo.temperatura ? `▶ Pré-aquecer ${passo.temperatura} °C (10 min)` : '';

  $('#cz-passo-extra').hidden = botaoCron.hidden && botaoForno.hidden;

  let frase = fraseDoPasso(passo, numeroDoPasso(indice), numeroDePassos());
  if (passo.minutos) frase += ` Diga iniciar para marcar ${passo.rotuloTempo}.`;
  falar(frase);
}

function numeroDePassos() {
  return estado.roteiro.passos.filter((p) => p.tipo === 'passo').length;
}

function repetirAtual() {
  if (estado.tela === 'ingrediente') {
    const { ingredientes } = estado.roteiro;
    falar(fraseDoIngrediente(ingredientes[estado.indiceIng], estado.indiceIng + 1, ingredientes.length));
    return;
  }
  if (estado.tela === 'passo' && estado.passoAtual) {
    const passo = estado.passoAtual;
    if (passo.tipo === 'bloco') falar(fraseDoPasso(passo, 0, 0));
    else falar(fraseDoPasso(passo, numeroDoPasso(estado.indicePasso), numeroDePassos()));
    return;
  }
  if (estado.tela === 'resumo') {
    falar(fraseDeResumo(estado.roteiro));
    return;
  }
  if (estado.tela === 'cronometro') {
    avisar(`Faltam ${formatarRelogio(estado.cron?.restante ?? 0)}`);
  }
}

function avancar() {
  if (estado.tela === 'ingrediente') {
    irParaIngrediente(estado.indiceIng + 1);
    return;
  }
  if (estado.tela === 'passo') {
    irParaPasso(estado.indicePasso + 1);
    return;
  }
  if (estado.tela === 'cronometro') {
    concluirCronometro();
    return;
  }
  if (estado.tela === 'menu') {
    comecarPreparo();
  }
}

/* ------------------------------------------------------------- cronômetro */

function formatarRelogio(ms) {
  const segundos = Math.max(0, Math.ceil(ms / 1000));
  const minutos = Math.floor(segundos / 60);
  return `${String(minutos).padStart(2, '0')}:${String(segundos % 60).padStart(2, '0')}`;
}

function iniciarCronometro(minutos, rotulo, opcoes = {}) {
  pararCronometro(false);
  const total = duracaoMs(minutos);
  estado.cron = {
    total,
    restante: total,
    deadline: Date.now() + total,
    metade: false,
    fim: false,
    rotulo: DEMO ? `${SEGUNDOS_DEMO} s (demo de ${minutos} min)` : rotulo || rotuloDuracao(minutos),
    virar: Boolean(opcoes.virar),
    id: null,
  };
  estado.cron.id = setInterval(tickCronometro, 500);
  mostrar('cz-cronometro');
  $('#cz-cron-rotulo').textContent = `cronômetro · ${estado.cron.rotulo}`;
  $('#cz-cron-dica').textContent = opcoes.dica || 'Aviso na metade do tempo.';
  renderCronometro();
  falar(`Cronômetro de ${estado.cron.rotulo} iniciado. Aviso na metade.`);
  bipe(1);
}

function tickCronometro() {
  const cron = estado.cron;
  if (!cron) return;

  cron.restante = cron.deadline - Date.now();

  if (!cron.metade && cron.restante <= cron.total / 2) {
    cron.metade = true;
    const faltam = rotuloDuracao(Math.max(1, Math.round(cron.restante / 60_000)));
    const dica = cron.virar ? 'Se for virar ou mexer, é agora.' : '';
    falar(`Metade do tempo. Faltam ${faltam}. ${dica}`);
    bipe(2);
  }

  if (!cron.fim && cron.restante <= 0) {
    cron.fim = true;
    clearInterval(cron.id);
    cron.id = null;
    falar('Tempo concluído. Diga aguarde mais 10 minutos, ou pronto.');
    bipe(3, 0.25);
  }

  renderCronometro();
}

function renderCronometro() {
  const cron = estado.cron;
  if (!cron) return;
  const relogio = $('#cz-relogio');
  relogio.textContent = formatarRelogio(cron.restante);
  relogio.classList.toggle('urgente', cron.restante <= 60_000 && !cron.fim);
  relogio.classList.toggle('terminado', cron.fim);
  atualizarRodape();
}

function esticarCronometro(minutos) {
  if (!estado.cron) return;
  const total = duracaoMs(minutos);
  estado.cron.total = total;
  estado.cron.restante = total;
  estado.cron.deadline = Date.now() + total;
  estado.cron.metade = false;
  estado.cron.fim = false;
  if (!estado.cron.id) estado.cron.id = setInterval(tickCronometro, 500);
  renderCronometro();
  falar(DEMO ? `Mais ${SEGUNDOS_DEMO} segundos.` : `Mais ${rotuloDuracao(minutos)}. Novo cronômetro.`);
  bipe(1);
}

function pararCronometro(avisarParada = true) {
  if (!estado.cron) return;
  clearInterval(estado.cron.id);
  estado.cron = null;
  if (avisarParada) calar();
}

function concluirCronometro() {
  const tinha = Boolean(estado.cron);
  pararCronometro();
  if (tinha) bipe(1);
  irParaPasso(estado.indicePasso + 1);
}

function voltarDoCronometro() {
  pararCronometro();
  irParaPasso(estado.indicePasso);
}

/* ------------------------------------------------------------------ notas */

const SUGESTOES = ['Gostei', 'Não gostei', 'Ficou mole', 'Faltou sal', 'Muito doce', 'Acrescentar farinha'];

function abrirNotas() {
  pararCronometro(false);
  mostrar('cz-notas');
  $('#cz-notas-chips').innerHTML = SUGESTOES.map((s) => `<span role="button" tabindex="0">${s}</span>`).join('');
  $('#cz-nota-texto').value = '';
  falar('Terminou. Quer anotar alguma coisa? Toque numa sugestão ou digite.');
  setTimeout(() => $('#cz-nota-texto').focus({ preventScroll: true }), 400);
}

async function salvarNota() {
  const texto = $('#cz-nota-texto').value.trim();
  if (!texto) {
    avisar('Escreva a anotação primeiro.', 'erro');
    falar('Escreva a anotação primeiro.');
    return;
  }

  const botao = $('#cz-nota-salvar');
  botao.disabled = true;
  try {
    const corpo = anexarNota(estado.item.corpo, texto, hojeBR());
    const item = await dados.atualizar(estado.item.id, { ...estado.item, corpo });
    estado.item = item;
    estado.roteiro = montarRoteiro(item);
    avisar('Anotação salva na receita.');
    falar('Anotação salva. Bom apetite.');
  } catch (falha) {
    avisar(`Não deu para salvar: ${falha.message}`, 'erro');
    falar('Não consegui salvar a anotação.');
  } finally {
    botao.disabled = false;
  }
}

/* ---------------------------------------------------------------- comandos */

function executar(comando) {
  if (!comando) return;

  if (comando === 'sair') {
    pararCronometro();
    abrirNotas();
    return;
  }
  if (comando === 'resumo') {
    abrirResumo();
    return;
  }
  if (comando === 'preparar') {
    comecarPreparo();
    return;
  }
  if (comando === 'repetir') {
    repetirAtual();
    return;
  }
  if (comando === 'pausar') {
    calar();
    return;
  }
  if (comando === 'anotar') {
    abrirNotas();
    return;
  }
  if (comando === 'mais-tempo') {
    if (estado.tela === 'cronometro') {
      esticarCronometro(10);
    } else {
      avisar('Não há cronômetro rodando.');
    }
    return;
  }
  if (comando === 'iniciar') {
    if (estado.tela === 'passo') cronometroDoPasso();
    else if (estado.tela === 'menu') comecarPreparo();
    else if (estado.tela === 'cronometro') avisar('O cronômetro já está rodando.');
    else avisar('Este passo não tem tempo para marcar.');
    return;
  }
  if (comando === 'mais-volume') {
    ajustarVolume(AUDIO.volPasso);
    return;
  }
  if (comando === 'menos-volume') {
    ajustarVolume(-AUDIO.volPasso);
    return;
  }
  if (comando === 'mais-rapido') {
    ajustarVelocidade(AUDIO.velPasso);
    return;
  }
  if (comando === 'mais-devagar') {
    ajustarVelocidade(-AUDIO.velPasso);
    return;
  }
  if (comando === 'voz-normal') {
    velocidadeNormal();
    return;
  }
  if (comando === 'ok') {
    avancar();
    return;
  }
  if (comando === 'pular') {
    if (estado.tela === 'cronometro') concluirCronometro();
    else avancar();
  }
}

/* ------------------------------------------------------- tela sempre acesa */

let travaTela = null;

async function pedirTelaAcordada() {
  if (!('wakeLock' in navigator)) return;
  try {
    travaTela = await navigator.wakeLock.request('screen');
    travaTela.addEventListener('release', () => { travaTela = null; });
  } catch {
    /* sem permissão: a tela pode apagar */
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && estado.tela !== 'menu' && !travaTela) pedirTelaAcordada();
});

/* ------------------------------------------------------------------- boot */

async function carregar() {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) {
    $('#cz-erro-texto').textContent = 'Faltou o id da receita na URL. Abra pelo caderno.';
    mostrar('cz-erro');
    return;
  }

  let item;
  try {
    await dados.detectar();
    if (dados.precisaConectar()) throw new Error('conecte o Drive no caderno primeiro');
    item = await dados.ler(id);
  } catch (falha) {
    const faltaConectar = falha.message === 'conecte o Drive no caderno primeiro';
    $('#cz-erro-titulo').textContent = faltaConectar ? 'Falta conectar o Drive' : 'Não consegui abrir';
    $('#cz-erro-texto').textContent =
      falha.message === 'receita não encontrada'
        ? 'Essa receita não existe (talvez tenha sido excluída).'
        : faltaConectar
          ? 'O acesso ao Google Drive é pedido uma vez, neste navegador. Depois disso o modo cozinha abre direto.'
          : 'O servidor do caderno não respondeu. Ele está rodando?';
    $('#cz-erro-conectar').hidden = !faltaConectar;
    document.title = 'Modo cozinha — Caderno';
    $('#cz-titulo').textContent = 'Modo cozinha';
    mostrar('cz-erro');
    return;
  }

  estado.item = item;
  estado.roteiro = montarRoteiro(item);
  document.title = `${item.titulo} — modo cozinha`;
  $('#cz-titulo').textContent = item.titulo;
  $('#cz-categoria').textContent = item.categoria || '';
  abrirMenu(true);
}

/* --------------------------------------------------------------- eventos */

$('#cz-btn-resumo').addEventListener('click', abrirResumo);
$('#cz-btn-preparar').addEventListener('click', comecarPreparo);
$('#cz-btn-comecar').addEventListener('click', comecarPreparo);
$('#cz-btn-voltar-menu').addEventListener('click', () => abrirMenu(false));

$('#cz-ing-ok').addEventListener('click', () => irParaIngrediente(estado.indiceIng + 1));
$('#cz-ing-pular').addEventListener('click', () => irParaIngrediente(estado.indiceIng + 1));
$('#cz-ing-repetir').addEventListener('click', repetirAtual);

$('#cz-passo-ok').addEventListener('click', () => irParaPasso(estado.indicePasso + 1));
$('#cz-passo-pular').addEventListener('click', () => irParaPasso(estado.indicePasso + 1));
$('#cz-passo-repetir').addEventListener('click', repetirAtual);

function cronometroDoPasso() {
  const passo = estado.passoAtual;
  if (!passo?.minutos) {
    avisar('Este passo não tem tempo para marcar.');
    return;
  }
  iniciarCronometro(passo.minutos, passo.rotuloTempo, {
    virar: passo.virar,
    dica: passo.virar
      ? 'Aviso na metade e no fim — se for virar, é na metade.'
      : 'Aviso na metade e no fim.',
  });
}

$('#cz-btn-cronometro').addEventListener('click', cronometroDoPasso);

$('#cz-btn-preaquecer').addEventListener('click', () => {
  const passo = estado.passoAtual;
  if (!passo?.temperatura) return;
  iniciarCronometro(10, '10 min de pré-aquecimento', {
    dica: `Pré-aquecendo a ${passo.temperatura} °C. Depois volte para o passo.`,
  });
});

$('#cz-cron-mais').addEventListener('click', () => esticarCronometro(10));
$('#cz-cron-pronto').addEventListener('click', concluirCronometro);
$('#cz-cron-voltar').addEventListener('click', voltarDoCronometro);

$('#cz-nota-salvar').addEventListener('click', salvarNota);

$('#cz-erro-conectar').addEventListener('click', async () => {
  const botao = $('#cz-erro-conectar');
  botao.disabled = true;
  try {
    await dados.conectar();
    await carregar();
  } catch (falha) {
    avisar(`Não deu para conectar: ${falha.message}`, 'erro');
    botao.disabled = false;
  }
});

$('#cz-vol-mais').addEventListener('click', () => ajustarVolume(AUDIO.volPasso));
$('#cz-vol-menos').addEventListener('click', () => ajustarVolume(-AUDIO.volPasso));
$('#cz-vel-mais').addEventListener('click', () => ajustarVelocidade(AUDIO.velPasso));
$('#cz-vel-menos').addEventListener('click', () => ajustarVelocidade(-AUDIO.velPasso));
$('#cz-nota-encerrar').addEventListener('click', () => {
  calar();
  location.href = 'index.html';
});

$('#cz-notas-chips').addEventListener('click', (evento) => {
  const chip = evento.target.closest('span');
  if (!chip) return;
  const campo = $('#cz-nota-texto');
  const texto = chip.textContent.trim();
  campo.value = campo.value.trim() ? `${campo.value.trim()}. ${texto}` : texto;
  campo.focus();
});

$('#cz-voz').addEventListener('click', () => {
  estado.voz = !estado.voz;
  if (estado.voz) {
    falar('Voz ligada.');
    iniciarEscuta();
  } else {
    pausarEscuta();
    calar();
  }
  atualizarStatusVoz();
});

$('#cz-sair').addEventListener('click', () => {
  pararCronometro();
  abrirNotas();
});

document.addEventListener('keydown', (evento) => {
  if (/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) return;
  if (evento.key === ' ' || evento.key === 'Enter' || evento.key === 'ArrowRight') {
    evento.preventDefault();
    avancar();
  }
  if (evento.key === 'ArrowLeft') {
    evento.preventDefault();
    repetirAtual();
  }
});

carregarAudio();
renderAudio();
carregar();
atualizarStatusVoz();
