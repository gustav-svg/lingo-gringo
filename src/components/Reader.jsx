import { useState } from 'react'
import { useItemData } from '../lib/useItemData'
import Tokens, { useSelectHandler } from './Tokens'

export default function Reader({ item, onBack }) {
  const { data, gen, busy, attach } = useItemData(item)
  const [show, setShow] = useState({ par: false, nat: true })
  const sel = useSelectHandler()
  if (!data) return <div className="pad mut">Loading…</div>
  return (
    <div className="pad" style={{ maxWidth: 780 }}>
      <div className="row"><button onClick={onBack}>← Library</button><h1 style={{ fontSize: 26 }}>{item.title}</h1></div>
      <div className="row" style={{ margin: '14px 0' }}>
        <button className={show.par ? 'on' : ''} onClick={() => setShow(s => ({ ...s, par: !s.par }))}>Parallel EN</button>
        <button className={show.nat ? 'on' : ''} onClick={() => setShow(s => ({ ...s, nat: !s.nat }))}>Natural EN</button>
        {!data.tr && data.cues.length > 0 && <button className="pri" onClick={() => gen()}>{busy != null ? `Translating ${Math.round(busy * 100)}%` : 'Generate translations'}</button>}
        <span className="mut">Hover a word for its meaning, click to save it, drag across words to translate a phrase.</span>
      </div>
      <div onMouseUp={sel} style={{ fontSize: 21, lineHeight: 1.8 }}>
        {data.cues.map((c, i) => (
          <div key={i} style={{ marginBottom: 18 }}>
            <div><Tokens text={c.es} /></div>
            {show.par && data.tr?.[i] && <div style={{ color: 'var(--acc2)', fontSize: 15, fontFamily: 'system-ui' }}>{data.tr[i].p}</div>}
            {show.nat && data.tr?.[i] && <div style={{ color: 'var(--acc)', fontSize: 15, fontFamily: 'system-ui' }}>{data.tr[i].n}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
