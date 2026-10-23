/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Spoken and on-screen game lines in every app language, and the browser voice that says them.
// phrase(id, vars) picks one variant at random (so praise does not repeat word for word);
// line(id, vars) always gives the first variant (for text that is drawn every frame).
// {n} etc. are filled from vars; {ducks} is the Slovak/English plural of "duck" for vars.n.
import { getSetting, LANGUAGES } from './settings.js';

const PHRASES = {
  en: {
    // ---- shared hints ----
    'hint.contact': ['Hold still. Checking the headband.'],

    // ---- Bubble Hippo ----
    'hippo.hint.sleepy': ['Reach up high like a giraffe!', 'Stretch up tall like a giraffe!', 'Big giraffe stretch! Up, up, up!'],
    'hippo.hint.muscle': ['Floppy jaw, like a hippo yawn.', 'Soft jaw. Make a big lazy hippo yawn.', 'Wobbly jelly face, please.'],
    'hippo.hint.eyes': ['Peek-a-boo! Open your eyes.', 'Wakey wakey! Eyes open.', 'Hello in there? Open your eyes.'],
    'hippo.hint.eyeMove': ['Eyes on the bubble.', 'Watch the bubble float.', 'Follow the big bubble with your eyes.'],
    'hippo.splash': ['Splash time! Count the ducks!', 'Splish splash! Count the ducks!', 'Here come the ducks! Count them!'],
    'hippo.splashMsg': ['Splash time!'],
    'hippo.howMany': ['How many ducks?', 'So, how many ducks?', 'Quack quack! How many?'],
    'hippo.bubbleTime': ['Bubble time.', 'Back to the bubbles.', 'Now, slow bubbles.'],
    'hippo.bubbleMsg': ['Bubble time!'],
    'hippo.right': ['Yes! {n} {ducks}. Now bubble time.', 'Spot on! {n} {ducks}. You are a duck detective!', 'Quack-tastic! {n} {ducks}!'],
    'hippo.wrong': ['It was {n}. Good try! Bubble time.', 'So close! It was {n}. Those ducks are sneaky.', 'It was {n}. Ducks swim fast! Good try.'],

    // ---- Turbo Rex ----
    'rex.hint.muscle': ['Freeze frame! Be a statue. Floppy face.'],
    'rex.hint.neck': ['Soft shoulders. Wiggle your jaw.', 'Drop your shoulders. Wobble your jaw.'],
    'rex.hint.eyes': ['Open your eyes! Rex needs you.', 'Eyes open! Rex cannot drive alone.'],
    'rex.hint.tilt': ['Lift me up to your eyes!', 'Up here! Hold me up to your eyes.'],
    'rex.goTap': ['Go! Tap the pizzas!', 'Pizza time! Tap them!', 'Go Rex! Tap the pizzas!'],
    'rex.goTapBanner': ['GO! TAP THE PIZZAS!'],
    'rex.go': ['Go Rex go!', 'Zoom zoom, Rex!', 'Off we roll!'],
    'rex.goBanner': ['GO, REX, GO!'],
    'rex.watchPizzas': ['Just watch the pizzas. No tapping yet.'],
    'rex.watch': ['Watch Rex roll. Sit still.', 'Watch Rex roll. Still like a statue.'],
    'rex.newBelt': ['New belt! {belt} belt!', 'Wow! The {belt} belt is yours!'],
    'rex.great': ['Great ride, Rex!', 'Dino-mite ride!', 'Rex says: roar-some!', 'What a ride! Rex is proud of you.'],
    'rex.shoulders': ['Shoulder rolls! Roll them back, slow and big.'],
    'rex.wiggle': ['Wiggle break! Shake it out!', 'Shake like a wet puppy!', 'Wiggle like spaghetti!'],
  },
  sk: {
    'hint.contact': ['Chvíľku nehybne. Kontrolujem čelenku.', 'Zamrzni ako cencúľ. Kontrolujem čelenku.'],

    'hippo.hint.sleepy': ['Natiahni sa vysoko ako žirafa!', 'Hore ruky, si žirafa!', 'Veľké žirafie natiahnutie! Hore, hore, hore!'],
    'hippo.hint.muscle': ['Uvoľni čeľusť. Zívni ako hroch.', 'Mäkučká tvár ako puding.', 'Veľké lenivé hrošie zívnutie.'],
    'hippo.hint.eyes': ['Kuk! Otvor očká.', 'Haló, je tam niekto? Otvor očká.', 'Budíček! Očká hore.'],
    'hippo.hint.eyeMove': ['Očká na bublinku.', 'Sleduj, ako bublinka pláva.', 'Pozeraj na veľkú bublinu.'],
    'hippo.splash': ['Čľup! Spočítaj kačičky!', 'Šplech, šplech! Počítaj kačičky!', 'Kačičky prichádzajú! Počítaj ich!'],
    'hippo.splashMsg': ['Čľup!'],
    'hippo.howMany': ['Koľko bolo kačičiek?', 'Tak koľko kačičiek?', 'Kvák, kvák! Koľko ich bolo?'],
    'hippo.bubbleTime': ['Čas na bublinky.', 'Späť k bublinkám.', 'A teraz pomalé bublinky.'],
    'hippo.bubbleMsg': ['Bublinky!'],
    'hippo.right': ['Áno! {n} {ducks}. A teraz bublinky.', 'Presne tak! {n} {ducks}. Si kačací detektív!', 'Kvákastické! {n} {ducks}!'],
    'hippo.wrong': ['Bolo ich {n}. Dobrý pokus!', 'Skoro! Bolo ich {n}. Kačičky sú šibalky.', 'Bolo ich {n}. Kačičky plávajú rýchlo! Nevadí.'],

    'rex.hint.muscle': ['Stop! Buď socha. Mäkučká tvár.'],
    'rex.hint.neck': ['Uvoľni plecia. Pohýb čeľusťou.', 'Pusti plecia dole. Zakývaj čeľusťou.'],
    'rex.hint.eyes': ['Otvor oči! Rex ťa potrebuje.', 'Očká hore! Rex sám nejazdí.'],
    'rex.hint.tilt': ['Zdvihni ma k očiam!', 'Tu hore! Drž ma pri očiach.'],
    'rex.goTap': ['Štart! Ťukaj na pizze!', 'Pizza čas! Ťukaj na ne!', 'Do toho, Rex! Ťukaj na pizze!'],
    'rex.goTapBanner': ['ŠTART! ŤUKAJ NA PIZZE!'],
    'rex.go': ['Do toho, Rex!', 'Fičíme, Rex!', 'Hor sa na cestu!'],
    'rex.goBanner': ['DO TOHO, REX!'],
    'rex.watchPizzas': ['Zatiaľ iba pozeraj pizze. Ešte neťukaj.'],
    'rex.watch': ['Pozeraj, ako Rex jazdí. Seď ticho.', 'Pozeraj na Rexa. Buď tichý ako socha.'],
    'rex.newBelt': ['Nový opasok! {belt} opasok!', 'Juchú! {belt} opasok je tvoj!'],
    'rex.great': ['Super jazda, Rex!', 'Dinosaurí výkon!', 'Rex hovorí: ŕŕŕ, paráda!', 'To bola jazda! Rex je na teba hrdý.'],
    'rex.shoulders': ['Krúženie ramenami! Dozadu, pomaly a veľké kruhy.'],
    'rex.wiggle': ['Prestávka na vrtenie! Vytras to zo seba!', 'Otras sa ako mokrý psík!', 'Vrť sa ako špagetka!'],
  },
};

