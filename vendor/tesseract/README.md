# Bundled Tesseract.js (handwriting / photo to text)

Everything here is served from the app itself, with no CDN. It is loaded only when the
"📷 От снимка" panel is first opened (see `hw.js`) and cached by `sw.js` the first time it is fetched.

| File | What | Source |
| --- | --- | --- |
| `tesseract.min.js` | Tesseract.js 7.0.0 browser build | `tesseract.js@7.0.0/dist/tesseract.min.js` |
| `worker.min.js` | its web worker | `tesseract.js@7.0.0/dist/worker.min.js` |
| `core/tesseract-core-*lstm.wasm.js` | OCR engine (WebAssembly inside), three builds; the browser picks the fastest it supports (relaxed SIMD, SIMD, plain) | `tesseract.js-core@7.0.0` |
| `lang/spa.traineddata.gz`, `lang/bul.traineddata.gz` | Spanish and Bulgarian models (LSTM, 4.0.0_best_int) | `@tesseract.js-data/spa`, `@tesseract.js-data/bul` 1.0.0 |
| `LICENSE-tesseract.js.md` | Apache-2.0 licence of Tesseract.js (the core and the language data are Apache-2.0 too) | |

Only the LSTM builds are bundled because `hw.js` creates the worker with the LSTM-only engine.

## Updating

```sh
mkdir /tmp/ocr && cd /tmp/ocr && npm init -y
npm install tesseract.js @tesseract.js-data/spa @tesseract.js-data/bul --ignore-scripts
# copy the same files as listed above, then bump OCR_CACHE in sw.js so browsers fetch the new ones
```
