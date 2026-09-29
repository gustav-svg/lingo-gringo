import { useRef, useState } from 'react'
import { useApp, POS, knowledge, glosses } from '../lib/store'
import { speak } from './Inspector'

const IDIOMS = [
  ['Estar en las nubes', 'to be daydreaming'], ['Costar un ojo de la cara', 'to cost an arm and a leg'], ['Tomar el pelo', "to pull someone's leg"],
  ['No tener pelos en la lengua', 'to speak bluntly'], ['Ser pan comido', 'to be a piece of cake'], ['Meter la pata', 'to put your foot in it'],
  ['Dar en el clavo', 'to hit the nail on the head'], ['Estar como una cabra', 'to be crazy'], ['Hablar por los codos', 'to talk nonstop'],
  ['Ponerse las pilas', 'to get your act together'], ['Tirar la casa por la ventana', 'to spare no expense'], ['Ser uña y carne', 'to be inseparable'],
  ['Dar la lata', 'to be a nuisance'], ['Estar sin blanca', 'to be broke'], ['Echar una mano', 'to lend a hand'], ['Llover a cántaros', 'to rain cats and dogs'],
  ['Quedarse de piedra', 'to be stunned'], ['Dormir a pierna suelta', 'to sleep like a log'], ['Hacer la vista gorda', 'to turn a blind eye'], ['Estar en las últimas', 'to be on your last legs']
]
const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(to|a|an|the) /, '')
const shuffle = a => [...a].sort(() => Math.random() - 0.5)
// Weighted sample: words you know less (or that are due) come up more often.
function sample(words, n) {
  const pool = words.map(w => ({ w, k: Math.pow(1 - knowledge(w) + 0.05, 2) * (w.due <= Date.now() ? 2 : 1) * Math.random() ** 0.5 }))
  return pool.sort((a, b) => b.k - a.k).slice(0, n).map(x => x.w)
}

export default function Quiz() {
  const { vocab, updateWord } = useApp()
  const [run, setRun] = useState(null) // {kind, queue, i, stats}
  const [ans, setAns] = useState('')
  const [res, setRes] = useState(null) // null | {ok}
  const [listening, setListening] = useState(false)
  const inputRef = useRef()
  const all = Object.values(vocab).filter(w => glosses(w).length)

  const start = (kind, pos) => {
    setAns(''); setRes(null)
    if (kind === 'idioms') return setRun({ kind, queue: shuffle(IDIOMS).slice(0, 10).map(([es, en]) => ({ es, en, opts: shuffle([en, ...shuffle(IDIOMS.filter(x => x[1] !== en)).slice(0, 3).map(x => x[1])]) })), i: 0, right: 0 })
    const pool = kind === 'pos' ? all.filter(w => w.pos === pos) : all
    setRun({ kind, queue: sample(pool, kind === 'pos' ? Math.min(pool.length, 20) : Math.min(10, pool.length)), i: 0, right: 0 })
    setAns(''); setRes(null)
  }
  const cur = run?.queue[run.i]
  const check = () => {
    const a = norm(ans)
    if (!a) return
    const ok = glosses(cur).map(norm).some(p => p === a || p.split(' ').includes(a))
    setRes({ ok })
  }
  const next = (right) => { setRun(r => ({ ...r, i: r.i + 1, right: r.right + (right ? 1 : 0) })); setAns(''); setRes(null); setTimeout(() => inputRef.current?.focus(), 50) }
  const rate = r => {
    const s = cur.score || 0
    const ns = res.ok ? 0.5 * s + 0.5 * r : 0.5 * s + 0.5 * Math.min(r, 1.5)
    updateWord(cur.word, { score: ns, seen: cur.seen + 1, correct: cur.correct + (res.ok ? 1 : 0), due: Date.now() + 3600e3 * Math.pow(2, ns * 1.6) })
    next(res.ok)
  }
  const mic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return alert('Speech recognition is not supported in this browser. Try Chrome or Edge.')
    const r = new SR(); r.lang = 'en-US'
    r.onresult = e => setAns(e.results[0][0].transcript)
    r.onend = () => setListening(false)
    setListening(true); r.start()
  }

  if (!run) return (
    <div className="pad">
      <h1 style={{ fontSize: 28 }}>Quiz</h1>
      <p className="mut">Words you know less show up more often. {all.length} words in your vocab are ready.</p>
      <div className="row" style={{ margin: '14px 0' }}>
        <button className="pri" disabled={!all.length} onClick={() => start('random')}>10 random words</button>
        <button className="pri" onClick={() => start('idioms')}>Idioms quiz</button>
      </div>
      <h3>By part of speech</h3>
      <div className="row" style={{ marginTop: 10 }}>
        {POS.map(([k, es, en]) => { const n = all.filter(w => w.pos === k).length; return <button key={k} disabled={!n} onClick={() => start('pos', k)}>{es} ({en}) · {n}</button> })}
      </div>
    </div>
  )
  if (!cur) return (
    <div className="qcard">
      <h2>Done</h2>
      <p style={{ fontSize: 22 }}>{run.right} / {run.queue.length} correct</p>
      <button className="pri" onClick={() => setRun(null)}>Back to quiz menu</button>
    </div>
  )
  return (
    <div className="qcard">
      <div className="mut">{run.i + 1} / {run.queue.length}</div>
      {run.kind === 'idioms' ? (
        <>
          <div className="word" style={{ fontSize: 32 }}>{cur.es}</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {cur.opts.map(o => (
              <button key={o} disabled={!!res} onClick={() => setRes({ ok: o === cur.en, pick: o })}
                style={res && (o === cur.en ? { borderColor: 'var(--good)' } : o === res.pick ? { borderColor: 'var(--bad)' } : {})}>{o}</button>
            ))}
          </div>
          {res && <div style={{ marginTop: 16 }}><p className={res.ok ? 'good' : 'bad'}>{res.ok ? 'Correct' : 'Not quite'}</p><button className="pri" onClick={() => next(res.ok)}>Next</button></div>}
        </>
      ) : (
        <>
          <div className="word">{cur.word} <button className="ghost" onClick={() => speak(cur.word)} aria-label="Pronounce">🔊</button></div>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input ref={inputRef} autoFocus type="text" placeholder="English translation" value={ans} disabled={!!res}
              onChange={e => setAns(e.target.value)} onKeyDown={e => e.key === 'Enter' && !res && check()} />
            <button className={listening ? 'on' : ''} onClick={mic} aria-label="Speak answer">🎤</button>
          </div>
          {!res && <button className="pri" style={{ marginTop: 12 }} onClick={check}>Check</button>}
          {res && (
            <div>
              <p className={res.ok ? 'good' : 'bad'} style={{ fontSize: 20 }}>{res.ok ? 'Correct' : 'Not quite'}</p>
              <p className="mut">{glosses(cur).slice(0, 5).join(' · ')}</p>
              <div className="mut">How well do you know it?</div>
              <div className="rate">{[1, 2, 3, 4, 5].map(n => <button key={n} onClick={() => rate(n)} style={{ width: 44 }}>{n}</button>)}</div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
