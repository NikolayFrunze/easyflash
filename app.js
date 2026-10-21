// EasyFlash: Spanish flashcards with a Bulgarian interface. Data lives in localStorage.
const STORE_KEY = 'asiflash.v1'; // keeps the old app name so words saved before the rename still load
const DAY = 86400000;
const INTERVALS = [1, 2, 4, 8, 16, 32]; // days per box
const PALETTE = [
  { c: '#e8553d', soft: '#fde8e3', icon: '👋' },
  { c: '#2f6fed', soft: '#e3ecfd', icon: '✈️' },
  { c: '#1f9d6b', soft: '#dff4ea', icon: '🍎' },
  { c: '#b8860b', soft: '#fbf0d3', icon: '🏠' },
  { c: '#9b4fd1', soft: '#f0e3fa', icon: '💬' },
  { c: '#0f9fb5', soft: '#dff3f7', icon: '🎒' },
];

const seedWords = [
  ['Buenos días', 'Добро утро', '“Buenos días, ¿cómo estás?”', 'Основни'],
  ['Gracias', 'Благодаря', '“Muchas gracias por tu ayuda.”', 'Основни'],
  ['Por favor', 'Моля', '“Un café, por favor.”', 'Основни'],
  ['Hasta luego', 'До скоро', '“Hasta luego, amigo.”', 'Основни'],
  ['El agua', 'Водата', '“Quiero un vaso de agua.”', 'Храна'],
  ['El pan', 'Хлябът', '“El pan está fresco.”', 'Храна'],
  ['La manzana', 'Ябълката', '“Me gusta la manzana roja.”', 'Храна'],
  ['El queso', 'Сиренето', '“Quiero queso con pan.”', 'Храна'],
  ['¿Dónde está?', 'Къде е?', '“¿Dónde está el baño?”', 'Пътуване'],
  ['La estación', 'Гарата', '“La estación está cerca.”', 'Пътуване'],
  ['El billete', 'Билетът', '“Un billete a Madrid, por favor.”', 'Пътуване'],
  ['El aeropuerto', 'Летището', '“Llegamos al aeropuerto.”', 'Пътуване'],
];

// ---------- State ----------
// crypto.randomUUID only exists in secure contexts (https or localhost), not on http://<ip> over Wi-Fi
const uid = () => crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && Array.isArray(s.words)) {
      // Bulgarian became the default side: move anyone who never picked one themselves
      if (!s.sideChosen) s.side = 'bg';
      s.mode = s.mode || 'flip';
      s.deleted = s.deleted || {};
      s.words.forEach((w) => { w.updated = w.updated || 0; });
      return s;
    }
  } catch {}
  return {
    words: seedWords.map(([es, bg, ex, topic]) => newWord(es, bg, ex, topic, 0)), // 0: never beats a real edit made elsewhere
    side: 'bg',
    mode: 'flip',
    days: {},
    deleted: {}, // wordKey -> when it was deleted, so a sync doesn't bring it back
  };
}
function newWord(es, bg, ex, topic, updated = Date.now()) {
  return { id: uid(), es, bg, ex, topic, box: 0, due: 0, updated };
}
const wordKey = (es, bg) => `${es.toLowerCase()}\t${bg.toLowerCase()}`;
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
  scheduleFileWrite();
  scheduleSync();
}
const state = load();

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const dayKey = (t = Date.now()) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const intervalDays = (box) => INTERVALS[Math.min(Math.max(box, 0), INTERVALS.length - 1)];
const fmtDays = (d) => (d < 30 ? plural(d, 'ден', 'дни') : plural(Math.round(d / 30), 'месец', 'месеца'));
const topics = () => [...new Set(state.words.map((w) => w.topic))];
const style = (topic) => PALETTE[topics().indexOf(topic) % PALETTE.length];
const isDue = (w) => w.due <= Date.now();
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- Views ----------
function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.view === name));
  if (name === 'study' && !session.active) startStudy(session.topic);
  if (name === 'stats') renderStats();
  window.scrollTo(0, 0);
}

