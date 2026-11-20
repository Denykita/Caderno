/**
 * Testes do modo cozinha (núcleo puro).
 *
 *   node ferramentas/teste-cozinha.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lerItens } from '../lib/receitas.mjs';
import {
  limparMarkdown,
  analisarDuracao,
  analisarTemperatura,
  pedePreaquecer,
  pedeVirar,
  analisarPasso,
  dividirPassos,
  extrairAnotacoes,
  montarRoteiro,
  fraseDeResumo,
  fraseDoIngrediente,
  fraseDoPasso,
  detectarIntencao,
  analisarExtensao,
  rotuloDuracao,
} from '../app/cozinha-nucleo.js';

/* ------------------------------------------------------------------ texto */

test('limparMarkdown tira marcação sem perder o texto', () => {
  assert.equal(limparMarkdown('**Massa:** misture  [vídeo](https://x.com) e `sal`'), 'Massa: misture vídeo e sal');
});

/* -------------------------------------------------------------- durações */

test('duração entende os formatos de receita', () => {
  assert.equal(analisarDuracao('por 30 minutos').minutos, 30);
  assert.equal(analisarDuracao('1 h 30 min').minutos, 90);
  assert.equal(analisarDuracao('1 hora').minutos, 60);
  assert.equal(analisarDuracao('50 a 70 min').minutos, 50);
  assert.equal(analisarDuracao('20 a 25 minutos').minutos, 20);
  assert.equal(analisarDuracao('1,5 a 2 h').minutos, 90);
  assert.equal(analisarDuracao('7min').minutos, 7);
  assert.equal(analisarDuracao('misture tudo'), null);
  assert.equal(analisarDuracao('180 graus'), null);
});

test('rótulo da duração fica legível', () => {
  assert.equal(rotuloDuracao(30), '30 min');
  assert.equal(rotuloDuracao(60), '1 h');
  assert.equal(rotuloDuracao(90), '1 h 30 min');
  assert.equal(rotuloDuracao(0), '');
});

test('temperatura e pistas do passo', () => {
  assert.equal(analisarTemperatura('forno a 180 graus'), 180);
  assert.equal(analisarTemperatura('acima de 250 °C'), 250);
  assert.equal(analisarTemperatura('preaquecido a 200graus'), 200);
  assert.equal(analisarTemperatura('180gr'), 180);
  assert.equal(analisarTemperatura('misture tudo'), null);

  assert.equal(pedePreaquecer('forno pré-aquecido'), true);
  assert.equal(pedePreaquecer('forno preaquecido'), true);
  assert.equal(pedePreaquecer('leve ao forno'), false);
  assert.equal(pedeVirar('vire na metade do tempo'), true);
  assert.equal(pedeVirar('mexa sem parar'), true);
  assert.equal(pedeVirar('reserve'), false);
});

test('passo com forno e tempo junta duração, temperatura e preaquecimento', () => {
  const passo = analisarPasso('Leve ao forno pré-aquecido, acima de 250 °C, por cerca de 8 minutos, até dourar.');
  assert.equal(passo.minutos, 8);
  assert.equal(passo.temperatura, 250);
  assert.equal(passo.preaquecer, true);
  assert.equal(passo.rotuloTempo, '8 min');
  assert.equal(passo.tipo, 'passo');
});

/* --------------------------------------------------------------- roteiro */

test('dividirPassos separa blocos, listas e parágrafos', () => {
  const corpo = [
    '## Ingredientes',
    '',
    '- sal',
    '',
    '## Modo de fazer',
    '',
    '**Molho branco**',
    '',
    '1. Ferva o leite.',
    '2. Junte a farinha.',
    '',
    '**Montagem**',
    '',
    '1. Alterne camadas.',
    '',
    '> nota de rodapé',
    '',
    '## Observações',
    '',
    '- isto não é passo',
  ].join('\n');

  const { temSecao, passos } = dividirPassos(corpo);
  assert.equal(temSecao, true);
  assert.deepEqual(passos.map((p) => p.tipo), ['bloco', 'passo', 'passo', 'bloco', 'passo']);
  assert.deepEqual(passos.map((p) => p.texto), ['Molho branco', 'Ferva o leite.', 'Junte a farinha.', 'Montagem', 'Alterne camadas.']);
});

test('receita sem modo de fazer é reconhecida como tal', () => {
  const { temSecao, passos } = dividirPassos('## Ingredientes\n\n- 300 g de polvilho\n');
  assert.equal(temSecao, false);
  assert.equal(passos.length, 0);
});

test('anotações saem da seção certa', () => {
  const corpo = '## Modo\n\n1. Faça.\n\n## Anotações\n\n- 14/11/2026 — ficou bom\n- 15/11/2026 — faltou sal\n';
  assert.deepEqual(extrairAnotacoes(corpo), ['14/11/2026 — ficou bom', '15/11/2026 — faltou sal']);
});

test('roteiro de receita real separa ingredientes, passos e cronômetro', async () => {
  const itens = await lerItens('receitas');
  const roteiro = montarRoteiro(itens.find((i) => i.id === '50-salgados-economicos-de-carne'));

  assert.equal(roteiro.titulo, '50 salgados econômicos de carne');
  assert.equal(roteiro.ingredientes.length, 14);
  assert.equal(roteiro.temPassos, true);
  assert.equal(roteiro.temCronometro, true);
  const comForno = roteiro.passos.find((p) => p.minutos);
  assert.equal(comForno.minutos, 8);
  assert.equal(comForno.temperatura, 250);
  assert.equal(comForno.preaquecer, true);
});

