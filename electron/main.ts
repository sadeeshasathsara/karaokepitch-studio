import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { extractStreams, getYouTubeClient, searchKaraokeVideos } from './youtube';
import type { AppUpdateState, DownloadProgress, KaraokeTrack, StreamBundle } from './types';

let mainWindow: BrowserWindow | null = null;
let proxyServer: http.Server | null = null;
let proxyPort = 0;

// In-memory token -> remote stream URL map (and reverse lookup so identical audio/video URLs share one token)
const streamUrlMap = new Map<string, string>();
const reverseUrlMap = new Map<string, string>();

interface CachedChunk {
  status: number;
  contentType: string;
  contentRange: string | null;
  body: Buffer;
}

// First chunk is tiny so the first video frame / audio arrives fast; later chunks are larger
function chunkSizeFor(start: number): number {
  return start === 0 ? 192 * 1024 : 640 * 1024;
}
const MAX_CACHE_BYTES = 24 * 1024 * 1024; // 24 MB RAM cache for instant dual-element A/V sync & seeking
const chunkCache = new Map<string, CachedChunk>();
const inflightChunks = new Map<string, Promise<CachedChunk>>();
let currentCacheBytes = 0;

function putChunkCache(key: string, chunk: CachedChunk): void {
  if (chunkCache.has(key)) return;
  chunkCache.set(key, chunk);
  currentCacheBytes += chunk.body.byteLength;
  while (currentCacheBytes > MAX_CACHE_BYTES && chunkCache.size > 0) {
    const oldestKey = chunkCache.keys().next().value;
    if (!oldestKey) break;
    const evicted = chunkCache.get(oldestKey);
    chunkCache.delete(oldestKey);
    if (evicted) currentCacheBytes -= evicted.body.byteLength;
  }
}

const YT_STREAM_USER_AGENT =
  'com.google.android.youtube/19.29.37 (Linux; U; Android 11) gzip';

// Fetch one bounded chunk with RAM cache + in-flight de-duplication
function getChunk(token: string, targetUrl: string, rangeHeader: string): Promise<CachedChunk> {
  const cacheKey = `${token}:${rangeHeader}`;
  const cached = chunkCache.get(cacheKey);
  if (cached) return Promise.resolve(cached);

  let pending = inflightChunks.get(cacheKey);
  if (!pending) {
    pending = (async () => {
      const upstream = await fetch(targetUrl, {
        headers: { 'User-Agent': YT_STREAM_USER_AGENT, Range: rangeHeader },
      });
      const buf = Buffer.from(await upstream.arrayBuffer());
      const result: CachedChunk = {
        status: upstream.status,
        contentType: upstream.headers.get('content-type') || 'application/octet-stream',
        contentRange: upstream.headers.get('content-range'),
        body: buf,
      };
      if (upstream.ok || upstream.status === 206) {
        putChunkCache(cacheKey, result);
      }
      return result;
    })();
    inflightChunks.set(cacheKey, pending);
    const p = pending;
    void p.then(
      () => inflightChunks.delete(cacheKey),
      () => inflightChunks.delete(cacheKey)
    );
  }
  return pending;
}

