export const PARTS_OF_SPEECH = [
  'Sustantivos',
  'Pronombres',
  'Verbos',
  'Adjetivos',
  'Adverbios',
  'Artículos / Determinantes',
  'Preposiciones',
  'Conjunciones',
  'Interjecciones'
];

export const DICTIONARY_DATA = {
  'hola': {
    word: 'hola',
    pos: 'Interjecciones',
    icon: 'Hand',
    translations: ['hello', 'hi'],
    examples: [
      { es: '¡Hola! ¿Cómo estás?', en: 'Hello! How are you?' }
    ]
  },
  'hablar': {
    word: 'hablar',
    pos: 'Verbos',
    icon: 'MessageSquare',
    translations: ['to speak', 'to talk'],
    root: 'habl',
    conjugations: {
      presente: { yo: 'o', tú: 'as', él: 'a', nosotros: 'amos', vosotros: 'áis', ellos: 'an' },
      pasado: { yo: 'é', tú: 'aste', él: 'ó', nosotros: 'amos', vosotros: 'asteis', ellos: 'aron' },
      futuro: { yo: 'aré', tú: 'arás', él: 'ará', nosotros: 'aremos', vosotros: 'aréis', ellos: 'arán' }
    },
    examples: [
      { es: 'Hablo español cada día.', en: 'I speak Spanish every day.' },
      { es: 'Ellos hablaron ayer.', en: 'They spoke yesterday.' }
    ]
  },
  'comer': {
    word: 'comer',
    pos: 'Verbos',
    icon: 'Utensils',
    translations: ['to eat'],
    root: 'com',
    conjugations: {
      presente: { yo: 'o', tú: 'es', él: 'e', nosotros: 'emos', vosotros: 'éis', ellos: 'en' },
      pasado: { yo: 'í', tú: 'iste', él: 'ió', nosotros: 'imos', vosotros: 'isteis', ellos: 'ieron' },
      futuro: { yo: 'eré', tú: 'erás', él: 'erá', nosotros: 'eremos', vosotros: 'eréis', ellos: 'erán' }
    },
    examples: [
      { es: 'Nosotros comemos juntos.', en: 'We eat together.' }
    ]
  },
  'canción': {
    word: 'canción',
    pos: 'Sustantivos',
    icon: 'Music',
    translations: ['song', 'track'],
    examples: [
      { es: 'Esta canción es hermosa.', en: 'This song is beautiful.' }
    ]
  },
  'rápido': {
    word: 'rápido',
    pos: 'Adverbios',
    icon: 'Zap',
    translations: ['quickly', 'fast'],
    examples: [
      { es: 'El coche va muy rápido.', en: 'The car goes very fast.' }
    ]
  },
  'amigo': {
    word: 'amigo',
    pos: 'Sustantivos',
    icon: 'Users',
    translations: ['friend'],
    examples: [
      { es: 'Juan es un buen amigo.', en: 'Juan is a good friend.' }
    ]
  },
  'grande': {
    word: 'grande',
    pos: 'Adjetivos',
    icon: 'Maximize',
    translations: ['big', 'large', 'great'],
    examples: [
      { es: 'Una casa muy grande.', en: 'A very big house.' }
    ]
  }
};

export const IDIOMS_DATA = [
  { idiom: 'Estar en las nubes', translation: 'To be daydreaming', literal: 'To be in the clouds' },
  { idiom: 'Tomar el pelo', translation: 'To pull someone\'s leg', literal: 'To take the hair' },
  { idiom: 'Ser pan comido', translation: 'To be a piece of cake', literal: 'To be eaten bread' },
  { idiom: 'Meter la pata', translation: 'To put one\'s foot in it', literal: 'To stick the paw in' },
  { idiom: 'Tener un ojo de la cara', translation: 'To cost an arm and a leg', literal: 'To have an eye of the face' }
];

export const INITIAL_LIBRARY = [
  {
    id: '1',
    type: 'music',
    title: 'De Música Ligera - Soda Stereo',
    sourceUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    lyrics: [
      { start: 0, end: 5, es: 'Ella durmió al calor de las masas', gramEn: 'She slept at warmth of the masses', ctxEn: 'She slept warmed by the crowd' },
      { start: 5, end: 10, es: 'Y yo desperté queriendo soñarla', gramEn: 'And I woke up wanting to dream her', ctxEn: 'And I woke wanting to dream of her' },
      { start: 10, end: 15, es: 'Algún tiempo atrás pensé en escribirle', gramEn: 'Some time ago I thought in writing her', ctxEn: 'A while back I thought about writing to her' },
      { start: 15, end: 22, es: 'De música ligera no nos queda más', gramEn: 'Of light music not to us remains more', ctxEn: 'Nothing is left for us but light music' }
    ]
  },
  {
    id: '2',
    type: 'video',
    title: 'Viaje por España - Subtitled Guide',
    sourceUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    subtitles: [
      { start: 0, end: 4, es: 'Bienvenidos a este increíble viaje por la ciudad.', gramEn: 'Welcomes to this incredible trip through the city.', ctxEn: 'Welcome to this amazing city tour.' },
      { start: 4, end: 8, es: 'Aquí podemos hablar con los residentes locales.', gramEn: 'Here we can to speak with the residents local.', ctxEn: 'Here we can chat with the local residents.' },
      { start: 8, end: 14, es: 'Vamos a comer algo de comida tradicional española.', gramEn: 'We go to eat something of food traditional Spanish.', ctxEn: 'Let\'s grab some traditional Spanish food.' }
    ]
  },
  {
    id: '3',
    type: 'text',
    title: 'El Principito - Capítulo 1',
    content: 'Pido perdón a los niños por haber dedicado este libro a una persona grande. Tengo una seria razón para ello: esta persona grande es el mejor amigo que tengo en el mundo.',
    parallelEn: 'I ask pardon to the children for having dedicated this book to a person big. I have a serious reason for it: this person big is the best friend that I have in the world.',
    naturalEn: 'I ask children for forgiveness for dedicating this book to a grown-up. I have a serious reason for this: this grown-up is the best friend I have in the world.'
  }
];

export function lookupWord(rawWord) {
  const clean = rawWord.toLowerCase().replace(/[^a-záéíóúñ]/g, '');
  if (DICTIONARY_DATA[clean]) {
    return DICTIONARY_DATA[clean];
  }
  return {
    word: clean || rawWord,
    pos: 'Sustantivos',
    icon: 'HelpCircle',
    translations: [`[AI Translated: ${clean || rawWord}]`],
    examples: [{ es: `Ejemplo con ${clean}`, en: `Example with ${clean}` }]
  };
}