test('receita só com ingredientes não inventa passos', async () => {
  const itens = await lerItens('receitas');
  const roteiro = montarRoteiro(itens.find((i) => i.id === 'tempura-de-legumes-e-camarao'));
  assert.equal(roteiro.temPassos, false);
  assert.equal(roteiro.passos.length, 0);
  assert.match(fraseDeResumo(roteiro), /ainda não tem modo de fazer/);
});

/* ----------------------------------------------------------------- falas */

test('resumo falado cita tempo, porções, contagem e anotações', async () => {
  const itens = await lerItens('receitas');
  const roteiro = montarRoteiro(itens.find((i) => i.id === 'cookies-de-aveia-receita-da-dete'));
  const frase = fraseDeResumo(roteiro);

  assert.match(frase, /Receita Cookies de aveia/);
  assert.match(frase, /Tempo de preparo: 20 min no forno/);
  assert.match(frase, /Rende 16 cookies/);
  assert.match(frase, /12 ingredientes e 6 passos/);
});

test('frase do passo anuncia preaquecimento e tempo', () => {
  const passo = analisarPasso('Asse em forno pré-aquecido a 180 graus por 30 minutos.');
  const frase = fraseDoPasso(passo, 2, 5);
  assert.match(frase, /Passo 2 de 5/);
  assert.match(frase, /Preaqueça a 180 graus/);
  assert.match(frase, /Isso leva 30 min/);
});

test('frase de bloco não numera passo', () => {
  const frase = fraseDoPasso({ tipo: 'bloco', texto: 'Molho branco' }, 1, 3);
  assert.equal(frase, 'Agora: Molho branco.');
});

test('frase do ingrediente numera', () => {
  assert.equal(fraseDoIngrediente('200 ml de água', 3, 9), 'Ingrediente 3 de 9: 200 ml de água.');
});

/* -------------------------------------------------------------- intenções */

test('reconhece os comandos combinados', () => {
  assert.equal(detectarIntencao('Resumo'), 'resumo');
  assert.equal(detectarIntencao('executar'), 'preparar');
  assert.equal(detectarIntencao('preparar a receita'), 'preparar');
  assert.equal(detectarIntencao('começar'), 'preparar');
  assert.equal(detectarIntencao('vamos'), 'preparar');
  assert.equal(detectarIntencao('ok'), 'ok');
  assert.equal(detectarIntencao('Tenho'), 'ok');
  assert.equal(detectarIntencao('próximo'), 'ok');
  assert.equal(detectarIntencao('Pronto'), 'ok');
  assert.equal(detectarIntencao('continuar'), 'ok');
  assert.equal(detectarIntencao('certo'), 'ok');
  assert.equal(detectarIntencao('beleza'), 'ok');
  assert.equal(detectarIntencao('repetir'), 'repetir');
  assert.equal(detectarIntencao('não ouvi'), 'repetir');
  assert.equal(detectarIntencao('aguarde mais 10 minutos'), 'mais-tempo');
  assert.equal(detectarIntencao('mais 5 minutos'), 'mais-tempo');
  assert.equal(detectarIntencao('quero anotar'), 'anotar');
  assert.equal(detectarIntencao('sair'), 'sair');
  assert.equal(detectarIntencao('pular'), 'pular');
  assert.equal(detectarIntencao('pausar'), 'pausar');
});

test('comando de cronômetro não é confundido com início do preparo', () => {
  assert.equal(detectarIntencao('iniciar'), 'iniciar');
  assert.equal(detectarIntencao('cronômetro'), 'iniciar');
  assert.equal(detectarIntencao('marcar tempo'), 'iniciar');
  assert.equal(detectarIntencao('começar a contar'), 'iniciar');
  assert.equal(detectarIntencao('iniciar preparo'), 'preparar');
});

test('volume e velocidade da voz', () => {
  assert.equal(detectarIntencao('aumenta o volume'), 'mais-volume');
  assert.equal(detectarIntencao('volume mais alto'), 'mais-volume');
  assert.equal(detectarIntencao('abaixa o volume'), 'menos-volume');
  assert.equal(detectarIntencao('diminui o volume'), 'menos-volume');

  assert.equal(detectarIntencao('fala mais devagar'), 'mais-devagar');
  assert.equal(detectarIntencao('mais lento'), 'mais-devagar');
  assert.equal(detectarIntencao('diminui a velocidade'), 'mais-devagar');
  assert.equal(detectarIntencao('mais rápido'), 'mais-rapido');
  assert.equal(detectarIntencao('aumenta a velocidade'), 'mais-rapido');
  assert.equal(detectarIntencao('acelera'), 'mais-rapido');
  assert.equal(detectarIntencao('velocidade normal'), 'voz-normal');

  // não pode roubar os comandos do cronômetro
  assert.equal(detectarIntencao('aguarde mais 10 minutos'), 'mais-tempo');
  assert.equal(detectarIntencao('mais 5 minutos'), 'mais-tempo');
  assert.equal(detectarIntencao('iniciar'), 'iniciar');
});

test('não inventa comando quando a pessoa conversa', () => {
  assert.equal(detectarIntencao('que dia é hoje'), null);
  assert.equal(detectarIntencao(''), null);
  assert.equal(detectarIntencao('   '), null);
});

test('extensão do cronômetro entende "mais X minutos"', () => {
  assert.equal(analisarExtensao('mais 10 minutos'), 10);
  assert.equal(analisarExtensao('aguarde mais 5 min'), 5);
  assert.equal(analisarExtensao('mais 1 hora'), 60);
  assert.equal(analisarExtensao('ok'), 10);
});