// Turbo Rex belt names in each language (progress.js keeps the English ids)
const BELT_NAMES = {
  sk: { WHITE: 'Biely', YELLOW: 'Žltý', ORANGE: 'Oranžový', GREEN: 'Zelený', BLUE: 'Modrý', BLACK: 'Čierny' },
};
export function beltName(name, lang = getSetting('language')) {
  return BELT_NAMES[lang]?.[name] || name;
}

// "duck" for a count: Slovak has three forms (1 kačička, 2-4 kačičky, 5+ kačičiek)
function ducks(n, lang) {
  if (lang === 'sk') return n === 1 ? 'kačička' : n >= 2 && n <= 4 ? 'kačičky' : 'kačičiek';
  return n === 1 ? 'duck' : 'ducks';
}

function fill(text, vars, lang) {
  const v = { ...vars };
  if (Number.isFinite(v.n)) v.ducks = ducks(v.n, lang);
  return text.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? String(v[k]) : m));
}

function variants(id, lang) {
  return PHRASES[lang]?.[id] || PHRASES.en[id] || [id];
}

/** One random variant of a line in the current language. */
export function phrase(id, vars = {}) {
  const lang = getSetting('language');
  const list = variants(id, lang);
  return fill(list[Math.floor(Math.random() * list.length)], vars, lang);
}

/** The first (fixed) variant of a line in the current language. */
export function line(id, vars = {}) {
  const lang = getSetting('language');
  return fill(variants(id, lang)[0], vars, lang);
}

// ---------- browser voice ----------
const speechLang = () => (LANGUAGES.find((l) => l.id === getSetting('language')) || LANGUAGES[0]).speech;

/** The device voice for the current language, or null when the device has none. */
export function findVoice(lang = speechLang()) {
  try {
    const all = window.speechSynthesis?.getVoices?.() || [];
    const base = lang.slice(0, 2).toLowerCase();
    const same = all.filter((v) => (v.lang || '').replace('_', '-').toLowerCase().startsWith(base));
    return same.find((v) => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase() && v.localService)
      || same.find((v) => v.localService) || same[0] || null;
  } catch {
    return null;
  }
}

/** Say a line with the browser voice in the current language. Cuts off the line before it. */
export function speak(text, { rate = 1, pitch = 1, volume = 0.8 } = {}) {
  try {
    if (typeof window === 'undefined' || !window.speechSynthesis || !text) return;
    const clean = String(text).replace(/[^\p{L}\p{N}\s!?.,'-]/gu, '').trim(); // keeps č, š, ž, ...
    if (!clean) return;
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = speechLang();
    const voice = findVoice(u.lang);
    if (voice) u.voice = voice;
    u.rate = rate; u.pitch = pitch; u.volume = volume;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { /* voice unavailable */ }
}
