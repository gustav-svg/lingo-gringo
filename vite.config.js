import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-only helper: the browser can't read YouTube captions directly (CORS),
// so the Vite dev server fetches them and hands the app plain cues as JSON.
const ytCaptions = () => ({
  name: 'yt-captions',
  configureServer(server) {
    server.middlewares.use('/yt-captions', async (req, res) => {
      const send = (code, body) => {
        res.statusCode = code
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(body))
      }
      try {
        const id = new URL(req.url, 'http://x').searchParams.get('v')
        if (!/^[\w-]{11}$/.test(id || '')) return send(400, { error: 'bad id' })
        const pr = await (await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'user-agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip',
          },
          body: JSON.stringify({
            context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', hl: 'es' } },
            videoId: id,
          }),
        })).json()
        const tracks = pr.captions?.playerCaptionsTracklistRenderer?.captionTracks || []
        const es = tracks.filter((t) => t.languageCode?.startsWith('es'))
        const track = es.find((t) => t.kind !== 'asr') || es[0] || tracks[0]
        if (!track) return send(404, { error: 'no captions' })
        let url = track.baseUrl.replace(/&fmt=[^&]*/, '') + '&fmt=json3'
        if (!track.languageCode?.startsWith('es')) url += '&tlang=es' // no Spanish track: let YouTube translate one
        const j = await (await fetch(url)).json()
        const cues = (j.events || [])
          .filter((e) => e.segs)
          .map((e) => ({
            start: e.tStartMs / 1000,
            end: (e.tStartMs + (e.dDurationMs || 2000)) / 1000,
            text: e.segs.map((s) => s.utf8).join('').replace(/\s+/g, ' ').trim(),
          }))
          .filter((c) => c.text)
        cues.forEach((c, i) => { if (cues[i + 1] && c.end > cues[i + 1].start) c.end = cues[i + 1].start })
        send(200, cues)
      } catch (e) {
        send(500, { error: String(e) })
      }
    })
  },
})

export default defineConfig({ plugins: [react(), ytCaptions()] })
