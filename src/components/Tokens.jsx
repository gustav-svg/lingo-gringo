import { useState } from 'react'
import { useApp } from '../lib/store'
import { gloss } from '../lib/api'

// Renders Spanish text word-by-word. Hover = English gloss (tooltip, or swaps the word when replace=true).
export default function Tokens({ text, replace = false }) {
  const { vocab } = useApp()
  const [hov, setHov] = useState(null)
  return (
    <>
      {text.split(/([\p{L}\p{M}'’]+)/gu).map((p, i) =>
        i % 2 ? (
          <span key={i} data-w={p}
            className={'w' + (vocab[p.toLowerCase()] ? ' known' : '') + (hov?.i === i ? ' hov' : '')}
            data-tip={!replace && hov?.i === i ? hov.g : undefined}
            onMouseEnter={async () => { setHov({ i, g: '…' }); const g = await gloss(p); setHov(h => (h?.i === i ? { i, g } : h)) }}
            onMouseLeave={() => setHov(null)}>
            {replace && hov?.i === i ? hov.g : p}
          </span>
        ) : p
      )}
    </>
  )
}

// Put on a container's onMouseUp: click a word = open it, drag across words = translate the phrase.
export function useSelectHandler() {
  const { openWord, setPhrase } = useApp()
  return e => {
    const s = window.getSelection()
    const t = s?.toString().trim()
    if (t && /\s/.test(t)) {
      const r = s.getRangeAt(0).getBoundingClientRect()
      setPhrase({ text: t.replace(/\s+/g, ' '), x: Math.min(r.left, window.innerWidth - 400), y: r.bottom + 8 })
      return
    }
    const w = e.target.closest?.('[data-w]')
    if (w) openWord(w.dataset.w)
  }
}