// ---------- Decks ----------
function renderDecks() {
  const total = state.words.length;
  const mastered = state.words.filter((w) => w.box >= 3).length;
  $('s-due').textContent = state.words.filter(isDue).length;
  $('s-words').textContent = total;
  $('s-mastered').textContent = `${total ? Math.round((mastered / total) * 100) : 0}%`;

  const grid = $('deck-grid');
  grid.replaceChildren();
  topics().forEach((topic) => {
    const ws = state.words.filter((w) => w.topic === topic);
    const due = ws.filter(isDue).length;
    const pct = Math.round((ws.filter((w) => w.box >= 3).length / ws.length) * 100);
    const s = style(topic);

    const d = el('article', 'deck');
    d.style.setProperty('--c', s.c);
    d.style.setProperty('--c-soft', s.soft);
    const top = el('div', 'deck-top');
    top.append(el('span', 'flag', s.icon), el('span', 'due', `${due} за преговор`));
    const bar = el('div', 'bar');
    const fill = el('i');
    fill.style.width = `${pct}%`;
    bar.append(fill);
    const foot = el('div', 'deck-foot');
    const btn = el('button', 'btn small', 'Учи');
    btn.addEventListener('click', () => { startStudy(topic); showView('study'); });
    foot.append(el('span', null, `${pct}% научени`), btn);
    d.append(top, el('h3', null, topic), el('p', null, plural(ws.length, 'дума', 'думи')), bar, foot);
    grid.append(d);
  });

  const add = el('button', 'deck deck-new');
  add.append(el('span', null, '+'), 'Добави дума');
  add.addEventListener('click', () => showView('words'));
  grid.append(add);

  $('streak-text').textContent = `${plural(streak(), 'ден', 'дни')} поред`;
}

function streak() {
  let n = 0;
  let t = Date.now();
  if (!state.days[dayKey(t)]) t -= DAY; // today not studied yet: count from yesterday
  while (state.days[dayKey(t)]) { n++; t -= DAY; }
  return n;
}

// ---------- Study ----------
const session = { active: false, topic: 'all', queue: [], done: 0, total: 0, current: null, frontSide: 'es' };
const card = $('card');
const rate = $('rate');

function startStudy(topic, practice = false) {
  session.topic = topic;
  let pool = state.words.filter((w) => topic === 'all' || w.topic === topic);
  if (!practice) pool = pool.filter(isDue);
  session.queue = shuffle(pool.map((w) => w.id));
  session.total = session.queue.length;
  session.done = 0;
  session.active = true;
  $('study-topic').textContent = `🇪🇸 ${topic === 'all' ? 'Всички теми' : topic}`;
  nextCard();
}

function nextCard() {
  const wasFlipped = card.classList.contains('flipped');
  card.classList.remove('flipped');
  rate.classList.remove('ready');
  $('feedback').hidden = true;
  const id = session.queue[0];
  session.current = state.words.find((w) => w.id === id) || null;
  if (!session.current) return showDone();
  $('study-play').hidden = false;
  $('study-empty').hidden = true;
  $('counter').hidden = false;
  // wait until the old card is face-down so the new answer doesn't flash during the flip
  if (wasFlipped) setTimeout(renderCard, 250);
  else renderCard();
}

function renderCard() {
  const w = session.current;
  if (!w) return;
  const side = state.side === 'mix' ? (Math.random() < 0.5 ? 'es' : 'bg') : state.side;
  session.frontSide = side;
  const back = side === 'es' ? 'bg' : 'es';
  const label = { es: 'Испански', bg: 'Български' };
  $('front-tag').textContent = label[side];
  $('back-tag').textContent = label[back];
  $('front-word').textContent = w[side];
  $('back-word').textContent = w[back];
  // the example sentence is Spanish, so show it on whichever face holds the Spanish word
  $('front-example').textContent = side === 'es' ? w.ex : '';
  $('back-example').textContent = back === 'es' ? w.ex : '';
  $('hint').textContent = state.mode === 'type' ? 'Напиши отговора по-долу' : 'Натисни или използвай интервал, за да обърнеш';
  const ans = $('answer');
  ans.value = '';
  ans.lang = back;
  ans.placeholder = `Напиши на ${back === 'es' ? 'испански' : 'български'}…`;
  updateTypeBox();
  $('idx').textContent = Math.min(session.done + 1, session.total);
  $('total').textContent = session.total;
  $('progress-fill').style.width = `${(session.done / Math.max(session.total, 1)) * 100}%`;
  ['again', 'hard', 'good', 'easy'].forEach((g) => {
    rate.querySelector(`[data-grade="${g}"] span`).textContent = gradeLabel(w, g);
  });
}

