import { createContext, useContext, useEffect, useState } from 'react'
import { short } from './api'
const Ctx = createContext()
export const useApp = () => useContext(Ctx)
const ls = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }

export const POS = [
  ['Noun', 'Sustantivos', 'Nouns'], ['Pronoun', 'Pronombres', 'Pronouns'], ['Verb', 'Verbos', 'Verbs'],
  ['Adjective', 'Adjetivos', 'Adjectives'], ['Adverb', 'Adverbios', 'Adverbs'],
  ['Article', 'Artículos / Determinantes', 'Articles / Determiners'], ['Preposition', 'Preposiciones', 'Prepositions'],
  ['Conjunction', 'Conjunciones', 'Conjunctions'], ['Interjection', 'Interjecciones', 'Interjections'],
  ['Phrase', 'Frases', 'Phrases'], ['Other', 'Otros', 'Other']
]
export const normPos = p => {
  if (/determiner|article/i.test(p)) return 'Article'
  return POS.find(([k]) => new RegExp(k, 'i').test(p))?.[0] || 'Other'
}
// "True value of knowing": blends your confidence score with your actual hit rate. 0..1
export const knowledge = w => {
  const acc = w.seen ? w.correct / w.seen : 0
  return Math.min(1, ((w.score || 0) / 5) * 0.7 + acc * 0.3)
}
export const glosses = w => (w.tr || []).flatMap(s => s.split(/[;,]/)).map(s => s.trim()).filter(Boolean)
export { short }

export function AppProvider({ children }) {
  const [vocab, setVocab] = useState(() => ls('vocab', {}))
  const [settings, setSettings] = useState(() => ls('settings', { apiKey: '', model: 'claude-sonnet-5-5' }))
  const [inspect, setInspect] = useState(null)
  const [phrase, setPhrase] = useState(null)
  useEffect(() => localStorage.setItem('vocab', JSON.stringify(vocab)), [vocab])
  useEffect(() => localStorage.setItem('settings', JSON.stringify(settings)), [settings])
  const addWord = (word, extra = {}) => setVocab(v => {
    const k = word.toLowerCase()
    if (v[k]) return Object.keys(extra).length ? { ...v, [k]: { ...v[k], ...extra } } : v
    return { ...v, [k]: { word: k, pos: 'Other', tr: [], score: 0, seen: 0, correct: 0, due: 0, added: Date.now(), ...extra } }
  })
  const updateWord = (k, patch) => setVocab(v => (v[k] ? { ...v, [k]: { ...v[k], ...patch } } : v))
  const removeWord = k => setVocab(v => { const n = { ...v }; delete n[k]; return n })
  const openWord = w => { addWord(w); setInspect(w.toLowerCase()) }
  return (
    <Ctx.Provider value={{ vocab, setVocab, settings, setSettings, inspect, setInspect, phrase, setPhrase, addWord, updateWord, removeWord, openWord }}>
      {children}
    </Ctx.Provider>
  )
}
