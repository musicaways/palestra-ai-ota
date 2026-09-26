// Lezioni della sezione "Impara": dati e costruzione delle timeline degli esercizi (senza DOM).
// Pensato per più strumenti: ogni lezione ha "instrument"; oggi ci sono solo quelle per chitarra.
import { buildTimeline } from './timeline.js';
import { buildArpeggio } from './arrangement.js';
import { getShape } from './music.js';

export const INSTRUMENTS = [
  { id: 'guitar', label: 'Chitarra', ready: true },
  { id: 'bass', label: 'Basso', ready: false },
  { id: 'ukulele', label: 'Ukulele', ready: false },
  { id: 'piano', label: 'Pianoforte', ready: false },
];

export const CATEGORIES = [
  { id: 'basi', label: 'Primi passi', desc: 'Accordare, impugnare, i primi accordi.' },
  { id: 'accordi', label: 'Accordi', desc: 'Aperti, settime, barrè e power chord.' },
  { id: 'ritmo', label: 'Ritmo', desc: 'Le pennate più usate, dal pop al reggae.' },
  { id: 'scale', label: 'Scale', desc: 'Pentatonica, blues, maggiore e minore: la base degli assoli.' },
  { id: 'tecniche', label: 'Tecniche', desc: 'Hammer-on, pull-off, slide, bending, vibrato, palm muting, fingerpicking.' },
  { id: 'teoria', label: 'Teoria', desc: 'Le note sul manico e come nascono gli accordi.' },
  { id: 'orecchio', label: 'Orecchio', desc: 'Riconoscere gli accordi ascoltandoli.' },
];

// Nota compatta "corda:tasto:dito[:tecnica]" (corda 0 = Mi grave … 5 = Mi cantino).
const N = (spec, beats = 1) => {
  const [s, f, finger, tech] = spec.split(':');
  return { string: Number(s), fret: Number(f), finger: Number(finger) || 0, tech: tech || undefined, beats };
};
const seq = (specs, beats = 1) => specs.trim().split(/\s+/).map((x) => N(x, beats));

// Forma di scala → note in salita e in discesa (la radice è segnata per evidenziarla sul manico).
function scaleRun(specs, roots, beats = 1) {
  const up = seq(specs, beats);
  const down = up.slice(0, -1).reverse();
  return { notes: [...up, ...down], box: up.map((n) => ({ string: n.string, fret: n.fret, root: roots.includes(`${n.string}:${n.fret}`) })) };
}

const PENTA_MIN_A = scaleRun('0:5:1 0:8:4 1:5:1 1:7:3 2:5:1 2:7:3 3:5:1 3:7:3 4:5:1 4:8:4 5:5:1 5:8:4', ['0:5', '2:7', '5:5']);
const BLUES_A = scaleRun('0:5:1 0:8:4 1:5:1 1:6:2 1:7:3 2:5:1 2:7:3 3:5:1 3:7:3 3:8:4 4:5:1 4:8:4 5:5:1 5:8:4', ['0:5', '2:7', '5:5']);
const PENTA_MAJ_G = scaleRun('0:3:2 0:5:4 1:2:1 1:5:4 2:2:1 2:5:4 3:2:1 3:4:3 4:3:2 4:5:4 5:3:2 5:5:4', ['0:3', '2:5', '5:3']);
const MAJOR_C = scaleRun('1:3:3 2:0:0 2:2:2 2:3:3 3:0:0 3:2:2 4:0:0 4:1:1', ['1:3', '4:1']);
const PENTA_MIN_A2 = scaleRun('0:8:1 0:10:3 1:7:1 1:10:4 2:7:1 2:10:4 3:7:1 3:9:3 4:8:1 4:10:3 5:8:1 5:10:3', ['1:12', '3:7']);
const MINOR_A = scaleRun('1:0:0 1:2:2 1:3:3 2:0:0 2:2:2 2:3:3 3:0:0 3:2:2', ['1:0', '3:2']);

