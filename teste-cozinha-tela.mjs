/**
 * Teste de integração do modo cozinha sem navegador: DOM, voz e áudio falsos.
 *
 *   node ferramentas/teste-cozinha-tela.mjs
 *
 * Percorre o fluxo inteiro: menu → ingredientes → passos → cronômetro →
 * comando de voz "aguarde mais 10 minutos" → anotação salva na receita.
 */

import assert from 'node:assert/strict';
import { lerItens } from '../lib/receitas.mjs';

const ID = '50-salgados-economicos-de-carne';
const itemBase = (await lerItens('receitas')).find((i) => i.id === ID);

/* ----------------------------------------------------------------- DOM falso */

class Elemento {
  constructor(seletor) {
    this.seletor = seletor;
    this._html = '';
    this.attrs = {};
    this.dataset = {};
    this.handlers = {};
    this.value = '';
    this.title = '';
    this.hidden = false;
    this.open = false;
    this.href = '';
    this.disabled = false;
    this.textContent = '';
    this.classList = {
      lista: new Set(),
      contains: (c) => this.classList.lista.has(c),
      toggle: (c, ligar) => {
        const deve = ligar === undefined ? !this.classList.lista.has(c) : ligar;
        if (deve) this.classList.lista.add(c);
        else this.classList.lista.delete(c);
      },
      add: (c) => this.classList.lista.add(c),
      remove: (c) => this.classList.lista.delete(c),
    };
  }
  set innerHTML(v) { this._html = String(v); }
  get innerHTML() { return this._html; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener(tipo, fn) { (this.handlers[tipo] ||= []).push(fn); }
  disparar(tipo, evento = {}) {
    for (const fn of this.handlers[tipo] || []) {
      fn({ stopPropagation() {}, preventDefault() {}, target: { closest: () => null }, ...evento });
    }
  }
  querySelector() { return null; }
  focus() {}
  blur() {}
}

const mapa = new Map();
const elemento = (sel) => {
  if (!mapa.has(sel)) mapa.set(sel, new Elemento(sel));
  return mapa.get(sel);
};

const definir = (nome, valor) =>
  Object.defineProperty(globalThis, nome, { value: valor, configurable: true, writable: true });

definir('document', {
  title: '',
  querySelector: elemento,
  addEventListener() {},
  activeElement: { tagName: 'BODY' },
});
definir('location', { search: `?id=${ID}&fonte=local`, href: '', protocol: 'http:' });
definir('localStorage', {
  dados: new Map(),
  getItem(chave) { return this.dados.has(chave) ? this.dados.get(chave) : null; },
  setItem(chave, valor) { this.dados.set(chave, String(valor)); },
  removeItem(chave) { this.dados.delete(chave); },
});

/* ------------------------------------------------------------------ voz falsa */

const falas = [];
const falasInfo = [];
let reconhecimento = null;
let osciladores = 0;

class Fala {
  constructor(texto) { this.text = texto; }
}
class Reconhecimento {
  constructor() { reconhecimento = this; }
  start() {}
  stop() {}
}
const sintese = {
  atraso: 0,
  onvoiceschanged: null,
  getVoices: () => [{ lang: 'pt-BR', name: 'Falsa' }],
  cancel() {},
  speak(fala) {
    falas.push(fala.text);
    falasInfo.push({ texto: fala.text, rate: fala.rate, volume: fala.volume });
    falandoFake = true;
    setTimeout(() => {
      falandoFake = false;
      fala.onend?.();
    }, sintese.atraso);
  },
};
let falandoFake = false;
const estadoFalando = () => falandoFake;

class AudioContexto {
  constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
  createOscillator() {
    osciladores++;
    return {
      type: 'sine', frequency: { value: 0 },
      connect: () => ({ connect: () => ({}) }),
      start() {}, stop() {},
    };
  }
  createGain() {
    return {
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect: () => ({ connect: () => ({}) }),
    };
  }
  resume() {}
}

definir('window', {
  speechSynthesis: sintese,
  SpeechRecognition: Reconhecimento,
  webkitSpeechRecognition: Reconhecimento,
  AudioContext: AudioContexto,
  webkitAudioContext: AudioContexto,
  SpeechSynthesisUtterance: Fala,
  setTimeout,
});
definir('navigator', {
  wakeLock: { request: async () => ({ addEventListener() {} }) },
});

/* ------------------------------------------------------------------ fetch falso */

const chamadas = [];
definir('fetch', async (url, opcoes = {}) => {
  chamadas.push({ url, opcoes });
  if (opcoes.method === 'PUT') {
    const dados = JSON.parse(opcoes.body);
    return { ok: true, status: 200, json: async () => ({ item: { ...itemBase, corpo: dados.corpo } }) };
  }
  return { ok: true, status: 200, json: async () => ({ item: itemBase }) };
});

/* --------------------------------------------------------------------- fluxo */

await import('../app/cozinha.js');
const esperar = (ms = 30) => new Promise((r) => setTimeout(r, ms));
await esperar(60);
// a saudação termina e o app reabre o microfone (~250 ms depois)
await esperar(400);

const visivel = (id) => elemento(id).hidden === false;

assert.equal(visivel('#cz-menu'), true, 'deve abrir no menu');
assert.equal(elemento('#cz-titulo').textContent, '50 salgados econômicos de carne');
assert.match(elemento('#cz-menu-meta').textContent, /14 ingredientes/);
assert.match(elemento('#cz-menu-meta').textContent, /5 passos/);

// Preparar → ingrediente 1
elemento('#cz-btn-preparar').disparar('click');
assert.equal(visivel('#cz-ingrediente'), true);
assert.equal(elemento('#cz-ing-progresso').textContent, 'Ingrediente 1 de 14');
assert.match(elemento('#cz-ing-texto').textContent, /50 ml de óleo/);

/* --- regressão: o app não pode se ouvir enquanto fala --- */
sintese.atraso = 300; // simula uma fala de 300 ms
elemento('#cz-ing-repetir').disparar('click');
assert.equal(estadoFalando(), true, 'deve estar falando');
reconhecimento.onresult({ results: [{ 0: { transcript: 'ok' }, isFinal: true }] });
assert.equal(
  elemento('#cz-ing-progresso').textContent,
  'Ingrediente 1 de 14',
  'comando ouvido durante a própria fala deve ser ignorado',
);
await esperar(700); // deixa a fala terminar e passar o tempo de guarda
sintese.atraso = 0;

// barulho de conversa não pode avançar
reconhecimento.onresult({ results: [{ 0: { transcript: 'bom dia' }, isFinal: true }] });
assert.equal(elemento('#cz-ing-progresso').textContent, 'Ingrediente 1 de 14', 'fala desconhecida não avança');
assert.match(elemento('#cz-ouvido').textContent, /não entendi/);

// percorre os 14 ingredientes
for (let i = 0; i < 14; i++) elemento('#cz-ing-ok').disparar('click');
assert.equal(visivel('#cz-passo'), true, 'depois dos ingredientes vem o passo 1');
assert.equal(elemento('#cz-passo-progresso').textContent, 'Passo 1 de 5');

// avança até o passo do forno (o quinto)
for (let i = 0; i < 4; i++) elemento('#cz-passo-ok').disparar('click');
assert.match(elemento('#cz-passo-texto').textContent, /forno pré-aquecido/i);
assert.equal(elemento('#cz-btn-cronometro').hidden, false, 'passo com tempo mostra o botão do cronômetro');
assert.match(elemento('#cz-btn-cronometro').textContent, /8 min/);
assert.match(elemento('#cz-passo-chips').innerHTML, /250 °C/);
assert.match(elemento('#cz-passo-chips').innerHTML, /pré-aquecer/);

// inicia o cronômetro por voz ("iniciar"), com bipe de confirmação
await esperar(350); // a fala do passo precisa terminar antes de ouvir
const bipesAntes = osciladores;
reconhecimento.onresult({ results: [{ 0: { transcript: 'iniciar' }, isFinal: true }] });
assert.equal(visivel('#cz-cronometro'), true, 'comando "iniciar" deve abrir o cronômetro');
assert.equal(elemento('#cz-relogio').textContent, '08:00');
assert.match(elemento('#cz-cron-rotulo').textContent, /8 min/);
assert.ok(osciladores > bipesAntes, 'deve soar o bipe ao entender o comando');
assert.match(elemento('#cz-ouvido').textContent, /iniciar/);

// comando de voz: "aguarde mais 10 minutos"
assert.ok(reconhecimento, 'o reconhecimento de voz deve ter sido iniciado');
await esperar(350); // espera a fala do cronômetro terminar
reconhecimento.onresult({ results: [{ 0: { transcript: 'aguarde mais 10 minutos' }, isFinal: true }] });
assert.equal(elemento('#cz-relogio').textContent, '10:00', 'o comando de voz deve esticar o cronômetro');

/* --- voz: velocidade e volume --- */
await esperar(400); // deixa a fala do cronômetro terminar
reconhecimento.onresult({ results: [{ 0: { transcript: 'fala mais devagar' }, isFinal: true }] });
await esperar(40);
assert.equal(falasInfo.at(-1).rate, 0.9, 'a próxima fala deve sair mais devagar');
assert.match(elemento('#cz-vel-valor').textContent, /0,9/, 'o menu deve mostrar 0,9×');

await esperar(400);
reconhecimento.onresult({ results: [{ 0: { transcript: 'abaixa o volume' }, isFinal: true }] });
await esperar(40);
assert.equal(falasInfo.at(-1).volume, 0.8, 'a próxima fala deve sair mais baixa');
assert.match(elemento('#cz-vol-valor').textContent, /80%/, 'o menu deve mostrar 80%');

await esperar(400);
reconhecimento.onresult({ results: [{ 0: { transcript: 'velocidade normal' }, isFinal: true }] });
await esperar(40);
assert.equal(falasInfo.at(-1).rate, 1, 'voltar ao normal deve devolver velocidade 1,0');

// pronto → vai para as anotações
elemento('#cz-cron-pronto').disparar('click');
assert.equal(visivel('#cz-notas'), true);

// salva a anotação
elemento('#cz-nota-texto').value = 'Ficou bom, mas na próxima coloco menos sal';
elemento('#cz-nota-salvar').disparar('click');
await esperar(60);

const put = chamadas.find((c) => c.opcoes.method === 'PUT');
assert.ok(put, 'deve gravar a anotação via PUT');
assert.ok(put.url.includes(`/api/itens/${ID}`));
const corpoEnviado = JSON.parse(put.opcoes.body).corpo;
assert.match(corpoEnviado, /## Anotações/);
assert.match(corpoEnviado, /Ficou bom, mas na próxima coloco menos sal/);

// o resumo falado saiu para o alto-falante
assert.ok(falas.some((f) => f.includes('Diga resumo ou preparar')), 'deve falar ao abrir');
assert.ok(falas.some((f) => f.includes('Cronômetro de 8 min')), 'deve anunciar o cronômetro');

console.log(`teste de tela do modo cozinha: ok (${falas.length} falas, ${chamadas.length} chamadas de API)`);
process.exit(0);
