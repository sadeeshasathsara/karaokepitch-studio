import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import type { DownloadProgress, KaraokeTrack, StreamBundle } from '@/types/karaoke';

const DOWNLOADS_META_KEY = 'karaokepitch.android.downloads.v1';

const KARAOKE_KEYWORDS = [
  'karaoke',
  'instrumental',
  'minus one',
  'backing track',
  'sing along',
  'sing-along',
  'no vocals',
  'without vocals',
  'karafun',
  'sing king',
  'acoustic karaoke',
  'piano karaoke',
  'lyric karaoke',
  'lyrics karaoke',
  'karaokê',
];

function normalizeKaraokeQuery(rawQuery: string): string {
  const trimmed = rawQuery.trim();
  if (!trimmed) return 'karaoke songs with lyrics';
  const lower = trimmed.toLowerCase();
  return KARAOKE_KEYWORDS.some((kw) => lower.includes(kw)) ? trimmed : `${trimmed} karaoke`;
}

function isLikelyKaraoke(title: string, channel: string): boolean {
  const combined = `${title} ${channel}`.toLowerCase();
  return KARAOKE_KEYWORDS.some((kw) => combined.includes(kw));
}

function parseDurationToSeconds(text: string): number {
  if (!text) return 0;
  const parts = text.split(':').map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

// Lazy-load youtubei.js browser bundle so initial render stays fast
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let webYtClient: any = null;

async function getWebInnertube() {
  if (!webYtClient) {
    const mod = await import('youtubei.js/web');
    webYtClient = await mod.Innertube.create({
      fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
      generate_session_locally: true,
    });
  }
  return webYtClient;
}

export async function searchKaraokeAndroid(query: string): Promise<KaraokeTrack[]> {
  const yt = await getWebInnertube();
  const scopedQuery = normalizeKaraokeQuery(query);
  const results = await yt.search(scopedQuery, { type: 'video' });

  const tracks: KaraokeTrack[] = [];
  const seen = new Set<string>();

  for (const item of results.videos ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const video = item as any;
    const id: string | undefined = video.id || video.video_id;
    if (!id || seen.has(id)) continue;

    const title: string =
      typeof video.title?.toString === 'function'
        ? video.title.toString()
        : video.title?.text || '';
    const channel: string =
      video.author?.name ||
      (typeof video.author?.toString === 'function' ? video.author.toString() : '') ||
      'Unknown Channel';
    const durationText: string =
      video.duration?.text ||
      (typeof video.length_text?.toString === 'function' ? video.length_text.toString() : '') ||
      '';
    const durationSec: number =
      typeof video.duration?.seconds === 'number'
        ? video.duration.seconds
        : parseDurationToSeconds(durationText);

    if (video.is_live || (durationSec > 0 && (durationSec < 45 || durationSec > 1080))) {
      continue;
    }
    if (!isLikelyKaraoke(title, channel)) continue;

    const thumbs = [video.best_thumbnail, ...(video.thumbnails || [])].filter(Boolean);
    const thumbnail = thumbs[0]?.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

    seen.add(id);
    tracks.push({
      id,
      title,
      channel,
      durationText: durationText || '0:00',
      durationSec,
      thumbnail,
      viewsText: video.short_view_count?.text || video.view_count?.text || undefined,
      publishedText: video.published?.text || undefined,
      isOffline: false,
    });
    if (tracks.length >= 24) break;
  }

  return tracks;
}

function readLocalDownloadsMeta(): KaraokeTrack[] {
  try {
    const raw = localStorage.getItem(DOWNLOADS_META_KEY);
    return raw ? (JSON.parse(raw) as KaraokeTrack[]) : [];
  } catch {
    return [];
  }
}

function writeLocalDownloadsMeta(tracks: KaraokeTrack[]): void {
  try {
    localStorage.setItem(DOWNLOADS_META_KEY, JSON.stringify(tracks));
  } catch {
    // ignore
  }
}

export async function listDownloadsAndroid(): Promise<KaraokeTrack[]> {
  return readLocalDownloadsMeta();
}

export async function getStreamBundleAndroid(videoId: string): Promise<StreamBundle> {
  const cleanId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');

  // Check offline file first on native Capacitor
  if (Capacitor.isNativePlatform()) {
    try {
      const filePath = `karaoke/${cleanId}.mp4`;
      const uriRes = await Filesystem.getUri({
        path: filePath,
        directory: Directory.Data,
      });
      await Filesystem.stat({ path: filePath, directory: Directory.Data });
      const localUrl = Capacitor.convertFileSrc(uriRes.uri);
      return {
        videoId: cleanId,
        videoUrl: localUrl,
        audioUrl: localUrl,
        muxedUrl: localUrl,
        qualityLabel: 'Offline HD',
        isOffline: true,
      };
    } catch {
      // Not downloaded yet, fall through to online stream
    }
  }

  const remote = await resolveRemoteStreams(cleanId);

  // Android WebView cannot run Web Audio on YouTube's cross-origin stream (it comes out silent),
  // so download the (small) audio track into the app cache first, then pitch-shift the local file.
  // The video stays a muted remote stream just for the lyrics.
  if (Capacitor.isNativePlatform()) {
    try {
      const audioSource = remote.audioUrl && remote.audioExt ? remote : null;
      if (audioSource && audioSource.audioUrl) {
        const localAudio = await ensureCachedFile(cleanId, audioSource.audioUrl, audioSource.audioExt as string);
        return {
          videoId: cleanId,
          videoUrl: remote.videoUrl,
          audioUrl: localAudio,
          muxedUrl: remote.muxedUrl,
          qualityLabel: remote.qualityLabel,
          audioBitrateKbps: remote.audioBitrateKbps,
          isOffline: false,
        };
      }
      if (remote.muxedUrl) {
        // No separate audio track available: cache the muxed file and use it for both
        const localMuxed = await ensureCachedFile(cleanId, remote.muxedUrl, 'mp4');
        return {
          videoId: cleanId,
          videoUrl: localMuxed,
          audioUrl: localMuxed,
          muxedUrl: localMuxed,
          qualityLabel: remote.qualityLabel,
          isOffline: false,
        };
      }
    } catch (err) {
      console.warn('[Android] audio cache failed, falling back to direct stream:', err);
    }
  }

  return {
    videoId: cleanId,
    videoUrl: remote.videoUrl,
    audioUrl: remote.audioUrl || remote.videoUrl,
    muxedUrl: remote.muxedUrl,
    qualityLabel: remote.qualityLabel,
    audioBitrateKbps: remote.audioBitrateKbps,
    isOffline: false,
  };
}

interface RemoteStreams {
  videoUrl: string;
  audioUrl: string | null; // separate audio-only track (null if only muxed is available)
  audioExt: string | null;
  muxedUrl?: string;
  qualityLabel: string;
  audioBitrateKbps?: number;
}

async function resolveRemoteStreams(cleanId: string): Promise<RemoteStreams> {
  const yt = await getWebInnertube();
  const info = await yt.getBasicInfo(cleanId, { client: 'ANDROID' }).catch(() => yt.getBasicInfo(cleanId));
  const streaming = info.streaming_data;
  if (!streaming) {
    throw new Error('No streaming data found for this karaoke video.');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolveUrl = async (fmt: any): Promise<string | null> => {
    if (!fmt) return null;
    if (fmt.url) return fmt.url;
    if (typeof fmt.decipher === 'function') {
      try {
        return await fmt.decipher(yt.session.player);
      } catch {
        return null;
      }
    }
    return null;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formats: any[] = [...(streaming.formats || [])];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adaptive: any[] = [...(streaming.adaptive_formats || [])];

  const bestMuxed = formats
    .filter((f) => f.has_video && f.has_audio)
    .sort((a, b) => (b.height || 0) - (a.height || 0))[0];

  // Prefer AAC (audio/mp4): best WebView support and small (~3-4 MB per song)
  const audioOnly = adaptive.filter((f) => f.has_audio && !f.has_video);
  const mp4Audio = audioOnly
    .filter((f) => String(f.mime_type || '').includes('audio/mp4'))
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
  const bestAudio = mp4Audio || audioOnly.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
  const audioExt = bestAudio ? (String(bestAudio.mime_type || '').includes('audio/mp4') ? 'm4a' : 'webm') : null;

  const bestVideo = adaptive
    .filter((f) => f.has_video && !f.has_audio && (f.height || 0) <= 720)
    .sort((a, b) => (b.height || 0) - (a.height || 0))[0];

  const muxedUrl = (await resolveUrl(bestMuxed)) || undefined;
  const audioUrl = await resolveUrl(bestAudio);
  const videoUrl = await resolveUrl(bestVideo);

  if (videoUrl && audioUrl) {
    return {
      videoUrl,
      audioUrl,
      audioExt,
      muxedUrl,
      qualityLabel: bestVideo?.quality_label || `${bestVideo?.height || 720}p`,
      audioBitrateKbps: bestAudio?.bitrate ? Math.round(bestAudio.bitrate / 1000) : 128,
    };
  }

  if (muxedUrl) {
    return {
      videoUrl: muxedUrl,
      audioUrl: audioUrl,
      audioExt: audioUrl ? audioExt : null,
      muxedUrl,
      qualityLabel: bestMuxed?.quality_label || '360p',
    };
  }

  throw new Error('Unable to resolve playable karaoke streams.');
}

// --- Android: "Preparing audio" cache (download first, then pitch-shift the local file) ---

const prepareListeners = new Set<(videoId: string, percent: number | null) => void>();

export function onPrepareProgress(cb: (videoId: string, percent: number | null) => void): () => void {
  prepareListeners.add(cb);
  return () => {
    prepareListeners.delete(cb);
  };
}

function emitPrepare(videoId: string, percent: number | null) {
  prepareListeners.forEach((cb) => cb(videoId, percent));
}

const YT_ANDROID_UA = 'com.google.android.youtube/19.29.37 (Linux; U; Android 11) gzip';

async function ensureCachedFile(cleanId: string, url: string, ext: string): Promise<string> {
  const finalPath = `audiocache/${cleanId}.${ext}`;
  const partPath = `audiocache/${cleanId}.${ext}.part`;

  // Reuse a previously cached file (instant replays)
  try {
    await Filesystem.stat({ path: finalPath, directory: Directory.Cache });
    const uri = await Filesystem.getUri({ path: finalPath, directory: Directory.Cache });
    emitPrepare(cleanId, null);
    return Capacitor.convertFileSrc(uri.uri);
  } catch {
    // not cached yet
  }

  await Filesystem.mkdir({ path: 'audiocache', directory: Directory.Cache, recursive: true }).catch(() => undefined);

  emitPrepare(cleanId, 0);
  const listener = await Filesystem.addListener('progress', (evt) => {
    if (evt.url === url && evt.contentLength > 0) {
      emitPrepare(cleanId, Math.min(99, Math.round((evt.bytes / evt.contentLength) * 100)));
    }
  });

  try {
    await Filesystem.downloadFile({
      url,
      path: partPath,
      directory: Directory.Cache,
      recursive: true,
      progress: true,
      headers: { 'User-Agent': YT_ANDROID_UA },
    });
    await Filesystem.rename({
      from: partPath,
      to: finalPath,
      directory: Directory.Cache,
      toDirectory: Directory.Cache,
    });
  } catch (err) {
    await Filesystem.deleteFile({ path: partPath, directory: Directory.Cache }).catch(() => undefined);
    emitPrepare(cleanId, null);
    throw err;
  } finally {
    await listener.remove();
  }

  emitPrepare(cleanId, null);
  const uri = await Filesystem.getUri({ path: finalPath, directory: Directory.Cache });
  return Capacitor.convertFileSrc(uri.uri);
}

export async function downloadTrackAndroid(
  track: KaraokeTrack,
  onProgress: (p: DownloadProgress) => void
): Promise<KaraokeTrack> {
  const cleanId = track.id.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Offline downloads are available in the Windows (.exe) and Android (.apk) apps.');
  }

  try {
    onProgress({ videoId: cleanId, percent: 5, status: 'downloading' });
    const bundle = await resolveRemoteStreams(cleanId);
    const targetUrl = bundle.muxedUrl || bundle.videoUrl;

    await Filesystem.mkdir({
      path: 'karaoke',
      directory: Directory.Data,
      recursive: true,
    }).catch(() => undefined);

    const listener = await Filesystem.addListener('progress', (evt) => {
      if (evt.contentLength > 0) {
        const pct = Math.min(99, Math.round((evt.bytes / evt.contentLength) * 100));
        onProgress({ videoId: cleanId, percent: pct, status: 'downloading' });
      }
    });

    try {
      await Filesystem.downloadFile({
        url: targetUrl,
        path: `karaoke/${cleanId}.mp4`,
        directory: Directory.Data,
        progress: true,
      });
    } finally {
      await listener.remove();
    }

    const stat = await Filesystem.stat({
      path: `karaoke/${cleanId}.mp4`,
      directory: Directory.Data,
    });

    const savedTrack: KaraokeTrack = {
      ...track,
      id: cleanId,
      isOffline: true,
      localFileSize: stat.size,
      downloadedAt: Date.now(),
    };

    const existing = readLocalDownloadsMeta().filter((t) => t.id !== cleanId);
    writeLocalDownloadsMeta([savedTrack, ...existing]);
    onProgress({ videoId: cleanId, percent: 100, status: 'completed' });
    return savedTrack;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Download failed';
    onProgress({ videoId: cleanId, percent: 0, status: 'error', error: message });
    throw err;
  }
}

export async function deleteDownloadAndroid(videoId: string): Promise<boolean> {
  const cleanId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (Capacitor.isNativePlatform()) {
    await Filesystem.deleteFile({
      path: `karaoke/${cleanId}.mp4`,
      directory: Directory.Data,
    }).catch(() => undefined);
  }
  const updated = readLocalDownloadsMeta().filter((t) => t.id !== cleanId);
  writeLocalDownloadsMeta(updated);
  return true;
}
