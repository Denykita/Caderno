/**
 * Configuração do modo nuvem (GitHub Pages + Google Drive).
 *
 * Preencha os dois campos depois de criar o Client ID no Google Cloud e a pasta
 * no Drive. Esses valores não são segredos: o Client ID é público e o ID da
 * pasta sozinho não dá acesso a nada (a pasta continua privada).
 *
 * Enquanto estiverem vazios, o app usa o servidor local (node servidor.mjs).
 */
export const CONFIG = {
  clientId: '',
  pastaId: '',
};
