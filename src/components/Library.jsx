import { useEffect, useRef, useState } from 'react'
import * as db from '../lib/db'
import { mediaItems, kindOf, baseName } from '../lib/library'
import { parse } from '../lib/parse'
import { translateCues } from '../lib/api'
import { useApp } from '../lib/store'

const SECTIONS = [['text', 'Texts'], ['video', 'Videos'], ['music', 'Music']]

export default function Library({ onOpen }) {
  const { settings } = useApp()
  const [sec, setSec] = useState('text')
  const [items, setItems] = useState([])
  const [working, setWorking] = useState({})
  const [title, setTitle] = useState('')
  const [paste, setPaste] = useState('')
  const fileRef = useRef()
  const reload = async () => setItems([...mediaItems(), ...((await db.listItems()) || []).sort((a, b) => b.added - a.added)])
  useEffect(() => { reload() }, [])

  async function createItem(type, name, cues, blob) {
    const id = crypto.randomUUID()
    await db.set('item:' + id, { id, type, title: name, blob, added: Date.now() })
    await db.set('data:' + id, { cues, tr: null, offset: 0 })
    reload()
    if (!cues.length) return
    setWorking(w => ({ ...w, [id]: 0 }))
    const tr = await translateCues(cues, settings, p => setWorking(w => ({ ...w, [id]: p })))
    const cur = await db.get('data:' + id)
    if (cur) await db.set('data:' + id, { ...cur, tr })
    setWorking(w => { const n = { ...w }; delete n[id]; return n })
  }
  async function importFiles(list) {
    const files = [...list]
    const media = files.filter(f => kindOf(f.name) !== 'text')
    let texts = files.filter(f => kindOf(f.name) === 'text')
    for (const m of media) {
      const pair = texts.find(t => baseName(t.name) === baseName(m.name)) || (media.length === 1 ? texts[0] : null)
      if (pair) texts = texts.filter(t => t !== pair)
      await createItem(kindOf(m.name), baseName(m.name), pair ? parse(await pair.text()) : [], m)
    }
    for (const t of texts) await createItem('text', baseName(t.name), parse(await t.text()))
  }
  async function pasteText() {
    if (!paste.trim()) return
    await createItem('text', title.trim() || 'Untitled text', parse(paste))
    setPaste(''); setTitle('')
  }
  const remove = async (e, it) => {
    e.stopPropagation()
    await db.del('item:' + it.id); await db.del('data:' + it.id)
    reload()
  }
  const list = items.filter(i => i.type === sec)
  return (
    <div className="pad">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 28 }}>Library</h1>
        <div>
          <input ref={fileRef} type="file" multiple hidden accept="video/*,audio/*,.srt,.vtt,.lrc,.txt" onChange={e => { importFiles(e.target.files); e.target.value = '' }} />
          <button className="pri" onClick={() => fileRef.current.click()}>Import files</button>
        </div>
      </div>
      <div className="tabs">
        {SECTIONS.map(([k, v]) => <button key={k} className={sec === k ? 'on' : ''} onClick={() => setSec(k)}>{v}</button>)}
      </div>
      {sec === 'text' && (
        <div className="row" style={{ alignItems: 'stretch', marginBottom: 18 }}>
          <div style={{ flex: 1, minWidth: 260, display: 'grid', gap: 8 }}>
            <input type="text" placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
            <textarea placeholder="Paste Spanish text here, or import .txt / .srt / .vtt files" value={paste} onChange={e => setPaste(e.target.value)} />
            <div><button className="pri" onClick={pasteText}>Add text</button></div>
          </div>
        </div>
      )}
      {sec !== 'text' && <p className="mut">Pick a {sec === 'video' ? 'video' : 'song'} and its subtitles ({sec === 'music' ? '.lrc, ' : ''}.srt, .vtt) together — they are paired by filename.</p>}
      {!list.length ? (
        <div className="empty">Nothing here yet. Import files, or drop them into <code>src/media</code> and reload.</div>
      ) : (
        <div className="grid">
          {list.map(it => (
            <div key={it.id} className="card" onClick={() => onOpen(it)}>
              <div className="t">{it.title}</div>
              <div className="badge">{it.fromMedia ? 'media folder' : 'imported'}{it.id in working ? ` · translating ${Math.round(working[it.id] * 100)}%` : ''}</div>
              {!it.fromMedia && <div><button className="ghost" onClick={e => remove(e, it)}>Delete</button></div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
