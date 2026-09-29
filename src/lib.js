import { useState, useEffect } from 'react'

export const useLocal = (k, init) => {
  const [v, setV] = useState(() => { try { return JSON.parse(localStorage[k]) ?? init } catch { return init } })
  useEffect(() => { try { localStorage[k] = JSON.stringify(v) } catch { /* storage full */ } }, [k, v])
  return [v, setV]
}

const sec = s => { const [h, m, x] = s.split(':'); return +h * 3600 + +m * 60 + +x.replace(',', '.') }

// SRT, LRC or plain text -> [{start, end, text}]
export function parseSubs(raw) {
  raw = raw.replace(/\r/g, '').trim()
  if (raw.includes('-->')) return raw.split(/\n\s*\n/).map(b => {
    const l = b.split('\n'), i = l.findIndex(x => x.includes('-->'))
    if (i < 0) return null
    const [a, z] = l[i].split('-->').map(x => sec(x.trim().split(' ')[0]))
    return { start: a, end: z, text: l.slice(i + 1).join(' ').replace(/<[^>]+>/g, '') }
  }).filter(Boolean)
  const lrc = [...raw.matchAll(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/gm)]
  if (lrc.length) {
    const t = m => +m[1] * 60 + +m[2]
    return lrc.map((m, i) => ({ start: t(m), end: lrc[i + 1] ? t(lrc[i + 1]) : t(m) + 5, text: m[3].trim() })).filter(c => c.text)
  }
  return raw.split('\n').filter(Boolean).map(text => ({ start: null, end: null, text }))
}

// Translation (MyMemory free API, cached in localStorage)
const cache = JSON.parse(localStorage.trc || '{}')
export async function tr(t) {
  if (cache[t]) return cache[t]
  try {
    const u = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(t)}&langpair=es|en`
    cache[t] = (await (await fetch(u)).json()).responseData.translatedText
    localStorage.trc = JSON.stringify(cache)
    return cache[t]
  } catch { return '…' }
}
// Word-by-word "literal" version
export const literal = async line =>
  (await Promise.all((line.match(/[\p{L}']+/gu) || []).map(w => tr(w.toLowerCase())))).join(' ')

// Wiktionary definitions (Spanish entries, English glosses)
const strip = h => new DOMParser().parseFromString(h, 'text/html').body.textContent
export async function define(w) {
  try {
    const r = await (await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(w)}`)).json()
    return (r.es || []).map(e => ({
      pos: e.partOfSpeech,
      defs: e.definitions.slice(0, 4).map(d => ({ d: strip(d.definition), ex: d.examples?.[0] ? strip(d.examples[0]) : '' })),
    }))
  } catch { return [] }
}

export const speak = w => { const u = new SpeechSynthesisUtterance(w); u.lang = 'es-ES'; speechSynthesis.speak(u) }