function gradeResult(w, grade) {
  if (grade === 'again') return { box: 0, days: 0 };
  if (grade === 'hard') return { box: w.box, days: intervalDays(w.box) };
  const box = w.box + (grade === 'good' ? 1 : 2);
  return { box, days: intervalDays(box) };
}
const gradeLabel = (w, g) => (g === 'again' ? 'сега' : fmtDays(gradeResult(w, g).days));

function grade(g) {
  const w = session.current;
  if (!w) return;
  const r = gradeResult(w, g);
  w.box = r.box;
  w.due = g === 'again' ? Date.now() : Date.now() + r.days * DAY;
  w.updated = Date.now();
  state.days[dayKey()] = (state.days[dayKey()] || 0) + 1;
  session.queue.shift();
  if (g === 'again') session.queue.push(w.id); // see it again before the session ends
  else session.done++;
  save();
  renderDecks();
  nextCard();
}

function showDone() {
  session.active = false;
  $('study-play').hidden = true;
  $('study-empty').hidden = false;
  $('counter').hidden = true;
  const had = session.total > 0;
  $('empty-icon').textContent = had ? '🎉' : '✅';
  $('empty-title').textContent = had ? 'Браво! Сесията приключи' : 'Няма карти за преговор';
  $('empty-text').textContent = had
    ? `Преговори ${plural(session.total, 'дума', 'думи')}. Върни се по-късно за следващите.`
    : state.words.some((w) => session.topic === 'all' || w.topic === session.topic)
      ? 'Всичко е научено за днес. Можеш да упражняваш и без график.'
      : 'Тук още няма думи. Добави първата!';
}

function flip() {
  if (!session.current) return;
  if (state.mode === 'type' && !card.classList.contains('flipped')) return; // must answer or give up first
  card.classList.toggle('flipped');
  rate.classList.toggle('ready', card.classList.contains('flipped'));
  updateTypeBox();
}

// ---------- Typing mode ----------
function updateTypeBox() {
  const show = state.mode === 'type' && !!session.current && !card.classList.contains('flipped');
  $('type-box').hidden = !show;
  if (show && $('view-study').classList.contains('active')) $('answer').focus({ preventScroll: true });
}

