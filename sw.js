/* Service worker: rede primeiro, cache como reserva (offline e instalação no celular). */

const CACHE = 'caderno-v3';
const CASCA = [
  './',
  './index.html',
  './estilo.css',
  './app.js',
  './nucleo.js',
  './formato.js',
  './dados.js',
  './drive.js',
  './google-auth.js',
  './config.js',
  './cozinha.html',
  './cozinha.css',
  './cozinha.js',
  './cozinha-nucleo.js',
  './manifest.webmanifest',
  './icone.svg',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  evento.respondWith(
    fetch(request)
      .then((resposta) => {
        if (resposta.ok) {
          const copia = resposta.clone();
          caches.open(CACHE).then((c) => c.put(request, copia)).catch(() => {});
        }
        return resposta;
      })
      .catch(async () => {
        const emCache = await caches.match(request);
        if (emCache) return emCache;
        if (request.mode === 'navigate') {
          const casca = await caches.match('./index.html');
          if (casca) return casca;
        }
        return new Response('Sem conexão com o servidor do caderno.', {
          status: 503,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }),
  );
});
