import { useState, useEffect, useRef, useMemo } from "react";

/* ---------- storage + translation ---------- */
const LS = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const cache = LS.get("es_cache", {});
const persist = () => LS.set("es_cache", cache);
const bad = (s) => !s || s === "…" || /MYMEMORY WARNING|INVALID LANGUAGE|QUERY LENGTH/i.test(s);
Object.keys(cache).forEach((k) => bad(cache[k]) && delete cache[k]); // purge old failed lookups

const gtx = async (q) => (await (await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=es&tl=en&dt=t&q=${encodeURIComponent(q)}`)).json())[0].map((x) => x[0]).join("");
const mm = async (q) => {
  const j = await (await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=es|en`)).json();
  if (j.responseStatus != 200) throw 0;
  return j.responseData.translatedText;
};
const gloss = async (w) => { // last resort for single words: first Wiktionary gloss
  const r = await (await fetch("https://en.wiktionary.org/api/rest_v1/page/definition/" + encodeURIComponent(w))).json();
  const d = r.es?.[0]?.definitions?.find((x) => x.definition)?.definition;
  if (!d) throw 0;
  return new DOMParser().parseFromString(d, "text/html").body.textContent.replace(/\(.*?\)/g, "").split(/[;.:]/)[0].trim().slice(0, 40);
};
// literal / word-level translation: Google → MyMemory → Wiktionary. Returns "" on failure (never cached).
const tr = async (text) => {
  const k = "l:" + text.toLowerCase();
  if (cache[k]) return cache[k];
  const single = !/\s/.test(text.trim());
  let same = "";
  for (const f of single ? [gtx, mm, gloss] : [gtx, mm]) {
    try {
      const r = (await f(text)).trim();
      if (bad(r)) continue;
      if (single && r.toLowerCase() === text.toLowerCase()) { same = r; continue; }
      cache[k] = r; persist();
      return r;
    } catch {}
  }
  if (same) { cache[k] = same; persist(); }
  return same;
};

/* ---------- saved library: IndexedDB (imported files) + src/media folder ---------- */
const idb = () => new Promise((res, rej) => {
  const r = indexedDB.open("es_lib", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("items", { keyPath: "id" });
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const dbDo = async (mode, fn) => {
  const db = await idb();
  return new Promise((res, rej) => { const tx = db.transaction("items", mode); const rq = fn(tx.objectStore("items")); tx.oncomplete = () => res(rq?.result); tx.onerror = () => rej(tx.error); });
};
const dbAll = () => dbDo("readonly", (st) => st.getAll());
const dbPut = (v) => dbDo("readwrite", (st) => st.put(v));
const dbDel = (id) => dbDo("readwrite", (st) => st.delete(id));

// every file in src/media is listed automatically; movie.mp4 + movie.srt (same name) are paired
const mediaUrls = import.meta.glob("./media/**/*.{mp4,webm,mov,m4v,mp3,m4a,wav,ogg,aac,flac}", { eager: true, query: "?url", import: "default" });
const mediaSubs = import.meta.glob("./media/**/*.{srt,lrc,vtt,txt}", { eager: true, query: "?url", import: "default" });
const noExt = (f) => f.replace(/\.[^./]+$/, "");
// movie.mp4 pairs with movie.srt, movie.es.srt, movie.es-orig.vtt, movie.spa.srt …
const pairKey = (f) => noExt(f).replace(/[._ -](es([-_][a-z0-9]+)?|spa|spanish|espanol|español|lat|latam|cc|sdh)$/i, "").toLowerCase();
const F = {};
Object.entries(mediaUrls).forEach(([f, url]) => { F[pairKey(f)] = { url, name: f.split("/").pop(), kind: /\.(mp4|webm|mov|m4v)$/i.test(f) ? "video" : "audio" }; });
Object.entries(mediaSubs).forEach(([f, subUrl]) => { const b = pairKey(f); F[b] = { name: f.split("/").pop(), kind: "", ...F[b], subUrl: F[b]?.subUrl || subUrl }; });
Object.keys(F).forEach((a) => { // subtitle whose name is longer/shorter than the video's
  if (F[a].url) return;
  const m = Object.keys(F).find((x) => F[x].url && !F[x].subUrl && (x.startsWith(a) || a.startsWith(x)));
  if (m) { F[m].subUrl = F[a].subUrl; delete F[a]; }
});
const folderItems = Object.entries(F).map(([b, v]) => ({ id: "folder:" + b, folder: true, ...v }));
// UTF-8, UTF-16 and old Latin-1 subtitle files all decode correctly
const decode = (buf) => {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(b).replace(/^\uFEFF/, ""); } catch { return new TextDecoder("windows-1252").decode(b); }
};
const getSubs = async (it) => it.subs ?? (it.subUrl ? decode(await (await fetch(it.subUrl)).arrayBuffer()) : "");

// natural translation: Claude if an API key is set, otherwise falls back to MyMemory
const claude = (key, content, max) => fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
  body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: max, messages: [{ role: "user", content }] }),
}).then((r) => r.json());
const nat = async (text, key) => {
  if (!key) return tr(text);
  const k = "n:" + text;
  if (cache[k]) return cache[k];
  try {
    cache[k] = (await claude(key, `Translate this Spanish subtitle line into natural, idiomatic English. Reply with only the translation.\n${text}`, 300)).content[0].text; persist();
    return cache[k];
  } catch { return tr(text); }
};