// Case, spacing and punctuation never count as mistakes
const norm = (s) => s.toLowerCase().normalize('NFC').replace(/[¿?¡!.,;:“”"'«»]/g, '').replace(/\s+/g, ' ').trim();
// Spanish only: accent-insensitive comparison (never for Bulgarian, where й is и + a combining mark)
const noAccents = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function showAnswer(kind, msg) {
  const f = $('feedback');
  f.className = `feedback ${kind}`;
  f.textContent = msg;
  f.hidden = false;
  card.classList.add('flipped');
  rate.classList.add('ready');
  updateTypeBox();
  document.activeElement.blur();
}

$('type-box').addEventListener('submit', (e) => {
  e.preventDefault();
  const w = session.current;
  if (!w) return;
  const target = session.frontSide === 'es' ? 'bg' : 'es';
  const given = norm($('answer').value);
  const right = norm(w[target]);
  if (given === right) return showAnswer('ok', '✓ Вярно!');
  if (target === 'es' && noAccents(given) === noAccents(right)) {
    return showAnswer('ok', `✓ Вярно, но внимавай с ударенията: ${w.es}`);
  }
  showAnswer('bad', `✗ Не точно. Правилният отговор е: ${w[target]}`);
});
$('reveal').addEventListener('click', () => showAnswer('info', 'Отговорът е показан. Оцени как се справи.'));

// ---------- Words ----------
function renderWords() {
  const q = $('search').value.trim().toLowerCase();
  const list = $('word-list');
  list.replaceChildren();
  const shown = state.words.filter((w) => !q || `${w.es} ${w.bg}`.toLowerCase().includes(q));
  $('word-count').textContent = state.words.length;

  $('topic-list').replaceChildren(...topics().map((t) => { const o = el('option'); o.value = t; return o; }));

  if (!shown.length) {
    list.append(el('li', 'no-words', q ? 'Няма намерени думи.' : 'Още няма думи.'));
    return;
  }
  [...shown].reverse().forEach((w) => {
    const s = style(w.topic);
    const li = el('li', 'word-item');
    const chip = el('span', 'chip', w.topic);
    chip.style.setProperty('--c', s.c);
    chip.style.setProperty('--c-soft', s.soft);
    const del = el('button', 'del', '×');
    del.title = 'Изтрий';
    del.setAttribute('aria-label', `Изтрий ${w.es}`);
    del.addEventListener('click', () => removeWord(w.id));
    li.append(el('span', 'es', w.es), el('span', 'bg', w.bg), chip, del);
    if (w.ex) li.append(el('span', 'ex', w.ex));
    list.append(li);
  });
}

function removeWord(id) {
  const gone = state.words.find((w) => w.id === id);
  if (gone) state.deleted[wordKey(gone.es, gone.bg)] = Date.now();
  state.words = state.words.filter((w) => w.id !== id);
  session.queue = session.queue.filter((q) => q !== id);
  save();
  renderAll();
}

$('add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const es = $('f-es').value.trim();
  const bg = $('f-bg').value.trim();
  const ex = $('f-ex').value.trim();
  const topic = $('f-topic').value.trim() || 'Основни';
  if (!es || !bg) return;
  if (state.words.some((w) => w.es.toLowerCase() === es.toLowerCase() && w.bg.toLowerCase() === bg.toLowerCase())) {
    return toast('Тази дума вече я има');
  }
  state.words.push(newWord(es, bg, ex, topic));
  delete state.deleted[wordKey(es, bg)];
  save();
  e.target.reset();
  $('f-topic').value = topic; // adding several words to one topic is the common case
  $('f-es').focus();
  renderAll();
  toast(`„${es}“ е добавена`);
});
$('search').addEventListener('input', renderWords);

// ---------- CSV export / import ----------
// One row per record, columns: type,key,value,example,topic,level,next_review,updated
//   word:    key = Spanish, value = Bulgarian
//   day:     key = date, value = cards reviewed that day
//   setting: key = name, value = setting value
//   deleted: key = Spanish, value = Bulgarian, updated = when it was deleted
// "updated" is the time of the last change, so when two copies disagree the newer one wins.
const CSV_HEAD = ['type', 'key', 'value', 'example', 'topic', 'level', 'next_review', 'updated'];

function serialize() {
  const cell = (v) => {
    const t = String(v ?? '');
    return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const rows = [
    CSV_HEAD,
    ...state.words.map((w) => ['word', w.es, w.bg, w.ex, w.topic, w.box, w.due, w.updated]),
    ...Object.entries(state.deleted).map(([k, ts]) => ['deleted', ...k.split('\t'), '', '', '', '', ts]),
    ...Object.entries(state.days).map(([d, n]) => ['day', d, n]),
    ['setting', 'side', state.side],
    ['setting', 'mode', state.mode],
  ];
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'; // BOM so Excel reads UTF-8
}

// Browsers download via a link; inside the iOS app (WKWebView) that does nothing, so use the native share sheet.
const native = !!window.Capacitor?.isNativePlatform?.();
async function saveFile(name, text, mime) {
  if (native) {
    const { Filesystem, Share } = window.Capacitor.Plugins;
    try {
      const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
      await Share.share({ title: name, url: uri, dialogTitle: 'Запази файла' });
      return true;
    } catch (err) {
      if (!/cancel/i.test(String(err?.message || err))) toast('Неуспешно запазване на файла');
      return false;
    }
  }
  const a = el('a');
  a.href = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
  return true;
}

async function exportCsv() {
  const ok = await saveFile(`easyflash-dumi-${new Date().toISOString().slice(0, 10)}.csv`, serialize(), 'text/csv');
  if (ok) toast(`Запазени са ${plural(state.words.length, 'дума', 'думи')}`);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

function csvEntries(rows) {
  return rows
    .filter((r) => r[0].trim().toLowerCase() !== 'type') // header
    .map(([type = '', key = '', value = '', ex = '', topic = '', box = '', due = '', updated = '']) => (
      { type: type.trim().toLowerCase(), key: key.trim(), value: value.trim(), ex: ex.trim(), topic: topic.trim(), box, due, updated }
    ));
}

// Older .txt backups: "spanish | bulgarian | example | topic | level | due" plus "@day" / "@setting" lines
function legacyEntries(text) {
  const out = [];
  text.split(/\r?\n/).forEach((line) => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const p = line.split('|').map((x) => x.trim());
    if (line.startsWith('@')) out.push({ type: p[0].slice(1), key: p[1], value: p[2] });
    else out.push({ type: 'word', key: p[0], value: p[1], ex: p[2], topic: p[3], box: p[4], due: p[5] });
  });
  return out;
}

const num = (v) => (v !== '' && v != null && Number.isFinite(+v) ? +v : null);

// Merges a backup into the app: for each word the most recently changed copy wins, deletions included.
// Review counts per day keep the larger number. Side and mode only apply if this browser never chose them.
function mergeText(text) {
  const entries = /^type\s*,/i.test(text.trimStart()) ? csvEntries(parseCsv(text)) : legacyEntries(text);
  const r = { added: 0, updated: 0, removed: 0, skipped: 0 };
  for (const e of entries) {
    if (e.type === 'day') {
      if (e.key && num(e.value) !== null) state.days[e.key] = Math.max(state.days[e.key] || 0, +e.value);
    } else if (e.type === 'setting') {
      if (e.key === 'side' && !state.sideChosen && ['es', 'bg', 'mix'].includes(e.value)) state.side = e.value;
      if (e.key === 'mode' && !state.modeChosen && ['flip', 'type'].includes(e.value)) state.mode = e.value;
    } else if (e.type === 'deleted') {
      if (!e.key || !e.value) continue;
      const k = wordKey(e.key, e.value);
      const ts = num(e.updated) ?? 0;
      const w = state.words.find((x) => wordKey(x.es, x.bg) === k);
      if (w && w.updated >= ts) continue; // edited after the deletion: keep it
      if (w) { state.words = state.words.filter((x) => x !== w); r.removed++; }
      state.deleted[k] = Math.max(state.deleted[k] || 0, ts);
    } else if (e.type === 'word') {
      if (!e.key || !e.value) { r.skipped++; continue; }
      const k = wordKey(e.key, e.value);
      const fu = num(e.updated) ?? 0; // legacy rows have none, so only higher progress beats what's here
      const fb = num(e.box);
      const same = state.words.find((x) => wordKey(x.es, x.bg) === k);
      if (!same) {
        if (k in state.deleted && state.deleted[k] >= fu) { r.skipped++; continue; }
        const w = newWord(e.key, e.value, e.ex || '', e.topic || 'Основни', fu);
        if (fb !== null) w.box = Math.max(0, Math.floor(fb));
        if (num(e.due) !== null) w.due = +e.due;
        state.words.push(w);
        delete state.deleted[k];
        r.added++;
      } else if (fu > same.updated || (fu === same.updated && fb !== null && fb > same.box)) {
        if (fb !== null) same.box = Math.max(0, Math.floor(fb));
        if (num(e.due) !== null) same.due = +e.due;
        if (e.ex) same.ex = e.ex;
        if (e.topic) same.topic = e.topic;
        same.updated = fu;
        r.updated++;
      } else r.skipped++;
    }
  }
  session.queue = session.queue.filter((id) => state.words.some((w) => w.id === id));
  return r;
}

async function importFile(file) {
  const { added, updated, removed, skipped } = mergeText(await file.text());
  save();
  renderAll();
  toast([`Добавени: ${added}`, updated && `обновени: ${updated}`, removed && `изтрити: ${removed}`, skipped && `пропуснати: ${skipped}`]
    .filter(Boolean).join(', '));
}

// ---------- Auto-save to a linked .csv file (File System Access API, Chromium only) ----------
let fileHandle = null;
let fileState = 'none'; // none | ok | needs | error
let writeTimer;
let writePending = false;
let serverMode = false; // true when served by server.py, which writes data/easyflash.csv itself
const SERVER_FILE = 'data/easyflash.csv';
const canLink = 'showSaveFilePicker' in window;
const PERM = { mode: 'readwrite' };

// The handle can't go in localStorage; IndexedDB can store it directly.
function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('asiflash', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbGet(key) {
  const db = await idb();
  return new Promise((resolve) => {
    const q = db.transaction('kv').objectStore('kv').get(key);
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => resolve(undefined);
  });
}
async function idbSet(key, val) {
  const db = await idb();
  return new Promise((resolve) => {
    const tx = db.transaction('kv', 'readwrite');
    if (val === undefined) tx.objectStore('kv').delete(key);
    else tx.objectStore('kv').put(val, key);
    tx.oncomplete = resolve;
    tx.onerror = resolve;
  });
}

function setFileState(next) {
  fileState = next;
  $('file-status').className = `file-status ${next}`;
  const name = serverMode ? SERVER_FILE : fileHandle ? fileHandle.name : '';
  $('file-status-text').textContent = {
    none: 'Автоматичното запазване във файл е изключено. Свържи .csv файл и всяка промяна ще се записва в него.',
    ok: `✓ Автоматично запазване във файла: ${name}`,
    needs: `Chrome иска потвърждение, за да продължи запазването във ${name}.`,
    error: serverMode
      ? `Не успях да запиша във ${name}. Провери дали server.py още работи.`
      : `Не успях да запиша във ${name}. Опитай да свържеш файла отново.`,
  }[next];
  $('link-btn').textContent = next === 'needs' ? 'Поднови достъпа' : next === 'ok' ? 'Смени файла' : '🔗 Свържи файл';
  $('unlink-btn').hidden = !fileHandle || serverMode;
  $('link-btn').hidden = serverMode;
}

function scheduleFileWrite() {
  if ((!fileHandle && !serverMode) || fileState === 'needs') return;
  writePending = true;
  clearTimeout(writeTimer);
  writeTimer = setTimeout(writeFile, 400); // batch bursts of changes into one write
}

async function writeFile() {
  if (serverMode) {
    writePending = false;
    try {
      const r = await fetch('api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'X-EasyFlash': '1' },
        body: serialize(),
        keepalive: true, // lets the last write finish while the tab is closing
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      if (fileState !== 'ok') setFileState('ok');
    } catch (err) {
      console.error('EasyFlash: server write failed', err);
      setFileState('error');
    }
    return;
  }
  if (!fileHandle) return;
  writePending = false;
  try {
    if ((await fileHandle.queryPermission(PERM)) !== 'granted') return setFileState('needs');
    const w = await fileHandle.createWritable();
    await w.write(serialize());
    await w.close();
    if (fileState !== 'ok') setFileState('ok');
  } catch (err) {
    console.error('EasyFlash: file write failed', err);
    setFileState('error');
  }
}

// The app stays the source of truth; words added to the file by hand are merged in first.
async function syncWithFile(serverText) {
  try {
    const text = serverText ?? await (await fileHandle.getFile()).text();
    const { added } = mergeText(text);
    renderAll();
    if (added) toast(`От файла са добавени ${plural(added, 'дума', 'думи')}`);
  } catch (err) {
    console.error('EasyFlash: file read failed', err);
  }
  save();
  await writeFile();
}

async function linkFile() {
  if (fileHandle && fileState === 'needs') {
    try {
      if ((await fileHandle.requestPermission(PERM)) !== 'granted') return;
    } catch { return; }
    return syncWithFile();
  }
  try {
    fileHandle = await showSaveFilePicker({
      suggestedName: 'easyflash-dumi.csv',
      types: [{ description: 'CSV файл', accept: { 'text/csv': ['.csv'], 'text/plain': ['.txt'] } }],
    });
  } catch (err) {
    if (err.name !== 'AbortError') console.error(err);
    return; // user cancelled the picker
  }
  await idbSet('fileHandle', fileHandle);
  await syncWithFile();
}

async function unlinkFile() {
  clearTimeout(writeTimer);
  fileHandle = null;
  await idbSet('fileHandle', undefined);
  setFileState('none');
}

// Returns the CSV text when server.py is answering, otherwise null (opened from file:// or a plain static server)
async function probeServer() {
  try {
    const r = await fetch('api/data', { cache: 'no-store' });
    return r.ok && (r.headers.get('Content-Type') || '').startsWith('text/csv') ? await r.text() : null;
  } catch { return null; }
}

async function initFile() {
  const serverText = await probeServer();
  if (serverText !== null) {
    serverMode = true;
    setFileState('ok');
    return syncWithFile(serverText);
  }
  if (!canLink) {
    $('file-status-text').textContent = 'Автоматичното запазване във файл работи в Chrome или Edge. Използвай „Свали .csv“ за ръчно копие.';
    $('link-btn').hidden = true;
    return;
  }
  try { fileHandle = (await idbGet('fileHandle')) || null; } catch { fileHandle = null; }
  if (!fileHandle) return setFileState('none');
  if ((await fileHandle.queryPermission(PERM)) === 'granted') {
    setFileState('ok');
    syncWithFile();
  } else {
    setFileState('needs'); // a click is required to re-grant access after a restart
  }
}

window.addEventListener('pagehide', () => { if (writePending) writeFile(); });
$('link-btn').addEventListener('click', linkFile);
$('unlink-btn').addEventListener('click', unlinkFile);

$('export-btn').addEventListener('click', exportCsv);
$('import-btn').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) importFile(f);
  e.target.value = ''; // allow re-importing the same file
});

// ---------- Sync between devices (secret GitHub gist) ----------
// Each device keeps its own copy and merges with the gist using the same rules as the CSV file:
// the most recently changed copy of each word wins, and deletions stick.
// The token lives under its own key so it never ends up in the CSV.
const SYNC_KEY = 'easyflash.sync';
const SYNC_FILE = 'easyflash.csv';
const GITHUB = 'https://api.github.com';
let sync = loadSync(); // { token, gistId } or null
let syncTimer;
let syncBusy = false;
let syncAgain = false;
let mergingFromSync = false; // a save caused by pulling shouldn't trigger another sync round
let lastSync = 0;
let syncError = '';

function loadSync() {
  try {
    const s = JSON.parse(localStorage.getItem(SYNC_KEY));
    return s && s.token ? s : null;
  } catch { return null; }
}
function storeSync() {
  try {
    if (sync) localStorage.setItem(SYNC_KEY, JSON.stringify(sync));
    else localStorage.removeItem(SYNC_KEY);
  } catch {}
}

async function gh(path, opts = {}) {
  const r = await fetch(GITHUB + path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${sync.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
  return r.json();
}

// Row order and per-device settings differ between devices; ignore both when deciding whether to push
const canon = (t) => t.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l && !l.startsWith('setting,')).sort().join('\n');

async function ensureGist() {
  for (let page = 1; page <= 3; page++) {
    const list = await gh(`/gists?per_page=100&page=${page}`);
    const hit = list.find((g) => g.files && g.files[SYNC_FILE]);
    if (hit) { sync.gistId = hit.id; return; }
    if (list.length < 100) break;
  }
  const g = await gh('/gists', {
    method: 'POST',
    body: JSON.stringify({ description: 'EasyFlash sync', public: false, files: { [SYNC_FILE]: { content: serialize() } } }),
  });
  sync.gistId = g.id;
}

async function readGist() {
  const g = await gh(`/gists/${sync.gistId}`);
  const f = g.files && g.files[SYNC_FILE];
  if (!f) return '';
  return f.truncated ? (await fetch(f.raw_url)).text() : f.content || '';
}

function syncMessage(err) {
  if (err.status === 401) return 'Токенът е невалиден или е изтекъл. Създай нов и го постави отново.';
  if (err.status === 403) return 'GitHub отказа достъпа. Провери дали токенът има право „gist“ или опитай след малко.';
  if (err instanceof TypeError) return 'Няма връзка с интернет. Ще опитам пак по-късно.';
  return `Грешка при синхронизиране (${err.status || err.message}).`;
}

async function syncNow(retry = true) {
  if (!sync) return false;
  if (syncBusy) { syncAgain = true; return false; }
  clearTimeout(syncTimer);
  syncBusy = true;
  syncError = '';
  renderSync();
  let ok = false;
  try {
    if (!sync.gistId) await ensureGist();
    const remote = await readGist();
    const before = serialize();
    mergeText(remote);
    const merged = serialize();
    if (merged !== before) {
      mergingFromSync = true;
      save();
      mergingFromSync = false;
      renderAll();
    }
    if (canon(merged) !== canon(remote)) {
      await gh(`/gists/${sync.gistId}`, { method: 'PATCH', body: JSON.stringify({ files: { [SYNC_FILE]: { content: merged } } }) });
    }
    lastSync = Date.now();
    ok = true;
  } catch (err) {
    mergingFromSync = false;
    if (err.status === 404 && retry && sync.gistId) { // the gist was deleted: look for or create a new one
      sync.gistId = '';
      syncBusy = false;
      return syncNow(false);
    }
    syncError = syncMessage(err);
    if (err.status === 401) { sync = null; storeSync(); } // a rejected token is useless; ask for a new one
  } finally {
    syncBusy = false;
  }
  if (ok) storeSync(); // remembers the gist id
  renderSync();
  if (syncAgain) { syncAgain = false; scheduleSync(); }
  return ok;
}

function scheduleSync() {
  if (!sync || mergingFromSync) return;
  if (syncBusy) { syncAgain = true; return; }
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 1500); // batch bursts of changes
}

function renderSync() {
  $('sync-setup').hidden = !!sync;
  $('sync-connected').hidden = !sync;
  const err = $('sync-error');
  err.hidden = !syncError;
  err.textContent = syncError;
  if (!sync) return;
  const time = lastSync ? new Date(lastSync).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' }) : '';
  $('sync-text').textContent = syncBusy
    ? 'Синхронизиране…'
    : `✓ Свързано с GitHub.${time ? ` Последна синхронизация: ${time}` : ''}`;
}

$('sync-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = $('sync-token').value.trim();
  if (!token) return;
  sync = { token, gistId: '' };
  const ok = await syncNow();
  $('sync-token').value = '';
  if (ok) toast('Синхронизирането е включено');
  else if (sync) { sync = null; storeSync(); renderSync(); } // keep only a token that worked
});
$('sync-now').addEventListener('click', () => syncNow());
$('sync-off').addEventListener('click', () => {
  sync = null;
  syncError = '';
  clearTimeout(syncTimer);
  storeSync();
  renderSync();
  toast('Синхронизирането е изключено. Данните остават в gist-а.');
});
// Pick up changes made on the other device when you come back to this one
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && sync && Date.now() - lastSync > 15000) syncNow();
});
window.addEventListener('online', () => { if (sync) syncNow(); });

