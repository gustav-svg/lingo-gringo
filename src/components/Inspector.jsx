import { useEffect, useState } from 'react'
import { useApp, normPos, POS, short } from '../lib/store'
import { dict, icon } from '../lib/api'
import { conj, isVerb, PERSONS, TENSES } from '../lib/conj'

export const speak = w => {
  const u = new SpeechSynthesisUtterance(w)
  u.lang = 'es-ES'
  speechSynthesis.cancel()
  speechSynthesis.speak(u)
}

function Conjugator({ inf }) {
  const [tense, setTense] = useState('pres')
  const [p, setP] = useState(0)
  const forms = PERSONS.map((_, i) => conj(inf, tense, i))
  let stem = forms[0]
  for (const f of forms) while (!f.startsWith(stem)) stem = stem.slice(0, -1)
  const end = forms[p].slice(stem.length)
  return (
    <div className="conj">
      <div className="row">
        {Object.entries(TENSES).map(([k, v]) => <button key={k} className={tense === k ? 'on' : ''} onClick={() => setTense(k)}>{v}</button>)}
      </div>
      <div className="big">
        <span className="pn" key={'p' + p}>{PERSONS[p]}</span>
        <span className="stem">{stem}</span>
        <span className="end" key={tense + p}>{end}</span>
      </div>
      <div className="persons">
        {PERSONS.map((n, i) => <button key={n} className={p === i ? 'on' : ''} onClick={() => setP(i)}>{n}</button>)}
      </div>
      <p className="mut" style={{ fontSize: 13, marginBottom: 0 }}>Root: {inf}. Irregular verbs outside the built-in list may be off.</p>
    </div>
  )
}

export default function Inspector() {
  const { inspect, setInspect, vocab, updateWord, removeWord } = useApp()
  const [d, setD] = useState(null)
  const [ic, setIc] = useState(null)
  useEffect(() => {
    if (!inspect) return
    let dead = false
    setD(null); setIc(null)
    dict(inspect).then(async r => {
      if (dead) return
      setD(r)
      const src = r.lemmaEntries.length ? r.lemmaEntries : r.entries
      if (src[0]) {
        const tr = src[0].defs.slice(0, 6).map(x => short(x.d)).filter(Boolean)
        updateWord(inspect, { pos: normPos(src[0].pos), tr, lemma: r.lemma || undefined })
        const i = await icon(tr[0] || '')
        if (!dead) setIc(i)
      }
    })
    return () => { dead = true }
  }, [inspect])
  if (!inspect) return null
  const w = vocab[inspect]
  const lemma = d?.lemma
  const all = d ? [...d.lemmaEntries, ...d.entries] : []
  const verbInf = all.some(e => /verb/i.test(e.pos)) ? (lemma || inspect) : null
  return (
    <aside className="insp">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="pos">{POS.find(p => p[0] === w?.pos)?.[1] || 'Otros'}</span>
        <button className="ghost" onClick={() => setInspect(null)} aria-label="Close">✕</button>
      </div>
      <div className="head" style={{ margin: '10px 0' }}>
        <h2>{inspect}</h2>
        <span style={{ fontSize: 36, width: 40, height: 40, display: 'grid', placeItems: 'center' }}>
          {ic ? <img src={ic} alt="" /> : '🔤'}
        </span>
        <button onClick={() => speak(inspect)} aria-label="Pronounce">🔊</button>
      </div>
      {lemma && <p className="mut">Form of <b style={{ color: 'var(--acc)' }}>{lemma}</b></p>}
      {!d && <p className="mut">Looking up…</p>}
      {d && !all.length && <p className="mut">No dictionary entry found. Try selecting the word again with its accents.</p>}
      {verbInf && isVerb(verbInf) && <Conjugator inf={verbInf} />}
      {all.map((e, i) => (
        <section key={i} style={{ marginTop: 14 }}>
          <span className="pos">{e.pos}</span>
          <ol>
            {e.defs.map((x, j) => (
              <li key={j}>{x.d}
                {x.ex.map((y, k) => <div className="ex" key={k}>{y.es}{y.en && ` — ${y.en}`}</div>)}
              </li>
            ))}
          </ol>
        </section>
      ))}
      <button style={{ marginTop: 18 }} onClick={() => { removeWord(inspect); setInspect(null) }}>Remove from vocab</button>
    </aside>
  )
}