/* ---------- whole-file translation helpers ---------- */
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const runPool = async (items, n, fn) => { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { try { await fn(items[i++]); } catch {} } })); };
// many words per request: newline-separated, mapped back by the echoed source text
const gtxBatch = async (ws) => {
  const j = await (await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=es&tl=en&dt=t&q=${encodeURIComponent(ws.join("\n"))}`)).json();
  const m = {};
  j[0].forEach((x) => { if (x[1]) m[x[1].trim().toLowerCase()] = x[0].trim(); });
  return m;
};
// many subtitle lines per Claude request
const natBatch = async (lines, key) => {
  const j = await claude(key, `Translate these Spanish subtitle lines into natural, idiomatic English. Reply with only a JSON array of ${lines.length} strings, in the same order.\n${JSON.stringify(lines)}`, 4000);
  const arr = JSON.parse(j.content[0].text.replace(/```json|```/g, "").trim());
  lines.forEach((l, i) => { if (typeof arr[i] === "string" && arr[i]) cache["n:" + l] = arr[i]; });
  persist();
};
// read a finished translation straight from the cache ("" if not ready yet)
const enSync = (text, mode, key) => {
  if (mode === "literal") {
    const out = (text.match(/[\p{L}'’]+/gu) || []).map((w) => cache["l:" + w.toLowerCase()]);
    return out.length && out.every(Boolean) ? out.join(" ").toLowerCase() : "";
  }
  return (key && cache["n:" + text]) || cache["l:" + text.toLowerCase()] || "";
};

/* ---------- Wiktionary ---------- */
const wik = async (w) => {
  const B = "https://en.wiktionary.org/";
  const get = (u) => fetch(B + u).then((r) => r.json()).catch(() => ({}));
  const [r, p] = await Promise.all([
    get("api/rest_v1/page/definition/" + encodeURIComponent(w)),
    get("w/api.php?action=parse&prop=text&format=json&formatversion=2&origin=*&page=" + encodeURIComponent(w)),
  ]);
  const txt = (h) => new DOMParser().parseFromString(h, "text/html").body.textContent.trim();
  const defs = (r.es || []).map((e) => ({
    pos: e.partOfSpeech,
    items: e.definitions.filter((x) => x.definition).map((x) => ({ def: txt(x.definition), ex: x.parsedExamples?.[0]?.example ? txt(x.parsedExamples[0].example) : "" })),
  }));
  let ipa = "", ety = "", syn = "", img = "";
  if (p.parse?.text) {
    const doc = new DOMParser().parseFromString(p.parse.text, "text/html");
    const h = doc.getElementById("Spanish");
    let n = (h?.closest(".mw-heading") || h?.closest("h2"))?.nextElementSibling, cur = "";
    while (n && !n.matches("h2,.mw-heading2")) {
      if (n.matches("h3,h4,h5,.mw-heading3,.mw-heading4,.mw-heading5")) cur = n.textContent;
      else {
        if (!ipa) ipa = n.querySelector(".IPA")?.textContent || "";
        if (!ety && cur.startsWith("Etymology") && n.tagName === "P") ety = n.textContent.trim();
        if (!syn && cur.startsWith("Synonyms") && n.tagName === "UL") syn = [...n.querySelectorAll("li")].map((l) => l.textContent).join(", ");
        if (!img) { const im = n.querySelector("img[src*='upload.wikimedia.org']"); if (im && +im.getAttribute("width") >= 80) img = "https:" + im.getAttribute("src").replace(/^https?:/, ""); }
      }
      n = n.nextElementSibling;
    }
  }
  return { defs, ipa, ety, syn, img };
};
// "plural of gato", "first-person plural present indicative of hablar" → the dictionary form
const lemmaOf = (d, pos, w) => {
  const t = d.defs.find((x) => x.pos === pos)?.items[0]?.def || "";
  const m = t.match(/^(?:first-person|second-person|third-person|singular|plural|masculine|feminine|past|present|imperfect|preterite|future|conditional|formal|informal|gerund|participle|imperative|inflection|form|superlative|diminutive|augmentative)[^:\n]{0,100}?\bof\s+([\p{L}]+)/iu);
  return m && strip(m[1]) !== strip(w) ? m[1].toLowerCase() : "";
};

/* ---------- subtitle parsing ---------- */
const stamp = (s) => { const m = s.trim().match(/(?:(\d+):)?(\d+):(\d+)[.,](\d+)/); return m ? +(m[1] || 0) * 3600 + +m[2] * 60 + +m[3] + +("0." + m[4]) : 0; };
const parseSrt = (t) => t.replace(/\r/g, "").split(/\n\s*\n/).map((b) => {
  const l = b.split("\n"), i = l.findIndex((x) => x.includes("-->"));
  if (i < 0) return null;
  const [start, end] = l[i].split("-->").map(stamp);
  return { start, end, text: l.slice(i + 1).join(" ").replace(/<[^>]+>/g, "").trim() };
}).filter((c) => c && c.text);
const parseLrc = (t) => {
  const out = [];
  t.split("\n").forEach((l) => { const m = l.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)/); if (m && m[3].trim()) out.push({ start: +m[1] * 60 + +m[2], text: m[3].trim() }); });
  out.forEach((c, i) => (c.end = out[i + 1] ? out[i + 1].start : c.start + 5));
  return out;
};
// pasted YouTube transcript: "0:05" on one line, the words on the next
const parseTimed = (t) => {
  const out = [];
  t.replace(/\r/g, "").split("\n").forEach((l) => {
    const m = l.trim().match(/^(?:(\d+):)?(\d+):(\d\d)(?:\s+(.+))?$/);
    if (m) out.push({ start: +(m[1] || 0) * 3600 + +m[2] * 60 + +m[3], text: m[4] || "" });
    else if (l.trim() && out.length) { const c = out[out.length - 1]; c.text = (c.text + " " + l.trim()).trim(); }
  });
  const r = out.filter((c) => c.text);
  r.forEach((c, i) => (c.end = r[i + 1] ? r[i + 1].start : c.start + 5));
  return r;
};
const ts = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${x.toFixed(3).padStart(6, "0").replace(".", ",")}`; };
const toSrt = (cs, f = (c) => c.text) => cs.map((c, i) => `${i + 1}\n${ts(Math.max(0, c.start))} --> ${ts(Math.max(0, c.end))}\n${f(c)}\n`).join("\n");
// YouTube captions come from the small proxy in vite.config.js (browsers can't read them directly)
const ytCaps = async (id) => {
  const r = await fetch("/yt-captions?v=" + id);
  if (!r.ok) throw 0;
  const cs = await r.json();
  if (!Array.isArray(cs) || !cs.length) throw 0;
  return toSrt(cs);
};
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const say = (w) => { const u = new SpeechSynthesisUtterance(w); u.lang = "es-ES"; speechSynthesis.cancel(); speechSynthesis.speak(u); };

/* MORPH START ---------- Spanish morphology (nouns, adjectives, verbs) ---------- */
const plural = (w) => {
  if (/z$/.test(w)) return w.slice(0, -1) + "ces";
  if (/[aeiouáéóú]$/.test(w)) return w + "s";
  if (/í$/.test(w)) return w + "es";
  if (/[áéíóú]n$/.test(w)) return w.replace(/[áéíóú]n$/, (m) => strip(m[0]) + "n") + "es";
  if (/[áéíóú]s$/.test(w)) return w.replace(/[áéíóú]s$/, (m) => strip(m[0]) + "s") + "es";
  if (/s$/.test(w)) return /[aeiou].*[aeiou].*s$/.test(w) ? w : w + "es";
  return w + "es";
};
// feminine form for -o words and -or/-ón/-án/-ín/-és words (people, animals, adjectives)
const gender = (w) => /o$/.test(w) ? w.slice(0, -1) + "a"
  : /(or|[óáíé][ns])$/.test(w) ? w.replace(/[óáíé]([ns])$/, (m, c) => strip(m[0]) + c) + "a" : null;

const PR = ["yo", "tú", "él/ella", "nosotros", "vosotros", "ellos"];
const HAB = ["he", "has", "ha", "hemos", "habéis", "han"];
const TENSES = [["pres", "Present"], ["pret", "Preterite"], ["imp", "Imperfect"], ["fut", "Future"], ["cond", "Conditional"], ["subj", "Subjunctive"], ["perf", "Perfect"]];
const ER = { pres: ["o", "es", "e", "emos", "éis", "en"], pret: ["í", "iste", "ió", "imos", "isteis", "ieron"], imp: ["ía", "ías", "ía", "íamos", "íais", "ían"], subj: ["a", "as", "a", "amos", "áis", "an"] };
const END = {
  ar: { pres: ["o", "as", "a", "amos", "áis", "an"], pret: ["é", "aste", "ó", "amos", "asteis", "aron"], imp: ["aba", "abas", "aba", "ábamos", "abais", "aban"], subj: ["e", "es", "e", "emos", "éis", "en"] },
  er: ER,
  ir: { ...ER, pres: ["o", "es", "e", "imos", "ís", "en"] },
};
const FUT = ["é", "ás", "á", "emos", "éis", "án"], COND = ["ía", "ías", "ía", "íamos", "íais", "ían"];
const SER_PRET = ["fui", "fuiste", "fue", "fuimos", "fuisteis", "fueron"];
const IRR = {
  ser: { pres: ["soy", "eres", "es", "somos", "sois", "son"], pret: SER_PRET, imp: ["era", "eras", "era", "éramos", "erais", "eran"], subj: ["sea", "seas", "sea", "seamos", "seáis", "sean"] },
  estar: { pres: ["estoy", "estás", "está", "estamos", "estáis", "están"], subj: ["esté", "estés", "esté", "estemos", "estéis", "estén"] },
  ir: { pres: ["voy", "vas", "va", "vamos", "vais", "van"], pret: SER_PRET, imp: ["iba", "ibas", "iba", "íbamos", "ibais", "iban"], subj: ["vaya", "vayas", "vaya", "vayamos", "vayáis", "vayan"] },
  haber: { pres: HAB.map((x, i) => (i === 3 ? "hemos" : x)), subj: ["haya", "hayas", "haya", "hayamos", "hayáis", "hayan"] },
  dar: { pres: ["doy", "das", "da", "damos", "dais", "dan"], pret: ["di", "diste", "dio", "dimos", "disteis", "dieron"], subj: ["dé", "des", "dé", "demos", "deis", "den"] },
  ver: { pres: ["veo", "ves", "ve", "vemos", "veis", "ven"], pret: ["vi", "viste", "vio", "vimos", "visteis", "vieron"], imp: ["veía", "veías", "veía", "veíamos", "veíais", "veían"] },
};
const YO = { tener: "tengo", venir: "vengo", hacer: "hago", poner: "pongo", decir: "digo", salir: "salgo", traer: "traigo", caer: "caigo", saber: "sé", valer: "valgo" };
const SUBJST = { saber: "sep" };
const PST = { tener: "tuv", estar: "estuv", hacer: "hic", poder: "pud", poner: "pus", querer: "quis", saber: "sup", venir: "vin", decir: "dij", traer: "traj", andar: "anduv", haber: "hub" };
const FST = { tener: "tendr", poder: "podr", querer: "querr", hacer: "har", decir: "dir", saber: "sabr", venir: "vendr", poner: "pondr", salir: "saldr", haber: "habr", valer: "valdr" };
const PART = { hacer: "hecho", decir: "dicho", ver: "visto", poner: "puesto", escribir: "escrito", abrir: "abierto", volver: "vuelto", romper: "roto", morir: "muerto", cubrir: "cubierto", resolver: "resuelto" };
const SC = {}; // stem changers: ie / ue / i
"pensar empezar querer entender perder cerrar sentir preferir mentir tener venir".split(" ").forEach((v) => (SC[v] = "ie"));
"poder encontrar volver dormir contar recordar mostrar costar morir mover".split(" ").forEach((v) => (SC[v] = "ue"));
"pedir seguir servir repetir decir vestir competir elegir".split(" ").forEach((v) => (SC[v] = "i"));
SC.jugar = "ju";
const ch = (s, k) => k === "ie" ? s.replace(/e([^e]*)$/, "ie$1") : k === "ue" ? s.replace(/o([^o]*)$/, "ue$1") : k === "ju" ? s.replace(/u([^u]*)$/, "ue$1") : s.replace(/e([^e]*)$/, "i$1");
const ch2 = (s, k) => (k === "ue" ? s.replace(/o([^o]*)$/, "u$1") : s.replace(/e([^e]*)$/, "i$1")); // -ir verbs: sintió, durmamos
// spelling changes: busqué, llegué, empecé, conozco, cojo, venzo, sigo
const spell = (s, e, k) => {
  if (k === "ar") return /^[eé]/.test(e) ? (/c$/.test(s) ? s.slice(0, -1) + "qu" : /g$/.test(s) ? s + "u" : /z$/.test(s) ? s.slice(0, -1) + "c" : s) : s;
  if (!/^[aáo]/.test(e)) return s;
  if (/gu$/.test(s)) return s.slice(0, -1);
  if (/g$/.test(s)) return s.slice(0, -1) + "j";
  if (/[aeiou]c$/.test(s)) return s.slice(0, -1) + "zc";
  if (/c$/.test(s)) return s.slice(0, -1) + "z";
  return s;
};
// returns { pre, base, form }: base is what stays put visually, form is the full word
const conj = (inf, t, p) => {
  const k = inf.slice(-2), s = inf.slice(0, -2), sc = SC[inf], pre = PR[p];
  if (t === "perf") return { pre: pre + " " + HAB[p] + " ", base: s, form: PART[inf] || s + (k === "ar" ? "ado" : /[aeo]$/.test(s) ? "ído" : "ido") };
  const I = IRR[inf]?.[t]?.[p];
  let base = s, form;
  if (I) form = I;
  else if (t === "fut" || t === "cond") { base = inf; form = (FST[inf] || inf) + (t === "fut" ? FUT : COND)[p]; }
  else if (t === "pres" && p === 0 && YO[inf]) form = YO[inf];
  else if (t === "pret" && PST[inf]) { const x = PST[inf]; form = inf === "hacer" && p === 2 ? "hizo" : x + ["e", "iste", "o", "imos", "isteis", /j$/.test(x) ? "eron" : "ieron"][p]; }
  else {
    let st = s, e = END[k][t][p];
    if (t === "pres" && sc && p !== 3 && p !== 4) st = ch(st, sc);
    if (t === "pret" && k === "ir" && sc && sc !== "ju" && (p === 2 || p === 5)) st = ch2(st, sc);
    if (t === "pret" && k !== "ar" && /[aeou]$/.test(s) && !/[gq]u$/.test(s)) {
      if (p === 2 || p === 5) e = e.replace(/^i/, "y");
      else if (/[aeo]$/.test(s)) e = e.replace(/^i/, "í");
    }
    if (t === "subj") {
      if (SUBJST[inf]) st = SUBJST[inf];
      else if (YO[inf]?.endsWith("o")) st = YO[inf].slice(0, -1);
      else {
        if (sc && p !== 3 && p !== 4) st = ch(st, sc);
        else if (sc && k === "ir" && sc !== "ju") st = ch2(st, sc);
        st = spell(st, e, k);
      }
    } else st = spell(st, e, k);
    form = st + e;
  }
  return { pre, base, form };
};
/* MORPH END */

/* ---------- components ---------- */
function Word({ w, onClick }) {
  const [en, setEn] = useState("");
  const [hov, setHov] = useState(false);
  const enter = () => { setHov(true); if (!en) tr(w).then((t) => setEn(t.toLowerCase())); };
  const show = hov && en;
  return (
    <span className="w" onMouseEnter={enter} onMouseLeave={() => setHov(false)} onClick={() => onClick(w.toLowerCase(), en)}>
      <span style={{ gridArea: "1/1", opacity: show ? 0 : 1 }}>{w}</span>
      <span style={{ gridArea: "1/1", opacity: show ? 1 : 0, color: "var(--sky)" }}>{en}</span>
    </span>
  );
}
const Line = ({ text, onWord }) => text.split(/([\p{L}'’]+)/u).map((p, i) => (i % 2 ? <Word key={i} w={p} onClick={onWord} /> : p));

function EnLine({ text, mode, k }) {
  const [t, setT] = useState("");
  useEffect(() => {
    let alive = true;
    setT("");
    (async () => {
      const s = mode === "literal" ? (await Promise.all(text.match(/[\p{L}'’]+/gu)?.map(tr) || [])).filter(Boolean).join(" ").toLowerCase() : await nat(text, k);
      alive && setT(s || "—");
    })();
    return () => { alive = false; };
  }, [text, mode, k]);
  return <div className="en">{t || "…"}</div>;
}

// root stays in place; only the prefix and suffix around it animate
function Root({ base, form, pre = "" }) {
  let i = 0;
  while (i < base.length && i < form.length && base[i].toLowerCase() === form[i].toLowerCase()) i++;
  return (
    <div className="morph">
      <span className="pre" key={"p" + pre}>{pre}</span>
      <span className="root">{form.slice(0, i)}</span>
      <span className="suf" key={"s" + form + pre}>{form.slice(i)}</span>
    </div>
  );
}
function Infl({ w, noun }) {
  const g = gender(w);
  const [pl, setPl] = useState(false);
  const [fem, setFem] = useState(false);
  useEffect(() => { setPl(false); setFem(false); }, [w]);
  const b = fem && g ? g : w;
  const art = noun && g ? (fem ? (pl ? "las " : "la ") : (pl ? "los " : "el ")) : "";
  return (
    <div className="mp">
      <div className="row wrap">
        <button className={!pl ? "on" : ""} onClick={() => setPl(false)}>singular</button>
        <button className={pl ? "on" : ""} onClick={() => setPl(true)}>plural</button>
        {g && <><button title="masculine" className={!fem ? "on" : ""} onClick={() => setFem(false)}>♂</button><button title="feminine (if it has one)" className={fem ? "on" : ""} onClick={() => setFem(true)}>♀</button></>}
      </div>
      <Root base={w} form={pl ? plural(b) : b} pre={art} />
    </div>
  );
}
function Conj({ w }) {
  const [t, setT] = useState("pres");
  const [p, setP] = useState(0);
  useEffect(() => { setT("pres"); setP(0); }, [w]);
  return (
    <div className="mp">
      <div className="row wrap">{TENSES.map(([id, l]) => <button key={id} className={t === id ? "on" : ""} onClick={() => setT(id)}>{l}</button>)}</div>
      <div className="row wrap">{PR.map((x, i) => <button key={i} className={p === i ? "on" : ""} onClick={() => setP(i)}>{x}</button>)}</div>
      <Root {...conj(w, t, p)} />
      <div className="grid">{PR.map((_, i) => <div key={i} className={"gl" + (i === p ? " sel" : "")} onClick={() => setP(i)}><Root {...conj(w, t, i)} /></div>)}</div>
      <p className="dim" style={{ fontSize: 12, margin: "4px 0 0" }}>Covers regular verbs and the most common irregulars; rare ones may be off.</p>
    </div>
  );
}

function Inspector({ w, close, v, patch, go }) {
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); wik(w).then(setD); }, [w]);
  const pos = d ? [...new Set(d.defs.map((g) => g.pos))] : [];
  const lem = d && pos.length ? lemmaOf(d, pos[0], w) : "";
  const vlem = d && pos.includes("Verb") ? lemmaOf(d, "Verb", w) || w : "";
  const nlem = d ? lemmaOf(d, pos.includes("Noun") ? "Noun" : "Adjective", w) || w : w;
  const pic = v?.img || d?.img;
  return (
    <div className="insp">
      <div className="row"><h2>{w}</h2><button onClick={() => say(w)}>🔊</button><span className="grow" /><button onClick={close}>✕</button></div>
      {pic && <img className="pic" src={pic} alt="" />}
      <div className="row">
        <button onClick={() => patch({})}>{v ? "Saved ✓" : "＋ Save"}</button>
        <button onClick={() => { const u = prompt("Photo link (https://…)"); if (u) patch({ img: u }); }}>🖼 Link</button>
        <label className="file">📁 File<input type="file" accept="image/*" onChange={(e) => {
          const f = e.target.files[0]; if (!f) return;
          const r = new FileReader();
          r.onload = () => { const im = new Image(); im.onload = () => { const c = document.createElement("canvas"), k = 240 / Math.max(im.width, im.height, 240); c.width = im.width * k; c.height = im.height * k; c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); patch({ img: c.toDataURL("image/jpeg", 0.8) }); }; im.src = r.result; };
          r.readAsDataURL(f); e.target.value = "";
        }} /></label>
      </div>
      {!d ? <p className="dim">Looking up Wiktionary…</p> : (
        <>
          <div className="row wrap">{d.ipa && <span className="ipa">{d.ipa}</span>}{pos.length > 0 && <b className="pos">{pos.join(" · ")}</b>}</div>
          {lem && <p className="dim" style={{ margin: "2px 0" }}>form of <b className="link" onClick={() => go(lem)}>{lem}</b></p>}
          {(pos.includes("Noun") || pos.includes("Adjective")) && <Infl w={nlem} noun={!pos.includes("Adjective")} />}
          {vlem && /[aei]r$/.test(vlem) && <Conj w={vlem} />}
          {!d.defs.length && <p className="dim">No Spanish entry found for “{w}”.</p>}
          {d.defs.map((g, i) => (
            <div key={i}>
              <b className="pos">{g.pos}</b>
              <ol>{g.items.map((x, j) => <li key={j}>{x.def}{x.ex && <div className="dim"><i>{x.ex}</i></div>}</li>)}</ol>
            </div>
          ))}
          {d.syn && <p><b>Synonyms:</b> {d.syn}</p>}
          {d.ety && <p><b>Etymology:</b> {d.ety}</p>}
        </>
      )}
    </div>
  );
}

const norm = (s) => s.toLowerCase().replace(/[^a-z ]/g, "").trim();
const DAY = 864e5;
const STEPS = [6e5, DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 60 * DAY];

const loadBank = async () => {
  const c = LS.get("es_bank3", null);
  if (c?.length > 100) return c;
  const seen = new Set(), out = [];
  for (const pg of ["Spanish1000", "Spanish/Subtitles10K"]) {
    try {
      const j = await (await fetch("https://en.wiktionary.org/w/api.php?action=parse&prop=text&format=json&formatversion=2&origin=*&page=" + encodeURIComponent("Wiktionary:Frequency lists/" + pg))).json();
      const doc = new DOMParser().parseFromString(j.parse.text, "text/html");
      let as = [...doc.querySelectorAll('a[href*="#Spanish"]')];
      if (as.length < 100) as = [...doc.querySelectorAll('li a[href^="/wiki/"], td a[href^="/wiki/"]')].filter((a) => !a.getAttribute("href").includes(":"));
      as.forEach((a) => { const w = a.textContent.trim().toLowerCase(); if (out.length < 3000 && /^\p{L}+$/u.test(w) && !seen.has(w)) { seen.add(w); out.push(w); } });
    } catch {}
  }
  if (out.length > 100) LS.set("es_bank3", out);
  return out;
};
// word type (noun, verb …) looked up from Wiktionary once per word, then cached
const POS = LS.get("es_pos", {});
const classify = async (ws, tick) => {
  const todo = ws.filter((w) => !POS[w]);
  let i = 0, n = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < todo.length) {
      const w = todo[i++];
      try { POS[w] = (await (await fetch("https://en.wiktionary.org/api/rest_v1/page/definition/" + encodeURIComponent(w))).json()).es?.[0]?.partOfSpeech || "Other"; } catch {}
      if (++n % 20 === 0) { LS.set("es_pos", POS); tick(n); }
    }
  }));
  LS.set("es_pos", POS); tick(n + 1);
};
const IDIOMS = [["estar en las nubes", "to be daydreaming"], ["costar un ojo de la cara", "to cost an arm and a leg"], ["meter la pata", "to put your foot in it"], ["no hay mal que por bien no venga", "every cloud has a silver lining"], ["tomar el pelo", "to pull someone's leg"], ["ponerse las pilas", "to get your act together"], ["dar en el clavo", "to hit the nail on the head"], ["ser pan comido", "to be a piece of cake"], ["hablar por los codos", "to talk nonstop"], ["a caballo regalado no se le mira el diente", "don't look a gift horse in the mouth"], ["más vale tarde que nunca", "better late than never"], ["al mal tiempo, buena cara", "keep smiling through hard times"], ["estar sin blanca", "to be broke"], ["echar una mano", "to lend a hand"], ["dar la lata", "to be a nuisance"], ["no tener pelos en la lengua", "to speak bluntly"], ["ser uña y carne", "to be inseparable"], ["quedarse de piedra", "to be stunned"], ["empezar de cero", "to start from scratch"], ["tirar la casa por la ventana", "to spend lavishly"],
  ["estar hecho polvo", "to be exhausted"], ["llover a cántaros", "to rain cats and dogs"], ["salir el tiro por la culata", "to backfire"], ["ponerse en mi lugar", "to put yourself in my shoes"], ["ni fu ni fa", "so-so"], ["estar en las últimas", "to be on one's last legs"], ["no dar pie con bola", "to get everything wrong"], ["quedar como un rey", "to make a great impression"], ["hacer de tripas corazón", "to make the best of a bad situation"]];
