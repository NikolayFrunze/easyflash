# EasyFlash

Spanish flashcards with a Bulgarian interface. Plain HTML, CSS and JavaScript: no build step, no dependencies.

- Show Bulgarian or Spanish first (or mixed), and flip the card or type the answer
- Add your own words; spaced-repetition scheduling
- Works offline and can be installed on a phone (add to home screen)
- Sync between devices through a secret GitHub gist, and backup/restore as a CSV file

## Publish on GitHub Pages

1. Push this folder to a **public** GitHub repository (free accounts need that for Pages).
2. Repository **Settings → Pages → Build and deployment**: Source *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. After a minute the app is live at `https://<username>.github.io/<repository>/`.

Every push to `main` redeploys. Open the site once online and it keeps working offline afterwards.

### Install on a phone

- **iPhone (Safari):** Share → *Add to Home Screen*
- **Android (Chrome):** menu → *Install app*

## Where your data lives

Words and progress are stored **in the browser on each device** (localStorage). To keep a phone and a laptop in step, turn on **sync**:

1. Open the *Думи* page and use the **Синхронизация между устройства** section.
2. Create a GitHub token with only the `gist` right (the link in the app pre-fills it) and paste it. Do the same on every device.
3. The app keeps a **secret gist** named `easyflash.csv` in your GitHub account. Each device merges with it when you open the app, when you come back to it, and a moment after every change.

The token is stored only in that browser and never goes into the CSV or the repository. Anyone who has the gist URL can read it, so don't share it. Use *Изключи* to disconnect a device (the gist stays). Other pages under the same `github.io` address can read what this site stores, so only publish projects you trust there.

Merging is per word: the most recently changed copy wins, deletions stay deleted, and review counts per day keep the larger number. Both devices need roughly correct clocks.

Without sync you can still move data by hand:

- **⬇️ Свали .csv** saves everything (words, progress, streak, settings).
- **⬆️ Зареди от файл** merges such a file into another device.

Safari can clear the data of sites you haven't visited for about a week unless the app is added to the Home Screen, so keep sync on or keep a CSV backup.

## Run locally with automatic saving to a CSV

```sh
python3 server.py        # or double-click start.command
```

Open http://127.0.0.1:8765. Every change is written to `data/easyflash.csv` (the previous version is kept as `.bak`). This only works with `server.py`; on GitHub Pages use the download button above.

## Files

| File | Purpose |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | the app |
| `fonts.css`, `fonts/` | bundled Fraunces and Inter fonts (works offline) |
| `manifest.webmanifest`, `sw.js`, `icon/` | installable app and offline cache |
| `server.py`, `start.command` | optional local server with automatic CSV saving |
| `ios/`, `capacitor.config.json`, `package.json` | optional iOS wrapper (Capacitor) |