function getDownloadsDir(): string {
  const dir = path.join(app.getPath('userData'), 'downloads');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getIndexPath(): string {
  return path.join(getDownloadsDir(), 'index.json');
}

function readDownloadIndex(): KaraokeTrack[] {
  const idxPath = getIndexPath();
  if (!fs.existsSync(idxPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(idxPath, 'utf-8')) as KaraokeTrack[];
    return parsed.filter((t) => fs.existsSync(path.join(getDownloadsDir(), `${t.id}.mp4`)));
  } catch {
    return [];
  }
}

function writeDownloadIndex(tracks: KaraokeTrack[]): void {
  fs.writeFileSync(getIndexPath(), JSON.stringify(tracks, null, 2), 'utf-8');
}

function registerProxiedUrl(remoteUrl: string): string {
  const existingToken = reverseUrlMap.get(remoteUrl);
  if (existingToken && streamUrlMap.has(existingToken)) {
    return `http://127.0.0.1:${proxyPort}/proxy/${existingToken}`;
  }

  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  streamUrlMap.set(token, remoteUrl);
  reverseUrlMap.set(remoteUrl, token);
  // Keep map bounded
  if (streamUrlMap.size > 120) {
    const firstKey = streamUrlMap.keys().next().value;
    if (firstKey) {
      const oldUrl = streamUrlMap.get(firstKey);
      streamUrlMap.delete(firstKey);
      if (oldUrl) reverseUrlMap.delete(oldUrl);
    }
  }
  return `http://127.0.0.1:${proxyPort}/proxy/${token}`;
}

function startLocalMediaServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    proxyServer = http.createServer(async (req, res) => {
      // Allow Web Audio API crossOrigin="anonymous" cleanly
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const urlPath = (req.url || '').split('?')[0];

      // 1. Offline local MP4 file with full Range support
      if (urlPath.startsWith('/offline/')) {
        const videoId = path.basename(urlPath).replace(/[^a-zA-Z0-9_-]/g, '');
        const filePath = path.join(getDownloadsDir(), `${videoId}.mp4`);
        if (!fs.existsSync(filePath)) {
          res.writeHead(404);
          res.end('Offline file not found');
          return;
        }

        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
          const match = /bytes=(\d+)-(\d*)/.exec(range);
          const start = match ? parseInt(match[1], 10) : 0;
          const end = match && match[2] ? Math.min(parseInt(match[2], 10), fileSize - 1) : fileSize - 1;
          const chunkSize = end - start + 1;

          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': 'video/mp4',
          });
          fs.createReadStream(filePath, { start, end }).pipe(res);
        } else {
          res.writeHead(200, {
            'Content-Length': fileSize,
            'Accept-Ranges': 'bytes',
            'Content-Type': 'video/mp4',
          });
          fs.createReadStream(filePath).pipe(res);
        }
        return;
      }

      // 2. Proxied remote YouTube stream with bounded Range clamping + RAM deduplication cache
      if (urlPath.startsWith('/proxy/')) {
        const token = urlPath.slice('/proxy/'.length);
        const targetUrl = streamUrlMap.get(token);
        if (!targetUrl) {
          res.writeHead(404);
          res.end('Stream token expired');
          return;
        }

        try {
          // Clamp open-ended Range requests to small chunks: tiny first chunk = fast first frame
          let rangeHeader = req.headers.range || 'bytes=0-';
          const openRangeMatch = /^bytes=(\d+)-$/.exec(rangeHeader);
          if (openRangeMatch) {
            const start = parseInt(openRangeMatch[1], 10);
            rangeHeader = `bytes=${start}-${start + chunkSizeFor(start) - 1}`;
          }

          const chunk = await getChunk(token, targetUrl, rangeHeader);

          // Read-ahead: warm the next chunk while the player consumes this one
          const rm = /^bytes=(\d+)-(\d+)$/.exec(rangeHeader);
          const total = chunk.contentRange ? Number(/\/(\d+)$/.exec(chunk.contentRange)?.[1]) : 0;
          if (rm && total) {
            const nextStart = parseInt(rm[2], 10) + 1;
            if (nextStart < total) {
              const nextEnd = Math.min(total - 1, nextStart + chunkSizeFor(nextStart) - 1);
              void getChunk(token, targetUrl, `bytes=${nextStart}-${nextEnd}`).catch(() => undefined);
            }
          }

          const responseHeaders: Record<string, string | number> = {
            'Content-Type': chunk.contentType,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunk.body.byteLength,
          };
          if (chunk.contentRange) {
            responseHeaders['Content-Range'] = chunk.contentRange;
          }

          res.writeHead(chunk.status, responseHeaders);
          res.end(chunk.body);
        } catch (err) {
          if (!res.headersSent) res.writeHead(502);
          res.end(`Proxy error: ${err instanceof Error ? err.message : 'unknown'}`);
        }
        return;
      }

      // 3. Serve built web app from 127.0.0.1 so Chromium treats it as a Secure Context
      //    (required for AudioWorklet / Signalsmith Stretch WASM and same-origin media)
      const distDir = path.join(__dirname, '../dist');
      const relPath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
      const candidate = path.resolve(distDir, relPath);
      if (candidate.startsWith(distDir) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        const ext = path.extname(candidate).toLowerCase();
        const mimeMap: Record<string, string> = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.mjs': 'application/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.ico': 'image/x-icon',
          '.json': 'application/json',
          '.wasm': 'application/wasm',
        };
        res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'application/octet-stream' });
        fs.createReadStream(candidate).pipe(res);
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    proxyServer.on('error', reject);
    proxyServer.listen(0, '127.0.0.1', () => {
      const addr = proxyServer?.address();
      if (addr && typeof addr === 'object') {
        proxyPort = addr.port;
        resolve(proxyPort);
      } else {
        reject(new Error('Failed to bind local media server'));
      }
    });
  });
}

