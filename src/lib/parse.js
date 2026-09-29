// Turns LRC / SRT / VTT / plain text into cues: {start, end, es}. start=null means "untimed".
const ts = s => {
  const m = s.trim().replace(',', '.').split(':').map(parseFloat)
  return m.length === 3 ? m[0] * 3600 + m[1] * 60 + m[2] : m[0] * 60 + m[1]
}
export function parse(raw) {
  const text = raw.replace(/\r/g, '').replace(/^\uFEFF/, '')
  let cues = []
  if (/^\s*\[\d+:\d+(\.\d+)?\]/m.test(text)) {
    for (const line of text.split('\n')) {
      const stamps = [...line.matchAll(/\[(\d+:\d+(?:\.\d+)?)\]/g)]
      const es = line.replace(/\[[^\]]*\]/g, '').trim()
      if (!stamps.length || !es) continue
      stamps.forEach(m => cues.push({ start: ts(m[1]), end: null, es }))
    }
    cues.sort((a, b) => a.start - b.start)
    cues.forEach((c, i) => (c.end = cues[i + 1]?.start ?? c.start + 5))
  } else if (text.includes('-->')) {
    for (const block of text.split(/\n\s*\n/)) {
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
      const i = lines.findIndex(l => l.includes('-->'))
      if (i < 0) continue
      const [a, b] = lines[i].split('-->')
      const es = lines.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '').trim()
      if (es) cues.push({ start: ts(a), end: ts(b.trim().split(/\s/)[0]), es })
    }
  } else {
    cues = text.split('\n').map(l => l.trim()).filter(Boolean).map(es => ({ start: null, end: null, es }))
  }
  return cues
}
const p2 = n => String(Math.floor(n)).padStart(2, '0')
export const srtTime = s => {
  s = Math.max(0, s)
  return `${p2(s / 3600)}:${p2((s % 3600) / 60)}:${p2(s % 60)},${String(Math.round((s % 1) * 1000)).padStart(3, '0').slice(0, 3)}`
}
export const toSrt = (cues, off = 0) => cues.map((c, i) => {
  const s = (c.start ?? 0) + off
  const e = (c.end ?? c.start ?? 0) + off
  return `${i + 1}\n${srtTime(s)} --> ${srtTime(e > s ? e : s + 3)}\n${c.es}\n`
}).join('\n')
export const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
