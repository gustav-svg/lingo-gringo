// Anything you drop in src/media shows up automatically in the library.
const files = import.meta.glob('../media/**/*.*', { query: '?url', import: 'default', eager: true })
const VIDEO = /^(mp4|webm|mkv|mov|m4v)$/, AUDIO = /^(mp3|m4a|wav|ogg|flac|aac|opus)$/, SUB = /^(srt|vtt|lrc|txt)$/
export const kindOf = name => {
  const e = name.split('.').pop().toLowerCase()
  return VIDEO.test(e) ? 'video' : AUDIO.test(e) ? 'music' : 'text'
}
export const baseName = n => n.replace(/\.[^.]+$/, '')
export function mediaItems() {
  const byBase = {}
  for (const [path, url] of Object.entries(files)) {
    const rel = path.replace('../media/', '')
    const ext = rel.split('.').pop().toLowerCase()
    const base = baseName(rel)
    ;(byBase[base] ||= {})[VIDEO.test(ext) ? 'video' : AUDIO.test(ext) ? 'music' : SUB.test(ext) ? 'sub' : 'x'] = url
  }
  return Object.entries(byBase).flatMap(([base, g]) => {
    const title = base.split('/').pop()
    if (g.video) return [{ id: 'media:' + base, type: 'video', title, url: g.video, subUrl: g.sub, fromMedia: true }]
    if (g.music) return [{ id: 'media:' + base, type: 'music', title, url: g.music, subUrl: g.sub, fromMedia: true }]
    if (g.sub) return [{ id: 'media:' + base, type: 'text', title, subUrl: g.sub, fromMedia: true }]
    return []
  })
}