function sendDownloadProgress(progress: DownloadProgress): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('karaoke:downloads:progress', progress);
  }
}

const GITHUB_RELEASES_URL = 'https://github.com/sadeeshasathsara/karaokepitch-studio/releases/latest';
let currentUpdateState: AppUpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
};

function sendUpdateState(state: AppUpdateState): void {
  currentUpdateState = state;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('karaoke:update:state', state);
  }
}

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    sendUpdateState({ status: 'checking', currentVersion: app.getVersion() });
  });

  autoUpdater.on('update-available', (info) => {
    sendUpdateState({
      status: 'available',
      currentVersion: app.getVersion(),
      latestVersion: info.version,
      releaseUrl: GITHUB_RELEASES_URL,
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    sendUpdateState({
      status: 'up-to-date',
      currentVersion: app.getVersion(),
      latestVersion: info.version,
    });
  });

  autoUpdater.on('download-progress', (p) => {
    sendUpdateState({
      status: 'downloading',
      currentVersion: app.getVersion(),
      latestVersion: currentUpdateState.latestVersion,
      percent: Math.round(p.percent),
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendUpdateState({
      status: 'downloaded',
      currentVersion: app.getVersion(),
      latestVersion: info.version,
    });
  });

  autoUpdater.on('error', (err) => {
    sendUpdateState({
      status: 'error',
      currentVersion: app.getVersion(),
      message: err?.message || 'Update check failed',
    });
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle('karaoke:search', async (_event, query: string) => {
    const results = await searchKaraokeVideos(query);
    // Pre-resolve stream URLs for top results so clicking a song starts almost instantly
    void Promise.allSettled(results.slice(0, 4).map((t) => extractStreams(t.id)));
    return results;
  });

  ipcMain.handle('karaoke:streams', async (_event, videoId: string): Promise<StreamBundle> => {
    const cleanId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
    const localFile = path.join(getDownloadsDir(), `${cleanId}.mp4`);
    if (fs.existsSync(localFile)) {
      const offlineUrl = `http://127.0.0.1:${proxyPort}/offline/${cleanId}`;
      return {
        videoId: cleanId,
        videoUrl: offlineUrl,
        audioUrl: offlineUrl,
        muxedUrl: offlineUrl,
        qualityLabel: 'Offline HD',
        isOffline: true,
      };
    }

    const streams = await extractStreams(cleanId);
    return {
      videoId: cleanId,
      videoUrl: registerProxiedUrl(streams.videoUrl),
      audioUrl: registerProxiedUrl(streams.audioUrl),
      muxedUrl: streams.muxedUrl ? registerProxiedUrl(streams.muxedUrl) : undefined,
      qualityLabel: streams.qualityLabel,
      audioBitrateKbps: streams.audioBitrateKbps,
      isOffline: false,
    };
  });

  ipcMain.handle('karaoke:downloads:list', async () => {
    return readDownloadIndex();
  });

  ipcMain.handle('karaoke:downloads:start', async (_event, track: KaraokeTrack) => {
    const cleanId = track.id.replace(/[^a-zA-Z0-9_-]/g, '');
    const targetPath = path.join(getDownloadsDir(), `${cleanId}.mp4`);
    const tempPath = `${targetPath}.part`;

    try {
      sendDownloadProgress({ videoId: cleanId, percent: 2, status: 'downloading' });
      const streams = await extractStreams(cleanId);
      const downloadUrl = streams.muxedUrl || streams.videoUrl;

      const response = await fetch(downloadUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
      });

      if (!response.ok || !response.body) {
        throw new Error(`Download failed (${response.status})`);
      }

      const totalBytes = Number(response.headers.get('content-length') || 0);
      let downloadedBytes = 0;
      const writer = fs.createWriteStream(tempPath);
      const reader = response.body.getReader();

      let lastReported = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          writer.write(Buffer.from(value));
          downloadedBytes += value.byteLength;
          if (totalBytes > 0) {
            const pct = Math.min(99, Math.round((downloadedBytes / totalBytes) * 100));
            if (pct - lastReported >= 2) {
              lastReported = pct;
              sendDownloadProgress({ videoId: cleanId, percent: pct, status: 'downloading' });
            }
          }
        }
      }

      await new Promise<void>((resolve, reject) => {
        writer.end(() => resolve());
        writer.on('error', reject);
      });

      fs.renameSync(tempPath, targetPath);
      const stat = fs.statSync(targetPath);

      const savedTrack: KaraokeTrack = {
        ...track,
        id: cleanId,
        isOffline: true,
        localFileSize: stat.size,
        downloadedAt: Date.now(),
      };

      const existing = readDownloadIndex().filter((t) => t.id !== cleanId);
      writeDownloadIndex([savedTrack, ...existing]);

      sendDownloadProgress({ videoId: cleanId, percent: 100, status: 'completed' });
      return savedTrack;
    } catch (err) {
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch {
          // ignore cleanup error
        }
      }
      const message = err instanceof Error ? err.message : 'Download failed';
      sendDownloadProgress({ videoId: cleanId, percent: 0, status: 'error', error: message });
      throw err;
    }
  });

  ipcMain.handle('karaoke:downloads:delete', async (_event, videoId: string) => {
    const cleanId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
    const filePath = path.join(getDownloadsDir(), `${cleanId}.mp4`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    const updated = readDownloadIndex().filter((t) => t.id !== cleanId);
    writeDownloadIndex(updated);
    return true;
  });

  ipcMain.handle('karaoke:update:check', async (): Promise<AppUpdateState> => {
    if (!app.isPackaged) {
      // Unpacked dev mode: check GitHub API directly without touching autoUpdater
      try {
        const res = await fetch(
          'https://api.github.com/repos/sadeeshasathsara/karaokepitch-studio/releases/latest',
          { headers: { Accept: 'application/vnd.github+json' } }
        );
        if (res.ok) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = (await res.json()) as any;
          const latest = String(data.tag_name || '').replace(/^v/i, '');
          const state: AppUpdateState =
            latest && latest !== app.getVersion()
              ? {
                  status: 'available',
                  currentVersion: app.getVersion(),
                  latestVersion: latest,
                  releaseUrl: data.html_url || GITHUB_RELEASES_URL,
                }
              : { status: 'up-to-date', currentVersion: app.getVersion(), latestVersion: latest };
          sendUpdateState(state);
          return state;
        }
      } catch {
        // fall through
      }
      return currentUpdateState;
    }

    try {
      await autoUpdater.checkForUpdates();
    } catch {
      // error event already emitted
    }
    return currentUpdateState;
  });

  ipcMain.handle('karaoke:update:install', async () => {
    if (currentUpdateState.status === 'downloaded' && app.isPackaged) {
      autoUpdater.quitAndInstall(false, true);
    } else {
      await shell.openExternal(currentUpdateState.releaseUrl || GITHUB_RELEASES_URL);
    }
  });
}

function createWindow(): void {
  const iconPath = path.join(__dirname, '../build/icon.png');
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 380,
    minHeight: 620,
    backgroundColor: '#0D0E11',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    titleBarStyle: 'default',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadURL(`http://127.0.0.1:${proxyPort}/`);
  }
}

app.whenReady().then(async () => {
  await startLocalMediaServer();
  setupAutoUpdater();
  registerIpcHandlers();
  createWindow();
  // Warm the YouTube client in the background (saves ~1s on first search/play)
  void getYouTubeClient().catch(() => undefined);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (proxyServer) {
    proxyServer.close();
    proxyServer = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
