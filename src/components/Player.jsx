import { useEffect, useRef, useState } from 'react'
import { useItemData } from '../lib/useItemData'
import { fmt, toSrt } from '../lib/parse'
import Tokens, { useSelectHandler } from './Tokens'

export default function Player({ item, onBack }) {
  const { data, url, save, gen, attach, busy } = useItemData(item)
  const isVideo = item.type === 'video'
  const ref = useRef()
  const [t, setT] = useState(0), [dur, setDur] = useState(0), [playing, setPlaying] = useState(false), [rate, setRate] = useState(1)
  const [show, setShow] = useState({ es: true, par: false, nat: true })
  const [tab, setTab] = useState('transcript')
  const [pauseHover, setPH] = useState(true)
  const wasPlaying = useRef(false)
  const lastScroll = useRef(0)
  const sel = useSelectHandler()
  const subInput = useRef()

  useEffect(() => { const i = setInterval(() => ref.current && setT(ref.current.currentTime), 100); return () => clearInterval(i) }, [])
  useEffect(() => { if (ref.current) { ref.current.playbackRate = rate; ref.current.preservesPitch = true } }, [rate, url])

  const cues = data?.cues || [], tr = data?.tr, off = data?.offset || 0
  const start = c => (c.start == null ? null : c.start + off)
  const endOf = (c, i) => (c.end ?? cues[i + 1]?.start ?? (c.start ?? 0) + 5) + off
  let idx = -1
  cues.forEach((c, i) => { const s = start(c); if (s != null && s <= t) idx = i })
  const visible = idx >= 0 && t <= endOf(cues[idx], idx) + 0.3
  const untimed = cues.some(c => c.start == null)

  const seek = s => { if (ref.current) ref.current.currentTime = Math.max(0, Math.min(dur || 1e9, s)) }
  const skip = d => seek(ref.current.currentTime + d)
  const toggle = () => (ref.current.paused ? ref.current.play() : ref.current.pause())
  const jump = i => { const s = start(cues[i]); if (s != null) seek(s) }

  // keep the active line centered (unless you are scrolling around yourself)
  const actRef = useRef()
  useEffect(() => {
    if (Date.now() - lastScroll.current > 2500) actRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [idx, tab])
  const userScroll = () => { lastScroll.current = Date.now() }

  const snap = i => {
    if (cues[i].start == null) {
      save({ ...data, cues: cues.map((c, j) => (j === i ? { ...c, start: t - off, end: null } : c)) })
    } else save({ ...data, offset: +(t - cues[i].start).toFixed(2) })
  }
  const spread = () => save({ ...data, cues: cues.map((c, i) => ({ ...c, start: (i * dur) / cues.length, end: null })) })
  const download = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([toSrt(cues, off)], { type: 'text/plain' }))
    a.download = item.title + '.srt'
    a.click()
  }

  if (!data) return <div className="pad mut">Loading…</div>
  const en = (i, k) => tr?.[i]?.[k]
  const Toggles = () => (
    <div className="row">
      <button className={show.es ? 'on' : ''} onClick={() => setShow(s => ({ ...s, es: !s.es }))}>ES</button>
      <button className={show.par ? 'on' : ''} onClick={() => setShow(s => ({ ...s, par: !s.par }))}>EN parallel</button>
      <button className={show.nat ? 'on' : ''} onClick={() => setShow(s => ({ ...s, nat: !s.nat }))}>EN natural</button>
    </div>
  )
  return (
    <div className="player">
      <div className="pmain">
        <div className="row" style={{ marginBottom: 10 }}>
          <button onClick={onBack}>← Library</button>
          <h2 style={{ fontSize: 20, flex: 1 }}>{item.title}</h2>
          <input ref={subInput} hidden type="file" accept=".srt,.vtt,.lrc,.txt" onChange={e => e.target.files[0] && attach(e.target.files[0])} />
          <button onClick={() => subInput.current.click()}>Attach subtitles</button>
          {!tr && cues.length > 0 && <button className="pri" onClick={() => gen()}>{busy != null ? `Translating ${Math.round(busy * 100)}%` : 'Generate translations'}</button>}
        </div>

        {isVideo ? (
          <div className="vwrap">
            <video ref={ref} src={url} onClick={toggle} onLoadedMetadata={e => setDur(e.target.duration)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
            {visible && (
              <div className="subs" onMouseUp={sel}
                onMouseEnter={() => { if (pauseHover && !ref.current.paused) { wasPlaying.current = true; ref.current.pause() } }}
                onMouseLeave={() => { if (wasPlaying.current) { wasPlaying.current = false; ref.current.play() } }}>
                {show.es && <div className="es"><Tokens text={cues[idx].es} replace /></div>}
                {show.par && en(idx, 'p') && <div className="par">{en(idx, 'p')}</div>}
                {show.nat && en(idx, 'n') && <div className="nat">{en(idx, 'n')}</div>}
              </div>
            )}
          </div>
        ) : (
          <>
            <audio ref={ref} src={url} onLoadedMetadata={e => setDur(e.target.duration)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
            <div className="lyrics" onWheel={userScroll} onTouchMove={userScroll} onMouseUp={sel}>
              {!cues.length && <p className="mut">No lyrics yet. Attach an .lrc, .srt or .vtt file.</p>}
              {cues.map((c, i) => (
                <div key={i} ref={i === idx ? actRef : null} className={'ln' + (i === idx ? ' act' : '')}>
                  <button className="seek" onClick={() => jump(i)} aria-label="Jump here">▶</button>
                  {show.es && <Tokens text={c.es} replace />}
                  {show.par && en(i, 'p') && <small style={{ color: 'var(--acc2)' }}>{en(i, 'p')}</small>}
                  {show.nat && en(i, 'n') && <small>{en(i, 'n')}</small>}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="controls">
          <input type="range" min={0} max={dur || 0} step={0.1} value={t} onChange={e => seek(+e.target.value)} aria-label="Seek" />
          <div className="row">
            <button onClick={() => skip(-2)}>⟲ 2s</button>
            <button className="pri" onClick={toggle} style={{ minWidth: 70 }}>{playing ? 'Pause' : 'Play'}</button>
            <button onClick={() => skip(2)}>2s ⟳</button>
            <span className="mut">{fmt(t)} / {fmt(dur)}</span>
            <span style={{ flex: 1 }} />
            <label className="row mut" style={{ width: 230 }}>Speed {rate.toFixed(2)}×
              <input type="range" min={0.5} max={1.5} step={0.05} value={rate} onChange={e => setRate(+e.target.value)} />
            </label>
          </div>
          <div className="row">
            <Toggles />
            {isVideo && <label className="row mut"><input type="checkbox" checked={pauseHover} onChange={e => setPH(e.target.checked)} /> Pause while hovering subtitles</label>}
          </div>
        </div>
      </div>

      <aside className="side">
        <div className="row" style={{ padding: 10 }}>
          <button className={tab === 'transcript' ? 'on' : ''} onClick={() => setTab('transcript')}>Transcript</button>
          <button className={tab === 'sync' ? 'on' : ''} onClick={() => setTab('sync')}>Sync</button>
        </div>
        <div className="body" onWheel={userScroll} onMouseUp={tab === 'transcript' ? sel : undefined}>
          {tab === 'transcript' && cues.map((c, i) => (
            <div key={i} ref={i === idx ? actRef : null} className={'tl' + (i === idx ? ' act' : '')}>
              <button className="seek" onClick={() => jump(i)}>{start(c) == null ? '▶' : fmt(start(c))}</button>
              <Tokens text={c.es} />
              {show.par && en(i, 'p') && <div className="en p">{en(i, 'p')}</div>}
              {show.nat && en(i, 'n') && <div className="en n">{en(i, 'n')}</div>}
            </div>
          ))}
          {tab === 'sync' && (
            <div>
              <div className="row"><b>Offset {off.toFixed(1)}s</b>
                <button onClick={() => save({ ...data, offset: +(off - 0.1).toFixed(2) })}>−0.1</button>
                <button onClick={() => save({ ...data, offset: +(off + 0.1).toFixed(2) })}>+0.1</button>
                <button onClick={() => save({ ...data, offset: 0 })}>Reset</button></div>
              <input type="range" min={-30} max={30} step={0.1} value={off} onChange={e => save({ ...data, offset: +e.target.value })} />
              <p className="mut" style={{ fontSize: 13 }}>
                {untimed ? 'Some lines have no time yet. Play the audio and click each line as it is spoken to stamp it, or spread them evenly first.'
                  : 'Play to the moment a line is spoken, then click that line — the whole subtitle track snaps to match. Or drag the slider.'}
              </p>
              <div className="row" style={{ marginBottom: 8 }}>
                {untimed && <button onClick={spread}>Spread evenly</button>}
                <button onClick={download}>Download SRT</button>
              </div>
              {cues.map((c, i) => (
                <div key={i} ref={i === idx ? actRef : null} className={'syncrow' + (i === idx ? ' act' : '')} onClick={() => snap(i)}>
                  <span className="mut">{start(c) == null ? '--:--' : fmt(start(c))}</span> {c.es}
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
