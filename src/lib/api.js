// Dictionary (Wiktionary), word/phrase translation (MyMemory), icons (Iconify), AI translation (Anthropic).
export const clean = h => {
  const t = document.createElement('textarea')
  t.innerHTML = (h || '').replace(/<[^>]+>/g, '')
  return t.value.trim()
}
export const short = s => s.replace(/^\([^)]*\)\s*/, '').split(/[;:]/)[0].trim().slice(0, 60)
const FORM = /(person|singular|plural|participle|gerund|form|feminine|masculine|imperative|subjunctive|indicative|preterite|imperfect|conditional|future|inflection|diminutive|superlative)\b[^]*\bof\b/i

const dictCache = new Map()
async function wik(word) {
  for (const w of [word, word.toLowerCase()]) {
    try {
      const r = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(w)}`)
      if (!r.ok) continue
      const j = await r.json()
      const list = (j.es || Object.values(j).flat().filter(e => e.language === 'Spanish'))
      if (list.length) return list.map(e => ({
        pos: e.partOfSpeech,
        defs: e.definitions.map(d => ({
          d: clean(d.definition),
          ex: (d.parsedExamples || []).map(x => ({ es: clean(x.example), en: clean(x.translation || '') }))
            .concat((d.examples || []).filter(() => !(d.parsedExamples || []).length).map(x => ({ es: clean(x), en: '' })))
            .filter(x => x.es).slice(0, 2)
        })).filter(d => d.d)
      }))
    } catch { /* try next */ }
  }
  return []
}
export async function dict(word) {
  const key = word.toLowerCase()
  if (dictCache.has(key)) return dictCache.get(key)
  const entries = await wik(word)
  let lemma = null, lemmaEntries = []
  const first = entries[0]?.defs[0]?.d || ''
  if (FORM.test(first)) {
    lemma = first.match(/\bof\s+([\p{L}]+)/u)?.[1]
    if (lemma && lemma.toLowerCase() !== key) lemmaEntries = await wik(lemma)
    else lemma = null
  }
  const out = { entries, lemma, lemmaEntries }
  dictCache.set(key, out)
  return out
}
const trCache = new Map()
export async function translate(text) {
  if (trCache.has(text)) return trCache.get(text)
  try {
    const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 480))}&langpair=es|en`)
    const j = await r.json()
    const t = clean(j.responseData?.translatedText || '')
    trCache.set(text, t)
    return t
  } catch { return '(offline)' }
}
const gCache = new Map()
export async function gloss(word) {
  const k = word.toLowerCase()
  if (gCache.has(k)) return gCache.get(k)
  const d = await dict(word)
  const src = d.lemmaEntries.length ? d.lemmaEntries : d.entries
  let g = src[0]?.defs[0] ? short(src[0].defs[0].d) : await translate(word)
  if (d.lemma) g = `${g} (${d.lemma})`
  gCache.set(k, g)
  return g
}
const iCache = new Map()
export async function icon(query) {
  const q = query.replace(/^to /, '').replace(/[^a-z ]/gi, '').trim().split(' ')[0]
  if (!q) return null
  if (iCache.has(q)) return iCache.get(q)
  let url = null
  try {
    const j = await (await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(q)}&limit=1&prefix=mdi`)).json()
    const n = j.icons?.[0]
    if (n) url = `https://api.iconify.design/${n.replace(':', '/')}.svg?color=%23f2b84b&height=40`
  } catch { /* no icon */ }
  iCache.set(q, url)
  return url
}
const SYS = 'You translate Spanish subtitle/lyric/text lines into English for language learners. For each input line return an object {"p":..., "n":...}. "p" is a grammatically parallel translation: stay close to the Spanish word order and structure so a learner can map words one-to-one. "n" is a natural, contextual English translation. Return ONLY a JSON array with exactly one object per input line, in order.'
async function ai(lines, s) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': s.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: s.model, max_tokens: 6000, system: SYS, messages: [{ role: 'user', content: JSON.stringify(lines) }] })
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error?.message || 'AI request failed')
  const txt = j.content.map(c => c.text || '').join('').replace(/```json|```/g, '').trim()
  const a = JSON.parse(txt)
  return lines.map((_, i) => ({ p: a[i]?.p || '', n: a[i]?.n || '' }))
}
export async function translateCues(cues, settings, onProg) {
  const out = []
  for (let i = 0; i < cues.length; i += 25) {
    const lines = cues.slice(i, i + 25).map(c => c.es)
    let res
    try {
      if (!settings.apiKey) throw new Error('no key')
      res = await ai(lines, settings)
    } catch (e) {
      const t = await Promise.all(lines.map(translate))
      res = t.map(x => ({ p: x, n: x }))
    }
    out.push(...res)
    onProg?.(out.length / cues.length)
  }
  return out
}
