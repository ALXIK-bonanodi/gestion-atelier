// Bona Nodi · Atelier — service worker de l'app installée (PWA)
// Toujours le réseau d'abord : l'app reste à jour à chaque ouverture (tes envois sur GitHub sont pris tout de suite).
// La copie gardée ne sert que si tu n'as pas de connexion, pour que l'app s'ouvre quand même.
// Les données (Supabase), Shopify, TikTok et les autres sites ne passent jamais par ici.
const CACHE = 'atelier-v1';
const COQUILLE = ['./', './index.html', './manifest.webmanifest', './icone-192.png', './icone-512.png', './apple-touch-icon.png', './favicon.png', './logo-app.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(COQUILLE)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('atelier-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;            // données, polices, bibliothèques : directement au réseau
  const base = new URL('./', self.registration.scope).pathname;
  if (!url.pathname.startsWith(base) || url.pathname.startsWith(base + 'configurateur/')) return;   // le configurateur (aussi dans Shopify) n'est pas concerné
  e.respondWith(
    fetch(req, { cache: 'no-store' }).then(rep => {
      if (rep.ok && (req.mode === 'navigate' || COQUILLE.some(p => url.pathname === new URL(p, self.registration.scope).pathname))) {
        const copie = rep.clone(); caches.open(CACHE).then(c => c.put(req.mode === 'navigate' ? './index.html' : req, copie));
      }
      return rep;
    }).catch(() => caches.match(req.mode === 'navigate' ? './index.html' : req).then(r => r || caches.match('./index.html')))
  );
});
