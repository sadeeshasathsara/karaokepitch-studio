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

  const bestAudio = adaptive
    .filter((f) => f.has_audio && !f.has_video)
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

  const bestVideo = adaptive
    .filter((f) => f.has_video && !f.has_audio && (f.height || 0) <= 720)
    .sort((a, b) => (b.height || 0) - (a.height || 0))[0];

  const muxedUrl = await resolveUrl(bestMuxed);
  const audioUrl = await resolveUrl(bestAudio);
  const videoUrl = await resolveUrl(bestVideo);

  if (videoUrl && audioUrl) {
    return {
      videoId: cleanId,
      videoUrl,
      audioUrl,
      muxedUrl: muxedUrl || undefined,
      qualityLabel: bestVideo?.quality_label || `${bestVideo?.height || 720}p`,
      audioBitrateKbps: bestAudio?.bitrate ? Math.round(bestAudio.bitrate / 1000) : 128,
      isOffline: false,
    };
  }

  if (muxedUrl) {
    return {
      videoId: cleanId,
      videoUrl: muxedUrl,
      audioUrl: muxedUrl,
      muxedUrl,
      qualityLabel: bestMuxed?.quality_label || '360p',
      isOffline: false,
    };
  }

  throw new Error('Unable to resolve playable karaoke streams.');
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
    const bundle = await getStreamBundleAndroid(cleanId);
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
