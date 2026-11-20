/**
 * Cliente mínimo da Google Drive API v3 (só o que o caderno usa).
 *
 * Sem SDK: fetch direto. Tudo injetável (token e fetch) para poder testar
 * sem rede nem conta Google.
 */

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export function criarClienteDrive({
  pastaId,
  obterToken,
  buscar = (...args) => fetch(...args),
}) {
  if (!pastaId) throw new Error('pastaId não configurado');

  async function pedir(url, opcoes = {}, tentarDeNovo = true, tokenForcado = null) {
    const token = tokenForcado || (await obterToken());
    const resposta = await buscar(url, {
      ...opcoes,
      headers: {
        ...(opcoes.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });

    if (resposta.status === 401 && tentarDeNovo) {
      // token venceu no meio do caminho: pede outro (forçado) e tenta uma vez
      const novo = await obterToken(true);
      return pedir(url, opcoes, false, novo);
    }

    if (!resposta.ok) {
      let detalhe = '';
      try {
        const corpo = await resposta.json();
        detalhe = corpo?.error?.message || '';
      } catch {
        /* resposta sem JSON */
      }
      throw new Error(`Drive respondeu ${resposta.status}${detalhe ? `: ${detalhe}` : ''}`);
    }
    return resposta;
  }

  /** Todos os arquivos da pasta (paginado). */
  async function listar() {
    const consulta = encodeURIComponent(`'${pastaId}' in parents and trashed = false`);
    const campos = encodeURIComponent('files(id,name,modifiedTime),nextPageToken');
    const base = `${API}/files?q=${consulta}&fields=${campos}&pageSize=1000&orderBy=name`;

    const arquivos = [];
    let url = base;
    while (url) {
      const resposta = await pedir(url);
      const dados = await resposta.json();
      arquivos.push(...(dados.files || []));
      url = dados.nextPageToken
        ? `${base}&pageToken=${encodeURIComponent(dados.nextPageToken)}`
        : null;
    }
    return arquivos;
  }

  async function baixarConteudo(id) {
    const resposta = await pedir(`${API}/files/${encodeURIComponent(id)}?alt=media`);
    return resposta.text();
  }

  /** Cria o arquivo e sobe o texto em duas chamadas (evita multipart montado na mão). */
  async function criar(nome, texto) {
    const resposta = await pedir(`${API}/files?fields=id,name,modifiedTime`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: nome, parents: [pastaId], mimeType: 'text/markdown' }),
    });
    const arquivo = await resposta.json();
    const atualizado = await subirConteudo(arquivo.id, texto);
    return { ...arquivo, modifiedTime: atualizado.modifiedTime || arquivo.modifiedTime };
  }

  async function subirConteudo(id, texto) {
    const resposta = await pedir(
      `${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media&fields=id,name,modifiedTime`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'text/markdown' },
        body: texto,
      },
    );
    return resposta.json();
  }

  /** Novo conteúdo para um arquivo existente (mantém nome e id). */
  const atualizar = subirConteudo;

  /** Vai para a lixeira do Drive (recuperável). */
  async function excluir(id) {
    await pedir(`${API}/files/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    });
  }

  return { listar, baixarConteudo, criar, atualizar, excluir };
}