export const LESSONS = [
  // ---------- Primi passi ----------
  {
    id: 'accordare', cat: 'basi', instrument: 'guitar', level: 1, title: 'Accordare la chitarra', tuner: true,
    summary: 'Le sei corde, dalla più grave: Mi La Re Sol Si Mi.',
    body: `<p>Prima di suonare, accorda. Le corde, dalla più grossa alla più sottile, sono <b>Mi La Re Sol Si Mi</b> (E A D G B E).</p>
      <p>Apri l'<b>accordatore</b> qui sotto, pizzica una corda alla volta e gira la chiavetta finché la lancetta si ferma al centro.
      Se la nota è più bassa (lancetta a sinistra) tendi la corda, se è più alta allentala. Con il cavo Rocksmith il segnale è pulitissimo.</p>`,
  },
  {
    id: 'primi-accordi', cat: 'basi', instrument: 'guitar', level: 1, title: 'I primi due accordi: Mi minore e Sol',
    summary: 'Em e G: due accordi aperti, un cambio facile.',
    body: `<p><b>Em</b> usa solo due dita sulle corde La e Re al 2° tasto. <b>G</b> usa tre dita. Guarda le cornici sulla corsia:
      quando toccano il manico, cambia accordo. Parti lento, conta ad alta voce 1-2-3-4.</p>`,
    exercise: { type: 'chords', chords: ['Em', 'G'], beatsPerChord: 4, bpm: 60, bars: 16, strum: 'D-D-D-D-' },
  },
  {
    id: 'giro-do', cat: 'basi', instrument: 'guitar', level: 1, title: 'Il giro di Do: C – G – Am – F',
    summary: 'Il giro più usato del pop, con una versione facile del Fa.',
    body: `<p>Quattro accordi che stanno sotto a centinaia di canzoni. Il <b>Fa</b> completo è un barrè: se è ancora difficile,
      suonalo con la parte <b>Facile</b> nei brani (solo quattro corde).</p>`,
    exercise: { type: 'chords', chords: ['C', 'G', 'Am', 'F'], beatsPerChord: 4, bpm: 64, bars: 16, strum: 'D-DU-UDU' },
  },
  {
    id: 'giro-re', cat: 'basi', instrument: 'guitar', level: 1, title: 'Tre accordi aperti: D – A – E',
    summary: 'Re, La e Mi: il rock più semplice.',
    body: '<p>Tieni il polso morbido e il pollice dietro al manico. Nei cambi, muovi insieme le dita come un blocco.</p>',
    exercise: { type: 'chords', chords: ['D', 'A', 'E', 'A'], beatsPerChord: 4, bpm: 70, bars: 16, strum: 'D-DU-UDU' },
  },
  // ---------- Accordi ----------
  {
    id: 'settime', cat: 'accordi', instrument: 'guitar', level: 2, title: 'Gli accordi di settima: A7, D7, E7, B7',
    summary: 'Il suono del blues e dei cantautori.',
    body: '<p>La settima aggiunge tensione e fa "chiamare" l\'accordo successivo. Il <b>B7</b> è la chiave di molti brani in Mi.</p>',
    exercise: { type: 'chords', chords: ['E7', 'A7', 'B7', 'E7'], beatsPerChord: 4, bpm: 70, bars: 16, strum: 'D-DU-UDU' },
  },
  {
    id: 'barre-e', cat: 'accordi', instrument: 'guitar', level: 3, title: 'Il barrè: F e Bm',
    summary: 'L\'indice schiaccia tutte le corde: la porta per ogni tonalità.',
    body: `<p>Nel barrè l'indice fa da capotasto. Tienilo vicino alla barretta, ruotalo leggermente sul lato osseo e usa
      il peso del braccio, non la forza del pollice. Prova prima a far suonare bene le corde una alla volta.</p>`,
    exercise: { type: 'chords', chords: ['C', 'F', 'G', 'Bm'], beatsPerChord: 4, bpm: 56, bars: 16, strum: 'D-D-D-D-' },
  },
  {
    id: 'power-chord', cat: 'accordi', instrument: 'guitar', level: 2, title: 'Power chord: il suono del rock',
    summary: 'Due dita, fondamentale e quinta: E5, G5, A5, C5.',
    body: '<p>Con l\'effetto <b>distorsione</b> dell\'amplificatore i power chord suonano pieni e puliti. Stoppa le corde che non servono con le dita libere.</p>',
    exercise: { type: 'chords', chords: ['E5', 'G5', 'A5', 'C5'], beatsPerChord: 4, bpm: 90, bars: 16, strum: 'DDDDDDDD', tone: 'rock' },
  },
  {
    id: 'maj7', cat: 'accordi', instrument: 'guitar', level: 2, title: 'Colori morbidi: Cmaj7, Fmaj7, Am7, Dm7',
    summary: 'Gli accordi "sognanti" di indie e bossa.',
    body: '<p>Accordi di settima maggiore e minore: meno dita, più atmosfera. Suonali arpeggiati o con pennate leggere.</p>',
    exercise: { type: 'chords', chords: ['Cmaj7', 'Am7', 'Dm7', 'Fmaj7'], beatsPerChord: 4, bpm: 66, bars: 16, strum: 'D-DU-UDU' },
  },
  // ---------- Ritmo ----------
  {
    id: 'ritmo-quarti', cat: 'ritmo', instrument: 'guitar', level: 1, title: 'Tutte giù: pennate in quarti',
    summary: 'Una pennata per battito, a tempo col click.',
    body: '<p>Una pennata verso il basso su ogni battito. Muovi il polso, non tutto il braccio. Tieni il click acceso.</p>',
    exercise: { type: 'strum', chords: ['G', 'C'], beatsPerChord: 4, bpm: 70, bars: 12, strum: 'D-D-D-D-' },
  },
  {
    id: 'ritmo-ballata', cat: 'ritmo', instrument: 'guitar', level: 1, title: 'La ballata: giù, giù-su, su-giù-su',
    summary: 'Il ritmo di mezza musica pop (D-DU-UDU).',
    body: '<p>La mano va su e giù di continuo come un pendolo, anche quando non tocca le corde: così il tempo resta regolare.</p>',
    exercise: { type: 'strum', chords: ['C', 'G', 'Am', 'F'], beatsPerChord: 4, bpm: 72, bars: 16, strum: 'D-DU-UDU' },
  },
  {
    id: 'ritmo-rock', cat: 'ritmo', instrument: 'guitar', level: 2, title: 'Rock in crome',
    summary: 'Otto pennate giù per battuta, con power chord.',
    body: '<p>Tutte giù, corte e decise. Con il <b>palm muting</b> (vedi Tecniche) diventa il suono del punk rock.</p>',
    exercise: { type: 'strum', chords: ['E5', 'A5', 'D5', 'A5'], beatsPerChord: 4, bpm: 100, bars: 16, strum: 'DDDDDDDD', tone: 'rock' },
  },
  {
    id: 'blues-12', cat: 'ritmo', instrument: 'guitar', level: 2, title: 'Il blues in 12 battute (La)',
    summary: 'A7 – D7 – E7: la struttura di mezzo rock and roll.',
    body: '<p>Quattro battute di A7, due di D7, due di A7, poi E7, D7, A7, E7 per ripartire. Conta le battute: è il "giro" che tutti i musicisti conoscono.</p>',
    exercise: { type: 'chords', chords: ['A7', 'A7', 'A7', 'A7', 'D7', 'D7', 'A7', 'A7', 'E7', 'D7', 'A7', 'E7'], beatsPerChord: 4, bpm: 90, bars: 24, strum: 'D-DUD-DU', tone: 'crunch' },
  },
  {
    id: 'boogie', cat: 'tecniche', instrument: 'guitar', level: 2, title: 'Riff boogie (shuffle)',
    summary: 'Il riff rock\'n\'roll sulle corde basse: La 5 – La 6.',
    body: '<p>Corda di La a vuoto più il 2° o il 4° tasto della corda di Re, a crome. Tieni il ritmo "saltellato" e stoppa leggermente col palmo.</p>',
    exercise: { type: 'notes', bpm: 96, context: 'A5', tone: 'crunch', notes: seq('1:0:0:pm 2:2:1 1:0:0:pm 2:2:1 1:0:0:pm 2:4:3 1:0:0:pm 2:4:3 1:0:0:pm 2:2:1 1:0:0:pm 2:2:1 1:0:0:pm 2:4:3 1:0:0:pm 2:4:3', 0.5) },
  },
  {
    id: 'ritmo-reggae', cat: 'ritmo', instrument: 'guitar', level: 2, title: 'Reggae: il levare',
    summary: 'Si suona solo sul 2 e sul 4, corto e stoppato.',
    body: '<p>Il reggae accentua i tempi deboli. Pennata corta, poi smorza subito le corde allentando la mano sinistra.</p>',
    exercise: { type: 'strum', chords: ['Am', 'D'], beatsPerChord: 4, bpm: 76, bars: 12, strum: '--X---X-' },
  },
  {
    id: 'ritmo-valzer', cat: 'ritmo', instrument: 'guitar', level: 2, title: 'In tre: il valzer',
    summary: 'Battute da 3, come in Cartine corte.',
    body: '<p>Conta 1-2-3, accento sul primo. È il tempo di molte ballate e di <b>Cartine corte</b> di Salmo.</p>',
    exercise: { type: 'strum', chords: ['G', 'Em', 'C', 'D'], beatsPerChord: 3, bpm: 90, bars: 16, strum: 'D-DUDU' },
  },
  // ---------- Scale ----------
  {
    id: 'pentatonica-minore', cat: 'scale', instrument: 'guitar', level: 2, title: 'Pentatonica minore di La (1ª posizione)',
    summary: 'La scala degli assoli rock e blues, al 5° tasto.',
    body: `<p>Cinque note che suonano bene su quasi tutto il rock. Le note <b>rosa</b> sono la radice (La).
      Dito 1 al 5° tasto, dito 3 al 7°, dito 4 all'8°. Sali e scendi a tempo, poi improvvisa sopra un brano in La minore.</p>`,
    exercise: { type: 'notes', ...PENTA_MIN_A, bpm: 70, context: 'Am', tone: 'lead' },
  },
  {
    id: 'pentatonica-2', cat: 'scale', instrument: 'guitar', level: 3, title: 'Pentatonica minore di La (2ª posizione)',
    summary: 'La forma successiva, dal 7° al 10° tasto: per uscire dalla "scatola".',
    body: '<p>Si aggancia alla prima posizione: le note all\'8° tasto sono in comune. Collegare le posizioni permette assoli su tutto il manico.</p>',
    exercise: { type: 'notes', ...PENTA_MIN_A2, bpm: 66, context: 'Am', tone: 'lead' },
  },
  {
    id: 'blues', cat: 'scale', instrument: 'guitar', level: 3, title: 'Scala blues di La',
    summary: 'La pentatonica più la "blue note".',
    body: '<p>Aggiunge una nota di passaggio (Mi♭) alla pentatonica: è il sapore del blues. Usala di passaggio, non fermarti sopra.</p>',
    exercise: { type: 'notes', ...BLUES_A, bpm: 70, context: 'A7', tone: 'crunch' },
  },
  {
    id: 'pentatonica-maggiore', cat: 'scale', instrument: 'guitar', level: 2, title: 'Pentatonica maggiore di Sol',
    summary: 'Solare, country e pop.',
    body: '<p>Stessa forma della pentatonica minore di Mi, ma con la radice su Sol. Perfetta sui brani in Sol maggiore.</p>',
    exercise: { type: 'notes', ...PENTA_MAJ_G, bpm: 70, context: 'G' },
  },
  {
    id: 'scala-maggiore', cat: 'scale', instrument: 'guitar', level: 1, title: 'Scala maggiore di Do (prima posizione)',
    summary: 'Do Re Mi Fa Sol La Si Do con le corde a vuoto.',
    body: '<p>La scala di tutta la musica occidentale. Accendi i <b>nomi delle note</b> nelle impostazioni per vederle sul manico.</p>',
    exercise: { type: 'notes', ...MAJOR_C, bpm: 60, context: 'C' },
  },
  {
    id: 'scala-minore', cat: 'scale', instrument: 'guitar', level: 1, title: 'Scala minore naturale di La',
    summary: 'La relativa minore di Do: stesse note, altro colore.',
    body: '<p>Le stesse note della scala di Do, partendo dal La: il suono diventa malinconico.</p>',
    exercise: { type: 'notes', ...MINOR_A, bpm: 60, context: 'Am' },
  },
  {
    id: 'cromatico', cat: 'scale', instrument: 'guitar', level: 1, title: 'Riscaldamento 1-2-3-4',
    summary: 'Un dito per tasto su tutte le corde.',
    body: '<p>Esercizio di agilità: dita 1-2-3-4 sui tasti 1-2-3-4 di ogni corda, poi indietro. Tieni le dita vicine alla tastiera.</p>',
    exercise: {
      type: 'notes', bpm: 60, context: 'E',
      notes: [0, 1, 2, 3, 4, 5].flatMap((s) => [1, 2, 3, 4].map((f) => N(`${s}:${f}:${f}`))),
    },
  },
  // ---------- Tecniche ----------
  {
    id: 'hammer-on', cat: 'tecniche', instrument: 'guitar', level: 2, title: 'Hammer-on',
    summary: 'La seconda nota si suona "martellando" il dito, senza pennata.',
    body: '<p>Suona il 5° tasto, poi fai cadere con decisione il dito 3 sul 7°: la nota deve suonare senza plettro.</p>',
    exercise: { type: 'notes', bpm: 70, context: 'Am', tone: 'crunch', notes: seq('3:5:1 3:7:3:h 3:5:1 3:7:3:h 4:5:1 4:8:4:h 4:5:1 4:8:4:h', 1) },
  },
  {
    id: 'pull-off', cat: 'tecniche', instrument: 'guitar', level: 2, title: 'Pull-off',
    summary: 'Il contrario dell\'hammer-on: si "strappa" la corda togliendo il dito.',
    body: '<p>Tieni entrambe le dita, suona il 7° e tira via il dito 3 verso il basso: suonerà il 5°.</p>',
    exercise: { type: 'notes', bpm: 70, context: 'Am', tone: 'crunch', notes: seq('3:7:3 3:5:1:p 3:7:3 3:5:1:p 4:8:4 4:5:1:p 4:8:4 4:5:1:p', 1) },
  },
  {
    id: 'slide', cat: 'tecniche', instrument: 'guitar', level: 2, title: 'Slide',
    summary: 'Scivolare da un tasto all\'altro senza staccare il dito.',
    body: '<p>Suona il 5° tasto e scivola fino al 7° mantenendo la pressione. Il suono deve legare le due note.</p>',
    exercise: { type: 'notes', bpm: 64, context: 'Am', tone: 'lead', notes: seq('3:5:3 3:7:3:s 3:5:3:s 2:7:3 2:9:3:s 2:7:3:s', 2) },
  },
  {
    id: 'bending', cat: 'tecniche', instrument: 'guitar', level: 3, title: 'Bending',
    summary: 'Spingere la corda per alzare la nota: il pianto della chitarra.',
    body: '<p>Sulla corda del Si all\'8° tasto spingi la corda verso l\'alto con tre dita insieme finché la nota sale di un tono (come il 10° tasto).</p>',
    exercise: { type: 'notes', bpm: 60, context: 'Am', tone: 'lead', notes: seq('4:10:3 4:8:3:b 4:10:3 4:8:3:b 3:7:3 3:7:3:b', 2) },
  },
  {
    id: 'vibrato', cat: 'tecniche', instrument: 'guitar', level: 2, title: 'Vibrato',
    summary: 'Far "cantare" una nota lunga.',
    body: '<p>Dopo aver suonato la nota, muovi la corda su e giù con piccoli movimenti regolari del polso.</p>',
    exercise: { type: 'notes', bpm: 60, context: 'Am', tone: 'lead', notes: seq('5:5:1:v 4:8:4:v 5:8:4:v 4:5:1:v', 4) },
  },
  {
    id: 'palm-muting', cat: 'tecniche', instrument: 'guitar', level: 2, title: 'Palm muting',
    summary: 'Il palmo appoggiato vicino al ponte smorza le corde.',
    body: '<p>Appoggia il lato del palmo destro sulle corde, proprio vicino al ponte. Suona crome giù: il suono diventa corto e "chug".</p>',
    exercise: { type: 'notes', bpm: 100, context: 'E5', tone: 'rock', notes: [...seq('0:0:0:pm 0:0:0:pm 0:0:0:pm 0:0:0:pm 0:0:0:pm 0:0:0:pm 1:0:0 1:2:1', 0.5), ...seq('0:0:0:pm 0:0:0:pm 0:0:0:pm 0:0:0:pm 0:3:1 0:3:1 0:5:3 0:5:3', 0.5)] },
  },
  {
    id: 'fingerpicking', cat: 'tecniche', instrument: 'guitar', level: 2, title: 'Fingerpicking: arpeggio con le dita',
    summary: 'Pollice sul basso, indice, medio e anulare sulle corde acute.',
    body: '<p>Il <b>pollice</b> suona il basso dell\'accordo, poi <b>indice, medio, anulare</b> le corde Sol, Si, Mi. La mano sinistra tiene l\'accordo intero.</p>',
    exercise: { type: 'arpeggio', chords: ['C', 'Am', 'F', 'G'], beatsPerChord: 4, bpm: 66, bars: 8 },
  },
  // ---------- Teoria ----------
  {
    id: 'note-manico', cat: 'teoria', instrument: 'guitar', level: 1, title: 'Le note sul manico',
    summary: 'Le note naturali sulla corda di Mi grave.',
    body: `<p>Fra Mi e Fa e fra Si e Do c'è un solo tasto; fra tutte le altre note ce ne sono due. Il 12° tasto è la stessa nota della corda a vuoto, un'ottava sopra.
      Le note compaiono sul manico mentre suoni.</p>`,
    exercise: { type: 'notes', bpm: 60, context: 'E', showNoteNames: true, notes: seq('0:0:0 0:1:1 0:3:3 0:5:1 0:7:3 0:8:4 0:10:1 0:12:3', 2) },
  },
  {
    id: 'accordi-teoria', cat: 'teoria', instrument: 'guitar', level: 2, title: 'Come nasce un accordo',
    summary: 'Fondamentale, terza e quinta: maggiore, minore, settima.',
    body: `<p>Un accordo maggiore è fatto da <b>fondamentale</b>, <b>terza maggiore</b> (4 semitoni sopra) e <b>quinta</b> (7 semitoni).
      Nel minore la terza scende di un semitono. La <b>settima</b> aggiunge la nota 10 semitoni sopra la fondamentale.
      Per questo Do (C E G) e La minore (A C E) condividono due note e suonano bene uno dopo l'altro.</p>
      <p>Nei brani puoi <b>trasporre</b> gli accordi: tutti si spostano dello stesso numero di semitoni e il brano cambia tonalità.</p>`,
  },
  {
    id: 'studio-brano', cat: 'teoria', instrument: 'guitar', level: 1, title: 'Come studiare un brano',
    summary: 'Sezione per sezione, lento, poi a velocità piena.',
    body: `<p>Apri un brano e usa <b>⋯ → Studio</b>: il brano viene diviso in sezioni. Ognuna parte in loop al 60% e accelera
      da sola a ogni ripetizione fino al 100%. Quando una sezione è a velocità piena viene segnata come imparata.</p>`,
    link: { href: '#/', label: 'Scegli un brano' },
  },
  // ---------- Orecchio ----------
  {
    id: 'orecchio-maggiore-minore', cat: 'orecchio', instrument: 'guitar', level: 1, title: 'Maggiore o minore?',
    summary: 'Ascolta l\'accordo e dì se è allegro (maggiore) o malinconico (minore).',
    body: '<p>La differenza sta in una sola nota, la terza. Ascolta più volte: il maggiore suona "aperto", il minore "triste".</p>',
    quiz: { kind: 'quality', options: [{ q: '', label: 'Maggiore' }, { q: 'm', label: 'Minore' }], roots: ['C', 'D', 'E', 'G', 'A'] },
  },
  {
    id: 'orecchio-settima', cat: 'orecchio', instrument: 'guitar', level: 2, title: 'Maggiore, minore o settima?',
    summary: 'Tre colori da distinguere.',
    body: '<p>La settima aggiunge una nota che "tira" verso l\'accordo successivo: il suono del blues.</p>',
    quiz: { kind: 'quality', options: [{ q: '', label: 'Maggiore' }, { q: 'm', label: 'Minore' }, { q: '7', label: 'Settima' }], roots: ['C', 'D', 'E', 'G', 'A'] },
  },
  {
    id: 'orecchio-giro-do', cat: 'orecchio', instrument: 'guitar', level: 2, title: 'Quale accordo del giro di Do?',
    summary: 'C, G, Am o F: riconoscili a orecchio.',
    body: '<p>Prima ascoltali tutti (tocca i nomi), poi indovina quello che suona l\'app. Utile per suonare le canzoni "a orecchio".</p>',
    quiz: { kind: 'chord', options: ['C', 'G', 'Am', 'F'] },
  },
  {
    id: 'orecchio-aperti', cat: 'orecchio', instrument: 'guitar', level: 3, title: 'Accordi aperti a orecchio',
    summary: 'Sei accordi: C, D, E, G, A, Em.',
    body: '<p>Più accordi, più difficile. Concentrati sul basso (la nota più grave) e sul colore.</p>',
    quiz: { kind: 'chord', options: ['C', 'D', 'E', 'G', 'A', 'Em'] },
  },
];

