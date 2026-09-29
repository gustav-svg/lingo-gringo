import { useEffect, useRef, useState } from 'react'
import * as db from './db'
import { parse } from './parse'
import { translateCues } from './api'
import { useApp } from './store'

// Loads cues + translations + sync offset for a library item, and saves changes back.
export function useItemData(item) {
  const { settings } = useApp()
  const [data, setData] = useState(null)
  const [url, setUrl] = useState(null)
  const [busy, setBusy] = useState(null)
  const dirty = useRef(false)
  useEffect(() => {
    let obj, dead = false
    dirty.current = false
    setData(null)
    ;(async () => {
      let d = await db.get('data:' + item.id)
      if (!d) {
        let cues = []
        if (item.subUrl) cues = parse(await (await fetch(item.subUrl)).text())
        d = { cues, tr: null, offset: 0 }
      }
      let u = item.url || null
      if (item.blob) u = obj = URL.createObjectURL(item.blob)
      if (!dead) { setData(d); setUrl(u) }
    })()
    return () => { dead = true; obj && URL.revokeObjectURL(obj) }
  }, [item.id])
  useEffect(() => {
    if (!data || !dirty.current) return
    const t = setTimeout(() => db.set('data:' + item.id, data), 300)
    return () => clearTimeout(t)
  }, [data])
  const save = nd => { dirty.current = true; setData(nd) }
  const gen = async (d = data) => {
    setBusy(0)
    const tr = await translateCues(d.cues, settings, setBusy)
    save({ ...d, tr })
    setBusy(null)
  }
  const attach = async file => {
    const cues = parse(await file.text())
    const nd = { cues, tr: null, offset: 0 }
    save(nd)
    gen(nd)
  }
  return { data, url, save, gen, attach, busy }
}