// ---------- Stats ----------
function renderStats() {
  const chart = $('chart');
  chart.replaceChildren();
  const names = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const days = [...Array(7)].map((_, i) => Date.now() - (6 - i) * DAY);
  const counts = days.map((t) => state.days[dayKey(t)] || 0);
  const max = Math.max(...counts, 1);
  days.forEach((t, i) => {
    const col = el('div', i === 6 ? 'col today' : 'col');
    const bar = el('i');
    bar.style.height = `${(counts[i] / max) * 80}%`;
    col.append(el('b', null, counts[i]), bar, el('span', null, names[new Date(t).getDay()]));
    chart.append(col);
  });
}

// ---------- Wiring ----------
function renderSide() {
  document.querySelectorAll('#side-seg button').forEach((b) => b.classList.toggle('active', b.dataset.side === state.side));
}
function renderMode() {
  document.querySelectorAll('#mode-seg button').forEach((b) => b.classList.toggle('active', b.dataset.mode === state.mode));
}
function renderAll() {
  renderMode();
  renderDecks();
  renderWords();
  renderSide();
}

document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.go)));
$('study-all').addEventListener('click', () => { startStudy('all'); showView('study'); });
$('empty-practice').addEventListener('click', () => startStudy(session.topic, true));
$('side-seg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  state.side = b.dataset.side;
  state.sideChosen = true;
  save();
  renderSide();
  if (!card.classList.contains('flipped')) renderCard(); // swap sides on the current card
});
$('mode-seg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  state.mode = b.dataset.mode;
  state.modeChosen = true;
  save();
  renderMode();
  if (card.classList.contains('flipped')) updateTypeBox();
  else if (session.current) renderCard();
});
card.addEventListener('click', flip);
rate.addEventListener('click', (e) => {
  const b = e.target.closest('.rate-btn');
  if (b) grade(b.dataset.grade);
});
document.addEventListener('keydown', (e) => {
  if (!$('view-study').classList.contains('active') || e.target.matches('input')) return;
  if (e.code === 'Space') { e.preventDefault(); flip(); }
  if (card.classList.contains('flipped') && '1234'.includes(e.key)) grade(['again', 'hard', 'good', 'easy'][e.key - 1]);
});

renderAll();
initFile();
renderSync();
if (sync) syncNow();

// Offline support and "add to home screen" (needs https, which GitHub Pages provides)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('EasyFlash: no service worker', err));
}
