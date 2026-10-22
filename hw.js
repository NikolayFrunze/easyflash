// Photo to text for the "Добави нова дума" form.
// Tesseract.js and its data are bundled in vendor/tesseract/ and only loaded once the panel is first opened.
// The recognized text is written into a form field; nothing is submitted or saved from here.
(() => {
  'use strict';

  const form = document.getElementById('add-form');
  const openBtn = document.getElementById('hw-btn');
  if (!form || !openBtn) return;

  const $ = (id) => document.getElementById(id);
  const panel = $('hw-panel');
  const say = (msg) => (typeof toast === 'function' ? toast(msg) : console.warn(msg)); // toast() comes from app.js

  const BASE = 'vendor/tesseract/';
  const LANG = { 'f-es': 'spa', 'f-ex': 'spa', 'f-bg': 'bul' }; // field id -> Tesseract language
  const MAX_SIDE = 1800; // photos are scaled down to this before processing

  let lastField = 'f-es'; // last of the three text fields the user focused
  let photo = null;
  let photoUrl = '';
  let busy = false;
  let started = false; // the panel has been opened once, so the engine is loading or loaded

  // ---------- Which field gets the text ----------
  form.addEventListener('focusin', (e) => {
    if (LANG[e.target.id]) {
      lastField = e.target.id;
      $('hw-target').value = lastField;
    }
  });

  // ---------- Panel ----------
  openBtn.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    openBtn.setAttribute('aria-expanded', String(open));
    if (!open) return;
    $('hw-target').value = lastField;
    if (!started) {
      started = true;
      prepare(); // first open: start loading the engine in the background
    }
  });

  // After "Добави дума" the form is reset: start the next word with no photo
  form.addEventListener('reset', () => {
    clearPhoto();
    setTimeout(() => { $('hw-target').value = lastField; }, 0);
  });

  // ---------- Photo ----------
  function clearPhoto() {
    photo = null;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = '';
    $('hw-preview').hidden = true;
    $('hw-preview').removeAttribute('src');
    $('hw-file').value = '';
  }

  $('hw-file').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photo = f || null;
    photoUrl = f ? URL.createObjectURL(f) : '';
    $('hw-preview').hidden = !f;
    if (f) $('hw-preview').src = photoUrl;
  });

  async function photoToDrawable(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {} // honours the camera's rotation
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
      img.src = url;
    });
  }

  // ---------- Preprocessing ----------
  // Evens out uneven lighting in photos by dividing each pixel by the average of its surroundings
  function flatten(g, w, h) {
    const r = Math.max(8, Math.round(Math.max(w, h) / 16));
    const W = w + 1;
    const I = new Uint32Array(W * (h + 1)); // integral image: any box sum in four lookups
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        row += g[y * w + x];
        I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row;
      }
    }
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r);
        const x1 = Math.min(w, x + r + 1);
        const sum = I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0];
        const mean = Math.max(sum / ((y1 - y0) * (x1 - x0)), 1);
        g[y * w + x] = Math.min(255, (g[y * w + x] * 255) / mean);
      }
    }
  }

  function otsu(hist, n) {
    let sum = 0;
    for (let v = 0; v < 256; v++) sum += v * hist[v];
    let sumB = 0;
    let wB = 0;
    let best = -1;
    let t = 127;
    for (let v = 0; v < 256; v++) {
      wB += hist[v];
      if (!wB) continue;
      const wF = n - wB;
      if (!wF) break;
      sumB += v * hist[v];
      const d = sumB / wB - (sum - sumB) / wF;
      const between = wB * wF * d * d;
      if (between > best) { best = between; t = v; }
    }
    return t;
  }

  // grayscale -> (even out light) -> stretch contrast -> black/white threshold -> crop to the writing.
  // Returns a black-on-white canvas, or null when there is nothing written.
  // opts.photo: a camera picture (needs light correction); opts.line: a single line of text (size is normalized)
  function preprocess(src, opts) {
    const sw = src.naturalWidth || src.width;
    const sh = src.naturalHeight || src.height;
    const k = Math.min(1, MAX_SIDE / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * k));
    const h = Math.max(1, Math.round(sh * k));
    const n = w * h;

    const work = document.createElement('canvas');
    work.width = w;
    work.height = h;
    const wctx = work.getContext('2d', { willReadFrequently: true });
    wctx.fillStyle = '#fff'; // transparent pixels count as paper
    wctx.fillRect(0, 0, w, h);
    wctx.drawImage(src, 0, 0, w, h);
    const px = wctx.getImageData(0, 0, w, h).data;

    const g = new Uint8ClampedArray(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (px[j] * 299 + px[j + 1] * 587 + px[j + 2] * 114) / 1000;
    if (opts.photo) flatten(g, w, h);

    // contrast: stretch the darkest ink (ignoring 0.02 % outliers) .. 99th percentile to 0..255
    let hist = new Uint32Array(256);
    for (let i = 0; i < n; i++) hist[g[i]]++;
    const pct = (q) => {
      let acc = 0;
      for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * q) return v; }
      return 255;
    };
    const lo = pct(0.0002);
    const hi = pct(0.99);
    if (hi - lo < 40) return null; // flat image: nothing written
    for (let i = 0; i < n; i++) g[i] = ((g[i] - lo) * 255) / (hi - lo);

    // threshold
    hist = new Uint32Array(256);
    for (let i = 0; i < n; i++) hist[g[i]]++;
    const t = Math.min(200, Math.max(60, otsu(hist, n)));
    const bw = new Uint8Array(n); // 1 = ink
    let ink = 0;
    for (let i = 0; i < n; i++) if (g[i] <= t) { bw[i] = 1; ink++; }
    if (ink > n / 2) { // the writing is the minority; if not, the page was darker than the ink
      for (let i = 0; i < n; i++) bw[i] ^= 1;
      ink = n - ink;
    }
    if (ink < 15) return null;

    // crop to the writing (rows and columns with a couple of dark pixels, so stray specks don't count)
    const rows = new Uint32Array(h);
    const cols = new Uint32Array(w);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) if (bw[y * w + x]) { rows[y]++; cols[x]++; }
    }
    const min = opts.photo ? Math.max(2, Math.round(Math.max(w, h) / 600)) : 1;
    let y0 = 0; let y1 = h - 1; let x0 = 0; let x1 = w - 1;
    while (y0 < h && rows[y0] < min) y0++;
    while (y1 > y0 && rows[y1] < min) y1--;
    while (x0 < w && cols[x0] < min) x0++;
    while (x1 > x0 && cols[x1] < min) x1--;
    if (y0 >= h || x0 >= w) return null;
    const cw = x1 - x0 + 1;
    const ch = y1 - y0 + 1;
    const pad = Math.max(16, Math.round(Math.min(cw, ch) * 0.25)); // Tesseract wants a white margin

    const out = document.createElement('canvas');
    out.width = cw + 2 * pad;
    out.height = ch + 2 * pad;
    const octx = out.getContext('2d');
    const img = octx.createImageData(out.width, out.height);
    img.data.fill(255);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        if (!bw[(y0 + y) * w + x0 + x]) continue;
        const o = ((y + pad) * out.width + x + pad) * 4;
        img.data[o] = img.data[o + 1] = img.data[o + 2] = 0;
      }
    }
    octx.putImageData(img, 0, 0);

    // a line of text reads best when its height is moderate; big blocks just get capped
    let s = 1;
    if (opts.line) s = ch > 140 ? 140 / ch : ch < 56 ? Math.min(4, 56 / ch) : 1;
    else if (Math.max(out.width, out.height) > 2000) s = 2000 / Math.max(out.width, out.height);
    if (s === 1) return out;
    const scaled = document.createElement('canvas');
    scaled.width = Math.max(1, Math.round(out.width * s));
    scaled.height = Math.max(1, Math.round(out.height * s));
    const sctx = scaled.getContext('2d');
    sctx.imageSmoothingQuality = 'high';
    sctx.fillStyle = '#fff';
    sctx.fillRect(0, 0, scaled.width, scaled.height);
    sctx.drawImage(out, 0, 0, scaled.width, scaled.height);
    return scaled;
  }

  // ---------- Engine ----------
  let tessPromise = null;
  let workerPromise = null;
  let workerLang = '';
  let ready = false;
  let onProgress = () => {};

  const abs = (p) => new URL(BASE + p, location.href).href;

  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (!tessPromise) {
      tessPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = BASE + 'tesseract.min.js';
        s.onload = () => resolve(window.Tesseract);
        s.onerror = () => { tessPromise = null; s.remove(); reject(new Error('script')); };
        document.head.append(s);
      });
    }
    return tessPromise;
  }

  // Tesseract reports stages; each gets a slice of one progress bar
  const STAGES = {
    'loading tesseract core': [0, 0.2, 'Зареждане на модула…'],
    'initializing tesseract': [0.2, 0.25, 'Подготовка…'],
    'loading language traineddata': [0.25, 0.6, 'Зареждане на езика…'],
    'initializing api': [0.6, 0.7, 'Подготовка…'],
    'recognizing text': [0.7, 1, 'Разпознаване…'],
  };
  let warm = false; // the engine is already loaded, so recognizing is the whole job
  function logger(m) {
    const st = STAGES[String(m.status).replace(/ \(from cache\)$/, '')];
    if (!st) return;
    const [a, b, label] = st[2] === 'Разпознаване…' && warm ? [0, 1, st[2]] : st;
    onProgress(a + (b - a) * (m.progress || 0), label);
  }

  async function getWorker(lang) {
    const T = await loadTesseract();
    if (!workerPromise) {
      workerPromise = T.createWorker(lang, 1, { // 1 = LSTM only, the engine the bundled core files are built for
        workerPath: abs('worker.min.js'),
        corePath: abs('core/'), // a folder: Tesseract picks the fastest build this browser supports
        langPath: abs('lang/'),
        workerBlobURL: false, // a real same-origin worker, so the service worker can cache its requests
        logger,
      }).then((w) => { workerLang = lang; ready = true; return w; })
        .catch((err) => { workerPromise = null; throw err; });
    }
    const w = await workerPromise;
    if (workerLang !== lang) {
      warm = false;
      await w.reinitialize(lang);
      workerLang = lang;
    }
    return w;
  }

  // ---------- Progress UI ----------
  function showProgress(p, label) {
    $('hw-progress').hidden = false;
    $('hw-bar').value = p;
    $('hw-status').textContent = `${label} ${Math.round(p * 100)}%`;
  }
  const hideProgress = () => { $('hw-progress').hidden = true; };

  // The bar never goes backwards within one job
  function trackProgress() {
    let shown = 0;
    onProgress = (p, label) => { shown = Math.max(shown, p); showProgress(shown, label); };
    return () => { onProgress = () => {}; };
  }

  // Warms the engine in the background the first time the panel opens
  async function prepare() {
    const stop = trackProgress();
    try {
      await getWorker(LANG[$('hw-target').value] || 'spa');
    } catch (err) {
      console.warn('EasyFlash: handwriting engine did not load yet', err);
    } finally {
      stop();
      if (!busy) hideProgress();
    }
  }

  // ---------- Recognize ----------
  class Problem extends Error {}

  function tidy(text) {
    return text
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[^\p{L}\p{N}¿¡]+|[^\p{L}\p{N}?!.]+$/gu, ''); // drop stray marks around the text
  }

  async function recognize() {
    if (busy) return;
    const targetId = $('hw-target').value;
    const target = $(targetId);
    const lang = LANG[targetId];
    busy = true;
    $('hw-go').disabled = true;
    $('hw-go').textContent = 'Разпознаване…';
    const stop = trackProgress();
    showProgress(0, 'Подготовка…');
    try {
      if (!photo) throw new Problem('Първо избери или направи снимка.');
      const src = await photoToDrawable(photo);
      const single = false; // a photo may hold several lines
      const pre = preprocess(src, { photo: true, line: single });
      if (src.close) src.close(); // free an ImageBitmap
      if (!pre) throw new Problem('Не открих написан текст. Снимай по-отблизо и при добра светлина.');

      const worker = await getWorker(lang);
      await worker.setParameters({
        tessedit_pageseg_mode: single ? '7' : '6', // 7 = single line, 6 = one block of text
        user_defined_dpi: '300',
      });
      warm = ready;
      const { data } = await worker.recognize(pre);
      const text = tidy(data.text || '');
      if (!text) throw new Problem('Не успях да разпозная текст. Снимай по-отблизо и при добра светлина.');

      target.value = target.maxLength > 0 ? text.slice(0, target.maxLength) : text;
      target.focus(); // never submitted: the user checks it and presses "Добави дума"
      target.setSelectionRange(target.value.length, target.value.length);
      say(data.confidence < 50
        ? 'Разпознато със слаба сигурност. Провери написаното.'
        : 'Разпознато. Провери и натисни „Добави дума“.');
    } catch (err) {
      if (err instanceof Problem) say(err.message);
      else {
        console.error('EasyFlash: recognition failed', err);
        workerPromise = null; // start over with a fresh engine next time
        ready = false;
        say('Неуспешно разпознаване. Провери връзката и опитай пак.');
      }
    } finally {
      warm = false;
      stop();
      hideProgress();
      busy = false;
      $('hw-go').disabled = false;
      $('hw-go').textContent = 'Разпознай';
    }
  }
  $('hw-go').addEventListener('click', recognize);
})();
