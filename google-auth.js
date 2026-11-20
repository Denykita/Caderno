/**
 * Login do Google no navegador (Google Identity Services).
 *
 * Só é usado no modo Drive. O token fica em memória — nada de refresh token
 * salvo em localStorage. Quando expira (1 h), pedimos outro em silêncio; se o
 * navegador exigir clique, a interface mostra o botão "Conectar".
 */

const ORIGEM_GIS = 'https://accounts.google.com/gsi/client';
const ESCOPO = 'https://www.googleapis.com/auth/drive';
const CHAVE_TOKEN = 'caderno:drive-token';

let promessaGis = null;
let cliente = null;
let clienteDe = '';
let token = null;
let expiraEm = 0;
let pendente = null;

/**
 * O token fica em sessionStorage para sobreviver à troca de página
 * (caderno → modo cozinha). Morre quando a aba fecha. Não é cookie e não
 * vai para o servidor.
 */
function lerTokenSalvo() {
  try {
    const salvo = JSON.parse(sessionStorage.getItem(CHAVE_TOKEN) || 'null');
    if (salvo?.token && salvo?.expiraEm > Date.now()) {
      token = salvo.token;
      expiraEm = salvo.expiraEm;
    }
  } catch {
    /* sem sessionStorage (modo privado): segue em memória */
  }
}

function gravarToken() {
  try {
    sessionStorage.setItem(CHAVE_TOKEN, JSON.stringify({ token, expiraEm }));
  } catch {
    /* sem sessionStorage: segue em memória */
  }
}

lerTokenSalvo();

function carregarGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  promessaGis ||= new Promise((ok, erro) => {
    const script = document.createElement('script');
    script.src = ORIGEM_GIS;
    script.async = true;
    script.defer = true;
    script.onload = () => ok();
    script.onerror = () => {
      promessaGis = null;
      erro(new Error('não consegui carregar o login do Google (sem internet?)'));
    };
    document.head.append(script);
  });
  return promessaGis;
}

async function garantirCliente(clientId) {
  if (cliente && clienteDe === clientId) return cliente;
  await carregarGis();

  cliente = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: ESCOPO,
    callback: (resposta) => {
      const espera = pendente;
      pendente = null;
      if (resposta.error) {
        espera?.erro(new Error(resposta.error));
        return;
      }
      token = resposta.access_token;
      expiraEm = Date.now() + (Number(resposta.expires_in) || 3600) * 1000;
      gravarToken();
      espera?.ok(token);
    },
    error_callback: (falha) => {
      const espera = pendente;
      pendente = null;
      espera?.erro(new Error(falha?.type || 'login cancelado'));
    },
  });
  clienteDe = clientId;
  return cliente;
}

export function temToken() {
  if (!token) lerTokenSalvo();
  return Boolean(token) && Date.now() < expiraEm - 60_000;
}

/**
 * Pede um token. `prompt: ''` tenta em silêncio (precisa de um consentimento
 * anterior); `prompt: 'consent'` abre a tela do Google — chame só no clique.
 */
export async function pedirToken(clientId, { prompt = '', forcar = false } = {}) {
  if (!clientId) throw new Error('Client ID não configurado');
  const c = await garantirCliente(clientId);
  if (!forcar && temToken()) return token;

  return new Promise((ok, erro) => {
    pendente = { ok, erro };
    try {
      c.requestAccessToken({ prompt });
    } catch (falha) {
      pendente = null;
      erro(falha);
    }
  });
}

export function esquecerToken() {
  token = null;
  expiraEm = 0;
  try {
    sessionStorage.removeItem(CHAVE_TOKEN);
  } catch {
    /* nada a limpar */
  }
}
