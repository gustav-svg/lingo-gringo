// Tiny IndexedDB key/value store. Imported files (blobs), cues and translations live here.
const open = () => new Promise((res, rej) => {
  const r = indexedDB.open('lingo', 1)
  r.onupgradeneeded = () => r.result.createObjectStore('kv')
  r.onsuccess = () => res(r.result)
  r.onerror = () => rej(r.error)
})
let p
const db = () => p || (p = open())
const wrap = (mode, fn) => db().then(d => new Promise((res, rej) => {
  const t = d.transaction('kv', mode)
  const q = fn(t.objectStore('kv'))
  t.oncomplete = () => res(q?.result)
  t.onerror = () => rej(t.error)
}))
export const get = k => wrap('readonly', s => s.get(k))
export const set = (k, v) => wrap('readwrite', s => s.put(v, k))
export const del = k => wrap('readwrite', s => s.delete(k))
export const listItems = () => wrap('readonly', s => s.getAll(IDBKeyRange.bound('item:', 'item:\uffff')))
