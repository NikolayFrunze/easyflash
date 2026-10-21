# EasyFlash

Spanish flashcards with a Bulgarian interface. Plain HTML, CSS and JavaScript: no build step, no dependencies.

- Show Bulgarian or Spanish first (or mixed), and flip the card or type the answer
- Add your own words; spaced-repetition scheduling
- Works offline and can be installed on a phone (add to home screen)
- Backup/restore as a CSV file

## Publish on GitHub Pages

1. Push this folder to a **public** GitHub repository (free accounts need that for Pages).
2. Repository **Settings → Pages → Build and deployment**: Source *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. After a minute the app is live at `https://<username>.github.io/<repository>/`.

Every push to `main` redeploys. Open the site once online and it keeps working offline afterwards.

### Install on a phone

- **iPhone (Safari):** Share → *Add to Home Screen*
- **Android (Chrome):** menu → *Install app*

## Where your data lives

Words and progress are stored **in the browser on each device** (localStorage). The site has no server, so a phone and a laptop do **not** share data automatically. To move or back up data:

- **⬇️ Свали .csv** on the *Думи* page saves everything (words, progress, streak, settings).
- **⬆️ Зареди от файл** on another device merges that file in. The most recently changed copy of each word wins, and deleted words stay deleted.

Safari can clear the data of sites you haven't visited for about a week unless the app is added to the Home Screen, so keep a CSV backup.

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