const strip = (w) => w.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// review decks: [id, label]. "pos:Type:count" = most frequent words of that type, "pic:..." = picture → Spanish word
const DECKS = [["mine", "My words"], ["recent", "Recently saved (20)"], ["top100", "100 most frequent words"], ["top1000", "1000 most frequent words"], ["top3000", "3000 most frequent words"],
  ["pos:Article:100", "Articles"], ["pos:Pronoun:100", "Pronouns"], ["pos:Preposition:100", "Prepositions"], ["pos:Conjunction:100", "Conjunctions"], ["pos:Interjection:100", "Interjections"],
  ["pos:Noun:100", "100 most frequent nouns"], ["pos:Adverb:100", "100 most frequent adverbs"], ["pos:Verb:100", "100 most frequent verbs"], ["pos:Adjective:100", "100 most frequent adjectives"],
  ["pos:Noun:1000", "1000 most frequent nouns"], ["pos:Verb:500", "500 most frequent verbs"], ["pos:Adjective:500", "500 most frequent adjectives"],
  ["idioms", "Idioms and sayings"], ["pic:top:100", "100 most frequent words: picture → Spanish"], ["pic:Noun:100", "100 nouns: picture → Spanish"]];

function Review({ vocab, setVocab, bank }) {
  const [deck, setDeck] = useState("mine");
  const [ans, setAns] = useState("");
  const [res, setRes] = useState(null);
  const [gloss, setGloss] = useState("");
  const all = Object.values(vocab);
  const [tick, setTick] = useState(0);
  const pic = deck.startsWith("pic:");
  const [, kind, cnt] = deck.split(":");
  const needsPos = (pic && kind === "Noun") || deck.startsWith("pos:");
  const mk = (w) => vocab[w] || { w, en: "", box: 0, due: 0 };
  const ws = deck === "idioms" ? IDIOMS.map(([w, en]) => vocab[w] || { w, en, box: 0, due: 0 })
    : pic ? (kind === "top" ? bank : bank.filter((w) => POS[w] === "Noun")).slice(0, +cnt).map(mk)
    : deck.startsWith("pos:") ? bank.filter((w) => POS[w] === kind).slice(0, +cnt).map(mk)
    : deck.startsWith("top") ? bank.slice(0, +deck.slice(3)).map(mk) : null;
  const pool = ws || (deck === "mine" ? all : [...all].sort((a, b) => b.added - a.added).slice(0, 20));
  useEffect(() => { if (needsPos && bank.length) classify(bank, setTick); }, [deck, bank.length]);
  const due = pool.filter((v) => v.due <= Date.now()).sort((a, b) => a.due - b.due);
  const cur = due[0];
  const [pimg, setPimg] = useState("");
  useEffect(() => {
    setPimg("");
    if (!pic || !cur) return;
    tr(cur.w).then((g) => fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(g.toLowerCase())).then((r) => r.json())).then((j) => setPimg(j.thumbnail?.source || "")).catch(() => {});
  }, [cur?.w, pic]);
  useEffect(() => { setGloss(""); if (cur && !cur.en) tr(cur.w).then((x) => setGloss(x.toLowerCase())); }, [cur?.w]);
  const en = cur ? cur.en || gloss : "";
  const mic = () => {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R) return alert("Speech recognition isn't supported in this browser.");
    const r = new R(); r.lang = pic ? "es-ES" : "en-US"; r.onresult = (e) => setAns(e.results[0][0].transcript); r.start();
  };
  const same = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x.includes(y) || y.includes(x) || x.split(" ").some((t) => t.length > 3 && y.split(" ").includes(t))); };
  const check = () => setRes(pic ? strip(ans.trim()) === strip(cur.w) : same(ans, en));
  const rate = (c) => {
    const box = res ? Math.min(6, (cur.box || 0) + (c >= 4 ? 2 : 1)) : 0;
    setVocab({ ...vocab, [cur.w]: { added: Date.now(), ...cur, en, box, due: Date.now() + STEPS[box] } });
    setAns(""); setRes(null);
  };
  const sorting = needsPos && Object.keys(POS).length < bank.length;
  return (
    <div>
      <select value={deck} onChange={(e) => { setDeck(e.target.value); setRes(null); setAns(""); }}>
        {DECKS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {!cur ? <p className="dim">{!bank.length && deck !== "mine" && deck !== "idioms" ? "Loading the word bank…" : sorting ? `Sorting words by type… (${Object.keys(POS).length}/${bank.length}, first time only)` : "Nothing due in this deck."}</p> : (
        <>
          <p className="dim">{due.length} due{sorting ? ` · still sorting (${Object.keys(POS).length}/${bank.length})` : ""}</p>
          {pic ? (pimg ? <img className="pic" src={pimg} alt="" /> : <p className="dim">Which Spanish word? ({en || "…"})</p>) : <div className="big">{cur.w} <button onClick={() => say(cur.w)}>🔊</button></div>}
          {cur.img && <img className="pic" src={cur.img} alt="" />}
          <div className="row">
            <input className="grow" placeholder={pic ? "Type the Spanish word…" : "Type the English…"} value={ans} disabled={res !== null} onChange={(e) => setAns(e.target.value)} onKeyDown={(e) => e.key === "Enter" && res === null && check()} />
            <button onClick={mic}>🎤</button>
            {res === null && <button className="pri" onClick={check}>Check</button>}
          </div>
          {res !== null && (
            <>
              <p>{res ? "✅ Correct" : "❌ Not quite"}: <b>{pic ? cur.w : en || "…"}</b></p>
              <p className="dim">How confident were you?</p>
              <div className="row">{[1, 2, 3, 4, 5].map((c) => <button key={c} onClick={() => rate(c)}>{c}</button>)}</div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// hand-picked groups by meaning (tap any word to open it)
const THEMES = {
  Food: "comer beber pan agua leche carne pollo pescado fruta manzana naranja queso huevo arroz sopa vino cerveza café té sal azúcar cena desayuno almuerzo".split(" "),
  Family: "madre padre hijo hija hermano hermana abuelo abuela tío tía primo esposo esposa familia niño niña bebé".split(" "),
  Body: "cabeza mano pie ojo boca nariz oreja brazo pierna corazón cara pelo dedo espalda cuerpo".split(" "),
  Time: "día noche mañana tarde hora minuto semana mes año hoy ayer siempre nunca ahora antes después".split(" "),
  Colors: "rojo azul verde amarillo negro blanco gris rosa naranja marrón morado".split(" "),
  Numbers: "uno dos tres cuatro cinco seis siete ocho nueve diez cien mil primero segundo".split(" "),
  Places: "casa ciudad calle país pueblo escuela tienda mercado playa montaña río mar parque hospital iglesia".split(" "),
  Animals: "perro gato caballo pájaro pez vaca cerdo oveja ratón lobo oso león".split(" "),
  Nature: "sol luna estrella cielo lluvia viento fuego tierra árbol flor mar nieve".split(" "),
  Feelings: "amor odio miedo alegría tristeza enojo esperanza sorpresa felicidad dolor".split(" "),
  Travel: "viaje avión tren coche autobús billete maleta hotel aeropuerto calle mapa".split(" "),
  Work: "trabajo dinero empresa jefe oficina reunión empleo sueldo cliente proyecto".split(" "),
};

function Bank({ bank, vocab, onPick }) {
  const [mode, setMode] = useState("cloud");
  const [n, setN] = useState(300);
  const [, setTick] = useState(0);
  useEffect(() => { if (mode === "type") classify(bank.slice(0, n), setTick); }, [mode, n, bank.length]);
  if (!bank.length) return <p className="dim">Loading the frequency list from Wiktionary…</p>;
  const ws = bank.slice(0, n).map((w, i) => ({ w, r: i + 1 }));
  const list = mode === "az" ? [...ws].sort((a, b) => a.w.localeCompare(b.w)) : ws;
  return (
    <>
      <div className="row wrap">
        {[["cloud", "Cloud"], ["freq", "Frequency"], ["az", "A–Z"], ["type", "By type"], ["theme", "Themes"]].map(([id, l]) => <button key={id} className={mode === id ? "on" : ""} onClick={() => setMode(id)}>{l}</button>)}
        {mode !== "theme" && <select value={n} onChange={(e) => setN(+e.target.value)}>{[100, 300, 1000, 3000].map((x) => <option key={x} value={x}>Top {x}</option>)}</select>}
      </div>
      {mode === "type" ? Object.entries(ws.reduce((g, x) => { (g[POS[x.w] || "…"] ||= []).push(x.w); return g; }, {})).map(([k, v]) => (
        <div key={k}><b className="pos">{k} ({v.length})</b><div className="cloud" style={{ fontSize: 15 }}>{v.map((w) => <span key={w} onClick={() => onPick(w)}>{w}</span>)}</div></div>
      )) : mode === "theme" ? Object.entries(THEMES).map(([k, v]) => (
        <div key={k}><b className="pos">{k}</b><div className="cloud" style={{ fontSize: 16 }}>{v.map((w) => <span key={w} onClick={() => onPick(w)} style={{ color: vocab[w] ? "var(--gold)" : "var(--ink)" }}>{w}</span>)}</div></div>
      )) : mode === "cloud" ? (
        <div className="cloud">{ws.map(({ w, r }) => <span key={w} onClick={() => onPick(w)} style={{ fontSize: 12 + 30 * Math.pow(1 - r / (n + 1), 3), color: vocab[w] ? "var(--gold)" : "var(--ink)" }}>{w}</span>)}</div>
      ) : list.map(({ w, r }) => (
        <div key={w} className="row vw"><span className="dim">{r}</span><b className="link grow" onClick={() => onPick(w)}>{w}</b>{vocab[w] && <span>✓</span>}</div>
      ))}
    </>
  );
}

const score = (g, t) => {
  const r = Array(g.length).fill("x"), left = [...t];
  [...g].forEach((c, i) => { if (c === t[i]) { r[i] = "g"; left[i] = null; } });
  [...g].forEach((c, i) => { if (r[i] === "x") { const k = left.indexOf(c); if (k > -1) { r[i] = "y"; left[k] = null; } } });
  return r;
};
function Wordle({ bank }) {
  const [len, setLen] = useState(5);
  const [max, setMax] = useState(6);
  const [t, setT] = useState("");
  const [gs, setGs] = useState([]);
  const [inp, setInp] = useState("");
  const [mean, setMean] = useState("");
  const start = () => {
    const pool = [...new Set(bank.map(strip))].filter((w) => w.length === len && /^[a-z]+$/.test(w));
    setT(pool[Math.floor(Math.random() * pool.length)] || ""); setGs([]); setInp(""); setMean("");
  };
  useEffect(() => { if (bank.length) start(); }, [bank.length, len]);
  const done = !!t && (gs.includes(t) || gs.length >= max);
  useEffect(() => { if (done) tr(bank.find((w) => strip(w) === t) || t).then((x) => setMean(x.toLowerCase())); }, [done]);
  const submit = () => { if (inp.length === len && !done) { setGs([...gs, inp]); setInp(""); } };
  if (!bank.length) return <p className="dim">Waiting for the word bank…</p>;
  return (
    <div>
      <div className="row">
        <select value={len} onChange={(e) => setLen(+e.target.value)}>{[4, 5, 6, 7].map((n) => <option key={n} value={n}>{n} letters</option>)}</select>
        <select value={max} onChange={(e) => setMax(+e.target.value)}>{[4, 5, 6, 8].map((n) => <option key={n} value={n}>{n} tries</option>)}</select>
        <button onClick={start}>New word</button>
      </div>
      {gs.map((g, i) => <div key={i} className="row">{score(g, t).map((r, j) => <span key={j} className={"tile " + r}>{g[j]}</span>)}</div>)}
      {!done && <input maxLength={len} value={inp} placeholder={`${len} letters, then Enter`} onChange={(e) => setInp(strip(e.target.value).replace(/[^a-z]/g, ""))} onKeyDown={(e) => e.key === "Enter" && submit()} />}
      {done && <p>{gs.includes(t) ? "🎉 " : "It was "}<b>{t}</b>{mean && ` — ${mean}`}</p>}
    </div>
  );
}
// uses your saved words once you have 4, otherwise the most common Spanish words
function Trivia({ vocab, bank }) {
  const [q, setQ] = useState(null);
  const [pick, setPick] = useState(null);
  const [pts, setPts] = useState(0);
  const savedCount = Object.values(vocab).filter((v) => v.en).length;
  const next = async () => {
    const saved = Object.values(vocab).filter((v) => v.en).map((v) => [v.w, v.en]);
    const src = saved.length >= 4 ? saved : bank.slice(0, 500).map((w) => [w, null]);
    if (src.length < 4) return;
    const sh = [...src].sort(() => Math.random() - 0.5).slice(0, 4);
    setPick(null); setQ(null);
    const opts = await Promise.all(sh.map(async ([w, en]) => en || (await tr(w)).toLowerCase()));
    if (opts.some((o) => !o) || new Set(opts).size < 4) return setTimeout(next, 300);
    setQ({ w: sh[0][0], ans: opts[0], opts: [...opts].sort(() => Math.random() - 0.5) });
  };
  useEffect(() => { if (!q) next(); }, [bank.length]);
  if (!q) return <p className="dim">Loading a question…</p>;
  return (
    <div>
      <p className="dim">Score {pts}{savedCount < 4 ? " · using common words until you save 4" : ""}</p>
      <div className="big">{q.w}</div>
      {q.opts.map((o, i) => <button key={i} className={"opt" + (pick ? (o === q.ans ? " ok" : o === pick ? " no" : "") : "")} disabled={!!pick} onClick={() => { setPick(o); if (o === q.ans) setPts(pts + 1); }}>{o}</button>)}
      {pick && <button className="pri" onClick={next}>Next</button>}
    </div>
  );
}
function Games({ bank, vocab }) {
  const [g, setG] = useState("wordle");
  return (
    <div>
      <div className="row">{[["wordle", "Wordle"], ["trivia", "Trivia"]].map(([id, l]) => <button key={id} className={g === id ? "on" : ""} onClick={() => setG(id)}>{l}</button>)}</div>
      {g === "wordle" ? <Wordle bank={bank} /> : <Trivia vocab={vocab} bank={bank} />}
    </div>
  );
}

/* ---------- app ---------- */
export default function App() {
  const [cues, setCues] = useState([]);
  const [plain, setPlain] = useState(false);
  const [src, setSrc] = useState("");
  const [kind, setKind] = useState("");
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [rate, setRate] = useState(LS.get("es_rate", 1));
  const [off, setOff] = useState(0);
  const [sync, setSync] = useState(false);
  const [sel, setSel] = useState(-1);
  const [tab, setTab] = useState("library");
  const [tmode, setTmode] = useState(LS.get("es_tmode", "natural"));
  const [key, setKey] = useState(LS.get("es_key", ""));
  const [vocab, setVocab] = useState(LS.get("es_vocab", {}));
  const [insp, setInsp] = useState("");
  const [sent, setSent] = useState(null);
  const [paste, setPaste] = useState("");
  const [tpaste, setTpaste] = useState("");
  const [ytMsg, setYtMsg] = useState("");
  const [prog, setProg] = useState(null);
  const [bi, setBi] = useState(true);
  const [sortBy, setSortBy] = useState("recent");
  const mref = useRef(), box = useRef(), drag = useRef(null);
  const [lib, setLib] = useState([]);
  const [curId, setCurId] = useState("");
  const startAt = useRef(0), blobUrl = useRef("");
  const [bank, setBank] = useState([]);
  const [ytUrl, setYtUrl] = useState("");
  useEffect(() => { loadBank().then(setBank).catch(() => {}); }, []);

  useEffect(() => LS.set("es_vocab", vocab), [vocab]);
  useEffect(() => LS.set("es_key", key), [key]);
  useEffect(() => { LS.set("es_rate", rate); LS.set("es_tmode", tmode); }, [rate, tmode]);
  // remember where you stopped in each item
  const bucket = Math.floor(t / 3);
  useEffect(() => { if (curId && t > 1) LS.set("es_prog", { ...LS.get("es_prog", {}), [curId]: { pos: t, off, at: Date.now() } }); }, [bucket, off, curId]);
  // load saved + folder items, reopen the last one
  useEffect(() => {
    dbAll().catch(() => []).then((rows) => {
      const ov = Object.fromEntries(rows.map((r) => [r.id, r]));
      const all = [...folderItems.map((f) => ({ ...f, ...(ov[f.id]?.subs ? { subs: ov[f.id].subs } : {}), folder: true })), ...rows.filter((r) => !r.id.startsWith("folder:"))];
      setLib(all);
      const last = all.find((x) => x.id === LS.get("es_last", ""));
      if (last) openItem(last);
    });
  }, []);
  useEffect(() => { const id = setInterval(() => mref.current && setT(mref.current.currentTime), 120); return () => clearInterval(id); }, []);
  useEffect(() => { if (mref.current) mref.current.playbackRate = rate; }, [rate, src]);
  // YouTube: wrap the IFrame player so it behaves like a <video> for the controls above
  useEffect(() => {
    if (!src.startsWith("yt:")) return;
    let p;
    const make = () => {
      p = new window.YT.Player("ytp", { videoId: src.slice(3), playerVars: { rel: 0, playsinline: 1 }, events: { onReady: () => {
        mref.current = {
          get currentTime() { return p.getCurrentTime?.() || 0; }, set currentTime(x) { p.seekTo(x, true); },
          get paused() { return p.getPlayerState() !== 1; }, play: () => p.playVideo(), pause: () => p.pauseVideo(),
          set playbackRate(r) { p.setPlaybackRate(r); },
        };
        setDur(p.getDuration()); p.setPlaybackRate(rate);
        if (startAt.current) { p.seekTo(startAt.current, true); startAt.current = 0; }
      } } });
    };
    if (window.YT?.Player) make();
    else { window.onYouTubeIframeAPIReady = make; const tg = document.createElement("script"); tg.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(tg); }
    return () => { try { p?.destroy(); } catch {} mref.current = null; };
  }, [src]);

  const ai = plain ? -1 : cues.findIndex((c) => t >= c.start + off && t < c.end + off);
  useEffect(() => { document.getElementById("cue" + ai)?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [ai]);

  const load = (txt) => {
    const srt = /-->/.test(txt);
    const lrc = !srt && /^\[\d+:\d+/m.test(txt);
    const timed = !srt && !lrc && /^\s*(?:\d+:)?\d+:\d\d\s*$/m.test(txt);
    const isPlain = !srt && !lrc && !timed;
    setPlain(isPlain);
    setCues(srt ? parseSrt(txt) : lrc ? parseLrc(txt) : timed ? parseTimed(txt) : txt.split(/\n+/).map((x) => x.trim()).filter(Boolean).map((text, i) => ({ start: i, end: i + 1, text })));
  };
  const readFile = (f, fn) => { if (!f) return; f.arrayBuffer().then((b) => fn(decode(b))); };
  const current = lib.find((x) => x.id === curId);
  const saveItem = async (rec) => {
    try { await dbPut(rec); } catch {}
    setLib((l) => (l.some((x) => x.id === rec.id) ? l.map((x) => (x.id === rec.id ? { ...x, ...rec } : x)) : [...l, rec]));
  };
  const fetchYt = async (it) => {
    setYtMsg("Fetching YouTube captions…");
    try { const s = await ytCaps(it.yt); await saveItem({ ...it, subs: s }); load(s); setYtMsg(""); }
    catch { setYtMsg("Couldn't fetch captions automatically (the video may have none, or the proxy in vite.config.js isn't running — restart npm run dev after adding it)."); }
  };
  const openItem = async (it) => {
    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    blobUrl.current = it.blob ? URL.createObjectURL(it.blob) : "";
    const pg = LS.get("es_prog", {})[it.id] || {};
    startAt.current = pg.pos || 0;
    setCurId(it.id); setSrc(blobUrl.current || it.url || (it.yt ? "yt:" + it.yt : "")); setKind(it.kind || "");
    setOff(pg.off || 0); setT(0); setSel(-1); setTab("transcript"); setYtMsg("");
    const s = await getSubs(it).catch(() => "");
    load(s);
    LS.set("es_last", it.id);
    if (it.yt && !s) fetchYt(it);
  };
  const onMedia = async (f) => {
    if (!f) return;
    const it = { id: "up:" + Date.now(), name: f.name, kind: f.type.startsWith("video") || /\.(mp4|webm|mov|m4v|mkv)$/i.test(f.name) ? "video" : "audio", blob: f, subs: "", added: Date.now() };
    await saveItem(it); openItem(it);
  };
  const attachSubs = async (txt, name) => {
    if (current && (current.blob || current.url || current.yt)) {
      await saveItem(current.folder ? { id: current.id, subs: txt } : { ...current, subs: txt });
      return load(txt);
    }
    const it = { id: "up:" + Date.now(), name, kind: "", subs: txt, added: Date.now() };
    await saveItem(it); openItem(it);
  };
  const newText = async (txt) => {
    if (!txt.trim()) return;
    const it = { id: "up:" + Date.now(), name: txt.trim().slice(0, 30), kind: "", subs: txt, added: Date.now() };
    await saveItem(it); setPaste(""); openItem(it);
  };
  const addYt = async () => {
    const m = ytUrl.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/);
    if (!m) return alert("That doesn't look like a YouTube link.");
    const title = await fetch("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(ytUrl)).then((r) => r.json()).then((j) => j.title).catch(() => "");
    const it = { id: "yt:" + m[1], name: title || "YouTube " + m[1], kind: "video", yt: m[1], subs: "", added: Date.now() };
    await saveItem(it); setYtUrl(""); openItem(it); // openItem fetches the captions
  };
  const remove = async (it) => {
    try { await dbDel(it.id); } catch {}
    setLib((l) => l.filter((x) => x.id !== it.id));
    if (curId === it.id) { setCurId(""); setSrc(""); setKind(""); setCues([]); }
  };
  const meta = (e) => { setDur(e.target.duration); if (startAt.current) { e.target.currentTime = startAt.current; startAt.current = 0; } };

  const onWord = (w, en) => {
    setInsp(w); setTab("transcript");
    setVocab((v) => (v[w] ? v : { ...v, [w]: { w, en: en || "", box: 0, due: Date.now(), added: Date.now() } }));
    if (!en) tr(w).then((x) => setVocab((v) => ({ ...v, [w]: { ...v[w], en: x.toLowerCase() } })));
  };
  const patch = (w, o) => setVocab((v) => ({ ...v, [w]: { w, en: "", box: 0, due: Date.now(), added: Date.now(), ...v[w], ...o } }));
  const onSelect = () => {
    const s = window.getSelection().toString().trim();
    if (s.includes(" ")) { setSent({ es: s, en: "…" }); nat(s, key).then((en) => setSent({ es: s, en })); }
  };

  const m = () => mref.current;
  const toggle = () => (m().paused ? m().play() : m().pause());
  const seek = (x) => { m().currentTime = Math.max(0, Math.min(dur || 1e9, x)); setT(m().currentTime); };
  const fs = () => (document.fullscreenElement ? document.exitFullscreen() : box.current.requestFullscreen());

  // translate the whole file in the background: every word (literal) and every line (natural)
  useEffect(() => {
    if (!cues.length) { setProg(null); return; }
    let dead = false;
    const lines = [...new Set(cues.map((c) => c.text))];
    const ws = [...new Set(lines.flatMap((l) => l.match(/[\p{L}'’]+/gu) || []).map((w) => w.toLowerCase()))].filter((w) => !cache["l:" + w]);
    const nl = lines.filter((l) => (key ? !cache["n:" + l] : !cache["l:" + l.toLowerCase()]));
    const total = ws.length + nl.length;
    let done = 0;
    const bump = (n) => { done += n; if (!dead) setProg({ done: Math.min(done, total), total }); };
    setProg({ done: 0, total });
    const timer = setTimeout(async () => {
      await runPool(chunk(ws, 40), 3, async (ch) => {
        if (dead) return;
        let map = {};
        try { map = await gtxBatch(ch); } catch {}
        for (const w of ch) {
          const r = map[w];
          if (r && !bad(r)) cache["l:" + w] = r;
          else if (!dead) await tr(w);
        }
        persist(); bump(ch.length);
      });
      if (key) await runPool(chunk(nl, 25), 2, async (ch) => { if (dead) return; try { await natBatch(ch, key); } catch {} bump(ch.length); });
      else await runPool(nl, 4, async (l) => { if (!dead) await tr(l); bump(1); });
      if (!dead) setProg({ done: total, total });
    }, 800);
    return () => { dead = true; clearTimeout(timer); };
  }, [cues, key]);
  const exportEn = (mode) => {
    const s = toSrt(cues.map((c) => ({ ...c, start: c.start + off, end: c.end + off })), (c) => enSync(c.text, mode, key) || c.text);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([s], { type: "text/plain" }));
    a.download = (current?.name || "subtitles").replace(/\.[^.]+$/, "") + `.en-${mode}.srt`;
    a.click();
  };

  const cue = cues[ai];
  useEffect(() => {
    if (!cue) return;
    let dead = false;
    (async () => { for (const w of cue.text.match(/[\p{L}'’]+/gu) || []) { if (dead) break; await tr(w); } })();
    return () => { dead = true; };
  }, [cue?.text]);
  const subs = cue && (
    <div className={kind === "video" && !src.startsWith("yt:") ? "subs over" : "subs"}>
      <div className="es"><Line text={cue.text} onWord={onWord} /></div>
      <EnLine text={cue.text} mode={tmode} k={key} />
    </div>
  );
  const words = Object.values(vocab).sort((a, b) => (sortBy === "az" ? a.w.localeCompare(b.w) : b.added - a.added));
  const tlist = useMemo(() => cues.map((c, i) => (
    <div key={i} id={"cue" + i} className={"cue" + (i === ai ? " now" : "") + (i === sel ? " sel" : "")}
      onClick={() => { setSel(i); if (src && !plain) seek(c.start + off); }}>
      {!plain && <span className="dim">{fmt(c.start + off)}</span>} {c.text}
      {bi && <div className="en">{enSync(c.text, tmode, key) || "…"}</div>}
    </div>
  )), [cues, ai, sel, off, plain, src, bi, tmode, key, prog?.done, dur]);
  const ready = prog && prog.done >= prog.total;

  return (
    <div className="app" onMouseUp={onSelect}>
      <style>{CSS}</style>
      <header>
        <b className="logo">Español</b>
        <label className="file">Video / MP3<input type="file" accept="video/*,audio/*" onChange={(e) => { onMedia(e.target.files[0]); e.target.value = ""; }} /></label>
        <label className="file">SRT / LRC / TXT<input type="file" accept=".srt,.lrc,.txt,.vtt" onChange={(e) => { const f = e.target.files[0]; readFile(f, (x) => attachSubs(x, f.name)); e.target.value = ""; }} /></label>
        <span className="grow" />
        <select value={tmode} onChange={(e) => setTmode(e.target.value)}>
          <option value="natural">English: natural</option>
          <option value="literal">English: literal</option>
        </select>
        <input type="password" placeholder="Anthropic API key (optional)" value={key} onChange={(e) => setKey(e.target.value)} />
      </header>

      <div className="cols">
        <main>
          {!src && !cues.length && (
            <div className="empty">
              <h1>Load something to read.</h1>
              <p className="dim">Open something from the Library tab, import files above, or paste Spanish text, SRT or LRC here.</p>
              <textarea rows={8} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Pega texto, SRT o LRC…" />
              <button className="pri" onClick={() => attachSubs(paste, "Pasted text " + new Date().toLocaleDateString())}>Load text</button>
            </div>
          )}

          {src && (
            <div ref={box} className={"stage " + kind}>
              {src.startsWith("yt:") ? <div className="yt" key={src}><div id="ytp" /></div> : kind === "video" ? (
                <video key={curId} ref={mref} src={src} onLoadedMetadata={meta}
                  onPointerDown={(e) => { drag.current = { x: e.clientX, t: m().currentTime, moved: false }; }}
                  onPointerMove={(e) => { const d = drag.current; if (!d) return; const dx = e.clientX - d.x; if (Math.abs(dx) > 6) { d.moved = true; seek(d.t + dx / 8); } }}
                  onPointerUp={() => { if (drag.current && !drag.current.moved) toggle(); drag.current = null; }}
                  onPointerLeave={() => { drag.current = null; }}
                  onWheel={(e) => m().paused && seek(m().currentTime + e.deltaY / 40)} />
              ) : (
                <audio key={curId} ref={mref} src={src} onLoadedMetadata={meta} />
              )}
              {subs}
              <div className="ctrl">
                <button onClick={toggle}>⏯</button>
                <span className="dim">{fmt(t)}</span>
                <input className="grow" type="range" min="0" max={dur || 0} step="0.1" value={t} onChange={(e) => seek(+e.target.value)} />
                <span className="dim">{fmt(dur)}</span>
                <label className="dim" title="Playback speed">🐢<input type="range" min="0.25" max="2" step="0.05" value={rate} onChange={(e) => setRate(+e.target.value)} />{rate.toFixed(2)}×</label>
                <button onClick={() => setSync(!sync)}>Sync</button>
                {kind === "video" && <button onClick={fs}>⛶</button>}
              </div>
            </div>
          )}

          {sync && (
            <div className="panel">
              <div className="row">
                <span>Subtitle offset</span>
                <input className="grow" type="range" min="-30" max="30" step="0.1" value={off} onChange={(e) => setOff(+e.target.value)} />
                <b>{off.toFixed(1)}s</b>
              </div>
              <div className="row">
                <button disabled={sel < 0} onClick={() => setOff(t - cues[sel].start)}>Snap selected line to now</button>
                <span className="dim">{sel < 0 ? "Pick a line in the transcript first." : `“${cues[sel].text.slice(0, 40)}”`}</span>
              </div>
            </div>
          )}

          {prog && cues.length > 0 && (
            <div className="panel">
              <div className="row">
                <span className="dim">{ready ? "✓ Literal and natural translations ready" : `Translating the whole file… ${prog.done}/${prog.total}`}</span>
                <span className="grow" />
                {!plain && <><button disabled={!ready} onClick={() => exportEn("literal")}>⬇ literal .srt</button><button disabled={!ready} onClick={() => exportEn("natural")}>⬇ natural .srt</button></>}
              </div>
              {!ready && <div className="bar"><i style={{ width: (prog.total ? (100 * prog.done) / prog.total : 100) + "%" }} /></div>}
            </div>
          )}

          {src && !cues.length && (
            <div className="panel">
              <b>No subtitles loaded for this video.</b>
              {current?.yt && (
                <>
                  <div className="row"><button className="pri" onClick={() => fetchYt(current)}>Fetch YouTube captions</button></div>
                  {ytMsg && <p className="dim">{ytMsg}</p>}
                  <p className="dim">Or paste the transcript (YouTube: ⋯ → Show transcript → select all → copy):</p>
                  <div className="row"><textarea className="grow" rows={4} value={tpaste} onChange={(e) => setTpaste(e.target.value)} placeholder={"0:05\nHola a todos\n0:08\n…"} /><button onClick={() => { attachSubs(tpaste, "transcript"); setTpaste(""); }}>Load</button></div>
                </>
              )}
              <p className="dim">Give the subtitle file the video's name in <code>src/media</code> (movie.mp4 + movie.srt), import one above, or pick one:</p>
              <select defaultValue="" onChange={async (e) => { const it = lib.find((x) => x.id === e.target.value); if (it) attachSubs(await getSubs(it), it.name); }}>
                <option value="" disabled>Choose a subtitle file…</option>
                {lib.filter((x) => !x.kind && (x.subs || x.subUrl)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
          )}
          {!src && cues.length > 0 && plain && (
            <div className="reader">{cues.map((c, i) => <p key={i}><Line text={c.text} onWord={onWord} /></p>)}</div>
          )}
          {src && kind === "audio" && !cue && <p className="dim">♪ Press play — lyrics follow the song.</p>}

          {sent && (
            <div className="panel">
              <div className="es">{sent.es}</div><div className="en">{sent.en}</div>
              <button onClick={() => setSent(null)}>Dismiss</button>
            </div>
          )}
        </main>

        <aside>
          {insp && <Inspector w={insp} go={setInsp} close={() => setInsp("")} v={vocab[insp]} patch={(o) => { patch(insp, o); if (!vocab[insp]?.en) tr(insp).then((x) => patch(insp, { en: x.toLowerCase() })); }} />}
          <nav>
            {[["library", "Library"], ["transcript", "Transcript"], ["words", `Words (${words.length})`], ["bank", "Bank"], ["review", "Review"], ["games", "Games"]].map(([id, label]) => (
              <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>
            ))}
          </nav>
          <div className="scroll">
            {tab === "library" && (
              <>
                {[["Video", "video"], ["Music", "audio"], ["Text", ""]].map(([label, kd]) => (
                  <div key={label}>
                    <b className="pos">{label}</b>
                    {lib.filter((it) => (it.kind || "") === kd).map((it) => (
                      <div key={it.id} className={"row vw" + (it.id === curId ? " now" : "")}>
                        <b className="link grow" onClick={() => openItem(it)}>{it.name}</b>
                        <span className="dim">{LS.get("es_prog", {})[it.id]?.pos ? fmt(LS.get("es_prog", {})[it.id].pos) : ""}</span>
                        {!it.folder && <button onClick={() => remove(it)}>✕</button>}
                      </div>
                    ))}
                    {kd === "video" && (
                      <div className="row"><input className="grow" placeholder="Paste a YouTube link…" value={ytUrl} onChange={(e) => setYtUrl(e.target.value)} /><button onClick={addYt}>Add</button></div>
                    )}
                    {kd === "" && (
                      <div className="row">
                        <textarea className="grow" rows={2} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste Spanish text, SRT or LRC…" />
                        <button onClick={() => newText(paste)}>Add</button>
                      </div>
                    )}
                  </div>
                ))}
                <p className="dim">Files in <code>src/media</code> show up here automatically. Imports are remembered.</p>
              </>
            )}
            {tab === "transcript" && (
              <>
                <div className="row"><button className={bi ? "on" : ""} onClick={() => setBi(!bi)}>English under each line</button></div>
                {tlist}
              </>
            )}
            {tab === "words" && (
              <>
                <div className="row"><button className={sortBy === "recent" ? "on" : ""} onClick={() => setSortBy("recent")}>Recent</button><button className={sortBy === "az" ? "on" : ""} onClick={() => setSortBy("az")}>A–Z</button></div>
                {!words.length && <p className="dim">Click any word in a subtitle to save it here.</p>}
                {words.map((v) => (
                  <div key={v.w} className="row vw">
                    <b className="link" onClick={() => setInsp(v.w)}>{v.w}</b><span className="dim grow">{v.en}</span>
                    <button onClick={() => setVocab(({ [v.w]: _, ...rest }) => rest)}>✕</button>
                  </div>
                ))}
              </>
            )}
            {tab === "bank" && <Bank bank={bank} vocab={vocab} onPick={setInsp} />}
            {tab === "review" && <Review vocab={vocab} setVocab={setVocab} bank={bank} />}
            {tab === "games" && <Games bank={bank} vocab={vocab} />}
          </div>
        </aside>
      </div>
    </div>
  );
}

const CSS = `
:root{--bg:#12233f;--panel:#1b3157;--ink:#f6f1e6;--dim:#9fb0cc;--gold:#f2b134;--sky:#8fd3ff}
html,body,#root{margin:0;padding:0;display:block;width:100%;max-width:none;text-align:left;background:var(--bg)}
.app{min-height:100vh;color:var(--ink);font:15px/1.5 system-ui,sans-serif;display:flex;flex-direction:column}
.app *{box-sizing:border-box}
header{display:flex;gap:10px;align-items:center;padding:10px 16px;background:var(--panel);flex-wrap:wrap}
.logo{font:700 20px Georgia,serif;color:var(--gold)}
.cols{display:flex;flex:1;min-height:0;gap:16px;padding:16px}
main{flex:2;min-width:0}
aside{flex:1;min-width:280px;max-width:420px;background:var(--panel);border-radius:8px;display:flex;flex-direction:column;height:calc(100vh - 90px);position:sticky;top:16px}
.scroll{overflow:auto;padding:12px;flex:1}
.grow{flex:1}.row{display:flex;gap:8px;align-items:center;margin:6px 0}.row.wrap{flex-wrap:wrap}
.dim{color:var(--dim)}
button,select,input,textarea{font:inherit;color:var(--ink);background:#0d1b33;border:1px solid #3a5482;border-radius:6px;padding:5px 10px}
button{cursor:pointer}button:hover,button.on{border-color:var(--gold)}
button:disabled{opacity:.4;cursor:default}
button.pri{background:var(--gold);color:#12233f;border-color:var(--gold);font-weight:600}
input[type=range]{padding:0;accent-color:var(--gold)}
input[type=file]{display:none}.file{cursor:pointer;border:1px dashed #3a5482;border-radius:6px;padding:5px 10px}
.empty textarea{width:100%;display:block;margin:12px 0}
.stage{position:relative;background:#000;border-radius:8px;overflow:hidden}
.stage.audio{background:var(--panel)}
video{display:block;width:100%;max-height:70vh;cursor:pointer;touch-action:none}
.ctrl{display:flex;gap:8px;align-items:center;padding:8px;background:#0d1b33}
.subs{padding:18px;text-align:center}
.subs.over{position:absolute;left:0;right:0;bottom:56px;background:linear-gradient(transparent,#000c);padding:24px 16px 10px}
.es{font:26px/1.5 Georgia,serif}.en{font-size:15px;color:var(--dim);margin-top:4px}
.stage.audio .es{font-size:32px}
.w{display:inline-grid;cursor:pointer;border-radius:4px;transition:background .2s}
.w>span{transition:opacity .25s;text-align:center;white-space:nowrap}
.w>span:last-child{user-select:none}
.w:hover{background:#ffffff22}
.panel,.insp{background:var(--panel);border-radius:8px;padding:12px;margin-top:12px}
.insp{margin:12px;border:1px solid var(--gold);max-height:60%;overflow:auto}
.insp h2{margin:0;font:700 26px Georgia,serif}.ipa{color:var(--sky)}.pos{color:var(--gold)}
.insp ol{margin:4px 0 8px;padding-left:20px}
.reader{font:22px/1.8 Georgia,serif;max-width:70ch}
nav{display:flex;flex-wrap:wrap;gap:6px;padding:12px 12px 0}
.row.now{background:#f2b13433;border-radius:6px;padding-left:6px}
.cue{padding:6px 8px;border-radius:6px;cursor:pointer}
.cue.now{background:#f2b13433}.cue.sel{outline:1px solid var(--gold)}
.big{font:700 40px Georgia,serif;margin:12px 0}
.vw{border-bottom:1px solid #2b4470;padding-bottom:4px}.link{cursor:pointer;color:var(--gold)}
.cloud{display:flex;flex-wrap:wrap;gap:2px 10px;align-items:baseline;line-height:1.15}.cloud span{cursor:pointer}
.pic{max-width:100%;max-height:160px;border-radius:6px;display:block;margin:6px 0}
.tile{width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;border-radius:4px;font-weight:700;text-transform:uppercase;background:#0d1b33}
.tile.g{background:#3e8e5a}.tile.y{background:#c99a2e}.tile.x{background:#2b4470}
.opt{display:block;width:100%;margin:6px 0;text-align:left}.opt.ok{background:#3e8e5a}.opt.no{background:#9a3b3b}
.yt{aspect-ratio:16/9;background:#000}.yt iframe{width:100%;height:100%;display:block;border:0}
.mp{border:1px solid #3a5482;border-radius:8px;padding:8px;margin:8px 0}
.morph{display:flex;align-items:baseline;white-space:pre;font:700 34px Georgia,serif;margin:8px 0}
.morph .pre{color:var(--dim);font-size:.6em;animation:pop .35s ease-out}
.morph .suf{color:var(--gold);display:inline-block;animation:pop .35s ease-out}
@keyframes pop{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 12px;margin-top:6px}
.gl{cursor:pointer;border-radius:4px;padding:0 6px}.gl.sel{background:#f2b13433}
.grid .morph{font-size:17px;margin:0}
.bar{height:6px;background:#0d1b33;border-radius:3px;overflow:hidden;margin-top:8px}
.bar i{display:block;height:100%;background:var(--gold);transition:width .3s}
@media(max-width:800px){.cols{flex-direction:column}aside{max-width:none;height:60vh;position:static}}
`;
