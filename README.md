# KaraokePitch Studio

A fast, studio-grade **YouTube Karaoke** player for **Windows (`.exe`)** and **Android (`.apk`)** featuring real-time tempo-preserving pitch shifting, bidirectional audio/lyric sync adjustment, and offline video downloads.

## Features

- **YouTube Karaoke-Only Discovery** — Automatically scopes and filters YouTube search results to karaoke, instrumental, minus-one, and lyric sing-along tracks. Zero paid APIs or API keys required.
- **Real-Time Studio Pitch Shifter (`-12` to `+12` ST)** — Powered by **Signalsmith Stretch (WebAssembly AudioWorklet)** with automatic stereo granular AudioWorklet fallback. Shifts pitch in `0.5` or `1.0` semitone steps without altering song speed.
- **Custom Audio / Lyric Sync Shift (`-2000ms` to `+2000ms`)** — Shift audio **left (earlier)** or **right (later)** in `25ms` / `100ms` nudges or via slider to fix karaoke videos where on-screen lyrics run ahead of or behind the music.
- **Independent Tempo Control (`0.75x` – `1.25x`)** — Slow down fast tracks or speed them up without affecting your chosen pitch.
- **Offline Video Downloads** — Save karaoke videos directly inside the app for offline singing with full real-time pitch shifting and sync adjustment.
- **Per-Song Memory** — Automatically remembers your preferred key (semitones), audio sync offset, and tempo for every song.
- **Fullscreen Stage Mode** — Fullscreen lyric display with an auto-hiding floating HUD for live pitch and sync adjustments.

## Folder Structure

```text
KaraokePitch/
├── .github/workflows/
│   ├── ci.yml                 # Typecheck & build verification on push/PR
│   └── release.yml            # Automated Windows .exe & Android .apk GitHub Releases on v* tags
├── electron/
│   ├── main.ts                # Electron window, local CORS-free Range media proxy, IPC, offline storage
│   ├── preload.ts             # Safe renderer bridge
│   └── youtube.ts             # Karaoke-only YouTube search & adaptive/muxed stream extractor
├── public/worklets/
│   └── pitch-shifter-processor.js  # Fallback stereo AudioWorklet pitch shifter
├── src/
│   ├── audio/pitchEngine.ts   # Real-time Web Audio Signalsmith Stretch DSP engine
│   ├── components/            # Responsive Studio UI (Sidebar, SearchHeader, TrackGrid, StagePlayer, StudioConsole, DownloadsView, MiniPlayer)
│   ├── services/              # Unified Electron/Capacitor platform layer, Android extractor, local settings storage
│   └── types/karaoke.ts       # Shared TypeScript interfaces
├── capacitor.config.ts        # Android Capacitor configuration
├── electron-builder.yml       # Windows NSIS + Portable EXE packaging configuration
└── package.json
```

## Local Development

```bash
# Install dependencies
npm install

# Run desktop app in development mode (Vite + Electron)
npm run dev:electron

# Build Windows .exe (installer + portable) locally
npm run build:win

# Sync Android Capacitor project
npm run cap:sync
```

## Automated Releases (Windows `.exe` + Android `.apk`)

Push a version tag to trigger GitHub Actions to build both the Windows `.exe` and Android `.apk` and publish them to **GitHub Releases**:

```bash
git tag v1.0.0
git push origin v1.0.0
```
