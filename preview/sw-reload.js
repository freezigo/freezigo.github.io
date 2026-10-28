// w8: when a new build takes over from an older one, reload every open Freezigo page once,
// so nobody stays on the old screens (the old app code cannot do this by itself).
let hadOld = false
self.addEventListener('install', () => { hadOld = !!self.registration.active })
self.addEventListener('activate', (e) => {
  if (!hadOld) return
  e.waitUntil(self.clients.claim().then(() => self.clients.matchAll({ type: 'window' })).then((cs) => Promise.all(cs.map((c) => c.navigate(c.url).catch(() => null)))))
})
