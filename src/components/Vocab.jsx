import { useState } from 'react'
import { useApp, POS, knowledge, glosses } from '../lib/store'

export default function Vocab() {
  const { vocab, setInspect, removeWord } = useApp()
  const [view, setView] = useState('list')
  const [q, setQ] = useState('')
  const words = Object.values(vocab).filter(w => !q || w.word.includes(q.toLowerCase()) || glosses(w).join(' ').toLowerCase().includes(q.toLowerCase()))
  const groups = POS.map(([k, es, en]) => [k, es, en, words.filter(w => w.pos === k)]).filter(g => g[3].length)
  return (
    <div className="pad">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 28 }}>Vocabulary <span className="mut" style={{ fontSize: 16 }}>{words.length} words</span></h1>
        <div className="row">
          <input type="text" placeholder="Search" value={q} onChange={e => setQ(e.target.value)} style={{ width: 180 }} />
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>Folders</button>
          <button className={view === 'cloud' ? 'on' : ''} onClick={() => setView('cloud')}>Word cloud</button>
        </div>
      </div>
      {!words.length && <div className="empty" style={{ marginTop: 20 }}>No words yet. Click any word in a text, subtitle or lyric to save it.</div>}
      <div style={{ marginTop: 18 }}>
        {view === 'list' && groups.map(([k, es, en, ws]) => (
          <details className="folder" key={k} open>
            <summary>{es} <span className="mut">({en}) · {ws.length}</span></summary>
            {ws.sort((a, b) => a.word.localeCompare(b.word)).map(w => (
              <div className="vrow" key={w.word} onClick={() => setInspect(w.word)}>
                <b style={{ minWidth: 120 }}>{w.word}</b>
                <span className="mut" style={{ flex: 1 }}>{glosses(w).slice(0, 3).join(', ') || '—'}</span>
                <div className="bar" title={`Knowledge ${Math.round(knowledge(w) * 100)}%`}><i style={{ width: knowledge(w) * 100 + '%' }} /></div>
                <button className="ghost" onClick={e => { e.stopPropagation(); removeWord(w.word) }} aria-label="Delete">✕</button>
              </div>
            ))}
          </details>
        ))}
        {view === 'cloud' && groups.map(([k, es, en, ws]) => (
          <section key={k}>
            <h3 className="mut" style={{ fontSize: 15, marginTop: 14 }}>{es} ({en})</h3>
            <div className="cloud">
              {[...ws].sort((a, b) => (glosses(a)[0] || 'zz').localeCompare(glosses(b)[0] || 'zz')).map(w => {
                const kn = knowledge(w)
                return <span key={w.word} title={glosses(w).slice(0, 3).join(', ')} onClick={() => setInspect(w.word)}
                  style={{ fontSize: 36 - 24 * kn, opacity: 1 - 0.6 * kn, color: 'var(--acc)' }}>{w.word}</span>
              })}
            </div>
          </section>
        ))}
      </div>
      {view === 'cloud' && words.length > 0 && <p className="mut">Words are grouped by part of speech and ordered by meaning. Big and bright means you don't know it yet.</p>}
    </div>
  )
}
