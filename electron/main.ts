import { app, BrowserWindow, ipcMain } from 'electron';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { extractStreams, searchKaraokeVideos } from './youtube';
import type { DownloadProgress, KaraokeTrack, StreamBundle } from './types';

let mainWindow: BrowserWindow | null = null;
let proxyServer: http.Server | null = null;
let proxyPort = 0;

// In-memory token -> remote stream URL map so the renderer never leaks raw signed URLs
const streamUrlMap = new Map<string, string>();

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
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  streamUrlMap.set(token, remoteUrl);
  // Keep map bounded
  if (streamUrlMap.size > 120) {
    const firstKey = streamUrlMap.keys().next().value;
    if (firstKey) streamUrlMap.delete(firstKey);
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

      // 2. Proxied remote YouTube stream with Range forwarding
      if (urlPath.startsWith('/proxy/')) {
        const token = urlPath.slice('/proxy/'.length);
        const targetUrl = streamUrlMap.get(token);
        if (!targetUrl) {
          res.writeHead(404);
          res.end('Stream token expired');
          return;
        }

        try {
          const headers: Record<string, string> = {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          };
          if (req.headers.range) {
            headers['Range'] = req.headers.range;
          }

          const upstream = await fetch(targetUrl, { headers });
          const responseHeaders: Record<string, string> = {
            'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
            'Accept-Ranges': upstream.headers.get('accept-ranges') || 'bytes',
          };
          const contentLength = upstream.headers.get('content-length');
          if (contentLength) responseHeaders['Content-Length'] = contentLength;
          const contentRange = upstream.headers.get('content-range');
          if (contentRange) responseHeaders['Content-Range'] = contentRange;

          res.writeHead(upstream.status, responseHeaders);

          if (!upstream.body) {
            res.end();
            return;
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const nodeStream = Readable.fromWeb(upstream.body as any);
          nodeStream.on('error', () => {
            if (!res.headersSent) res.writeHead(502);
            res.end();
          });
          req.on('close', () => {
            nodeStream.destroy();
          });
          nodeStream.pipe(res);
        } catch (err) {
          if (!res.headersSent) res.writeHead(502);
          res.end(`Proxy error: ${err instanceof Error ? err.message : 'unknown'}`);
        }
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

function registerIpcHandlers(): void {
  ipcMain.handle('karaoke:search', async (_event, query: string) => {
    return searchKaraokeVideos(query);
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
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 380,
    minHeight: 620,
    backgroundColor: '#0D0E11',
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
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  await startLocalMediaServer();
  registerIpcHandlers();
  createWindow();

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
