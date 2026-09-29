// Spanish conjugation: regular verbs + common irregulars and stem changers (indicative tenses).
export const PERSONS = ['yo', 'tú', 'él/ella', 'nosotros', 'vosotros', 'ellos/ellas']
export const TENSES = { pres: 'Presente', pret: 'Pretérito', imp: 'Imperfecto', fut: 'Futuro', cond: 'Condicional' }
const END = {
  pres: { ar: ['o', 'as', 'a', 'amos', 'áis', 'an'], er: ['o', 'es', 'e', 'emos', 'éis', 'en'], ir: ['o', 'es', 'e', 'imos', 'ís', 'en'] },
  pret: { ar: ['é', 'aste', 'ó', 'amos', 'asteis', 'aron'], er: ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'], ir: ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'] },
  imp: { ar: ['aba', 'abas', 'aba', 'ábamos', 'abais', 'aban'], er: ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'], ir: ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'] },
  fut: ['é', 'ás', 'á', 'emos', 'éis', 'án'],
  cond: ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían']
}
const L = s => s.split(' ')
const IRR = {
  ser: { pres: L('soy eres es somos sois son'), pret: L('fui fuiste fue fuimos fuisteis fueron'), imp: L('era eras era éramos erais eran') },
  estar: { pres: L('estoy estás está estamos estáis están'), pret: L('estuve estuviste estuvo estuvimos estuvisteis estuvieron') },
  ir: { pres: L('voy vas va vamos vais van'), pret: L('fui fuiste fue fuimos fuisteis fueron'), imp: L('iba ibas iba íbamos ibais iban') },
  tener: { pres: L('tengo tienes tiene tenemos tenéis tienen'), pret: L('tuve tuviste tuvo tuvimos tuvisteis tuvieron') },
  haber: { pres: L('he has ha hemos habéis han'), pret: L('hube hubiste hubo hubimos hubisteis hubieron') },
  hacer: { pres: L('hago haces hace hacemos hacéis hacen'), pret: L('hice hiciste hizo hicimos hicisteis hicieron') },
  poder: { pres: L('puedo puedes puede podemos podéis pueden'), pret: L('pude pudiste pudo pudimos pudisteis pudieron') },
  querer: { pres: L('quiero quieres quiere queremos queréis quieren'), pret: L('quise quisiste quiso quisimos quisisteis quisieron') },
  decir: { pres: L('digo dices dice decimos decís dicen'), pret: L('dije dijiste dijo dijimos dijisteis dijeron') },
  ver: { pres: L('veo ves ve vemos veis ven'), pret: L('vi viste vio vimos visteis vieron'), imp: L('veía veías veía veíamos veíais veían') },
  dar: { pres: L('doy das da damos dais dan'), pret: L('di diste dio dimos disteis dieron') },
  saber: { pres: L('sé sabes sabe sabemos sabéis saben'), pret: L('supe supiste supo supimos supisteis supieron') },
  venir: { pres: L('vengo vienes viene venimos venís vienen'), pret: L('vine viniste vino vinimos vinisteis vinieron') }
}
const FUT = { tener: 'tendr', poder: 'podr', hacer: 'har', decir: 'dir', querer: 'querr', saber: 'sabr', venir: 'vendr', haber: 'habr' }
const STEM = { pensar: ['e', 'ie'], empezar: ['e', 'ie'], entender: ['e', 'ie'], preferir: ['e', 'ie'], sentir: ['e', 'ie'], cerrar: ['e', 'ie'], perder: ['e', 'ie'], dormir: ['o', 'ue'], volver: ['o', 'ue'], encontrar: ['o', 'ue'], contar: ['o', 'ue'], recordar: ['o', 'ue'], mostrar: ['o', 'ue'], costar: ['o', 'ue'], pedir: ['e', 'i'], seguir: ['e', 'i'] }
export const isVerb = w => /(ar|er|ir|ír)$/.test(w) && w.length > 3
export function conj(inf, tense, p) {
  inf = inf.toLowerCase()
  if (IRR[inf]?.[tense]) return IRR[inf][tense][p]
  const type = inf.slice(-2).replace('ír', 'ir')
  const stem = inf.slice(0, -2)
  if (tense === 'fut' || tense === 'cond') return (FUT[inf] || inf) + END[tense][p]
  let s = stem
  if (tense === 'pres' && STEM[inf] && [0, 1, 2, 5].includes(p)) {
    const [a, b] = STEM[inf]
    const i = s.lastIndexOf(a)
    if (i >= 0) s = s.slice(0, i) + b + s.slice(i + a.length)
  }
  if (tense === 'pret' && STEM[inf] && type === 'ir' && (p === 2 || p === 5)) {
    const [a, b] = STEM[inf]
    const i = s.lastIndexOf(a)
    const alt = a === 'e' ? 'i' : a === 'o' ? 'u' : b
    if (i >= 0) s = s.slice(0, i) + alt + s.slice(i + a.length)
  }
  if (tense === 'pres' && p === 0 && inf === 'conocer') s = 'conozc'
  return s + END[tense][type][p]
}