// Domanda del quiz: accordo da suonare e risposta giusta.
export function quizQuestion(quiz, rnd = Math.random) {
  if (quiz.kind === 'quality') {
    const opt = quiz.options[Math.floor(rnd() * quiz.options.length)];
    const root = quiz.roots[Math.floor(rnd() * quiz.roots.length)];
    return { chord: root + opt.q, answer: opt.q };
  }
  const c = quiz.options[Math.floor(rnd() * quiz.options.length)];
  return { chord: c, answer: c };
}

export const lessonById = (id) => LESSONS.find((l) => l.id === id) ?? null;

/**
 * Timeline dell'esercizio a un certo BPM. Una battuta di conteggio all'inizio.
 * chords/strum: accordi a rotazione; arpeggio: note dell'accordo; notes: note singole (tl.noteMode).
 */
export function buildLessonTimeline(ex, bpm = ex.bpm) {
  const beats = ex.beatsPerChord ?? 4;
  if (ex.type === 'chords' || ex.type === 'strum' || ex.type === 'arpeggio') {
    const bars = ex.bars ?? 16;
    const song = {
      bpm, timeSignature: [beats, 4], offset: 0, strum: ex.strum,
      sections: [{ name: 'Conteggio', bars: ['%'] }, { name: 'Esercizio', bars: Array.from({ length: bars }, (_, i) => ex.chords[i % ex.chords.length]) }],
    };
    const tl = buildTimeline(song);
    if (ex.type === 'arpeggio') tl.notes = buildArpeggio(tl, (n) => getShape(n));
    return tl;
  }
  // note singole
  const totalBeats = ex.notes.reduce((s, n) => s + n.beats, 0);
  const bars = Math.max(1, Math.ceil(totalBeats / 4));
  const song = {
    bpm, timeSignature: [4, 4], offset: 0,
    sections: [{ name: 'Conteggio', bars: ['%'] }, { name: 'Esercizio', bars: Array.from({ length: bars }, () => ex.context ?? 'C') }],
  };
  const tl = buildTimeline(song);
  const beat = 60 / bpm;
  let t = tl.bars[1]?.start ?? beat * 4;
  tl.notes = ex.notes.map((n) => {
    const out = { t, dur: n.beats * beat, string: n.string, fret: n.fret, finger: n.finger, tech: n.tech };
    t += n.beats * beat;
    return out;
  });
  tl.noteMode = true;
  tl.box = ex.box ?? uniquePositions(ex.notes);
  return tl;
}

function uniquePositions(notes) {
  const seen = new Map();
  for (const n of notes) seen.set(`${n.string}:${n.fret}`, { string: n.string, fret: n.fret });
  return [...seen.values()];
}
