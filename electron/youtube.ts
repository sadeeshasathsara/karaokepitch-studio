import { Innertube, UniversalCache } from 'youtubei.js';
import type { KaraokeTrack } from './types';

let ytInstance: Innertube | null = null;

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

export function normalizeKaraokeQuery(rawQuery: string): string {
  const trimmed = rawQuery.trim();
  if (!trimmed) return 'karaoke songs with lyrics';
  const lower = trimmed.toLowerCase();
  const hasKaraokeTerm = KARAOKE_KEYWORDS.some((kw) => lower.includes(kw));
  return hasKaraokeTerm ? trimmed : `${trimmed} karaoke`;
}

export function isLikelyKaraoke(title: string, channel: string): boolean {
  const combined = `${title} ${channel}`.toLowerCase();
  return KARAOKE_KEYWORDS.some((kw) => combined.includes(kw));
}

export async function getYouTubeClient(): Promise<Innertube> {
  if (!ytInstance) {
    ytInstance = await Innertube.create({
      cache: new UniversalCache(false),
      generate_session_locally: true,
    });
  }
  return ytInstance;
}

function parseDurationToSeconds(text: string): number {
  if (!text) return 0;
  const parts = text.split(':').map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

export async function searchKaraokeVideos(query: string): Promise<KaraokeTrack[]> {
  const yt = await getYouTubeClient();
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

    // Skip livestreams and very short clips (< 45s) or ultra-long compilations (> 18 min)
    if (video.is_live || (durationSec > 0 && (durationSec < 45 || durationSec > 1080))) {
      continue;
    }

    if (!isLikelyKaraoke(title, channel)) {
      continue;
    }

    const thumbs = video.thumbnails || video.best_thumbnail ? [video.best_thumbnail, ...(video.thumbnails || [])].filter(Boolean) : [];
    const thumbnail: string =
      thumbs[0]?.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

    const viewsText: string | undefined =
      video.short_view_count?.text || video.view_count?.text || undefined;
    const publishedText: string | undefined = video.published?.text || undefined;

    seen.add(id);
    tracks.push({
      id,
      title,
      channel,
      durationText: durationText || '0:00',
      durationSec,
      thumbnail,
      viewsText,
      publishedText,
      isOffline: false,
    });

    if (tracks.length >= 24) break;
  }

  return tracks;
}

export interface ExtractedStreams {
  videoId: string;
  videoUrl: string;
  audioUrl: string;
  muxedUrl?: string;
  qualityLabel: string;
  audioBitrateKbps?: number;
}

export async function extractStreams(videoId: string): Promise<ExtractedStreams> {
  const yt = await getYouTubeClient();
  const info = await yt.getBasicInfo(videoId, { client: 'ANDROID' }).catch(() => yt.getBasicInfo(videoId));

  const streaming = info.streaming_data;
  if (!streaming) {
    throw new Error('No streaming data available for this karaoke track.');
  }

  const allFormats = [...(streaming.formats || [])];
  const adaptiveFormats = [...(streaming.adaptive_formats || [])];

  // Decipher helper
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

  // Pick best muxed MP4 (great for downloads and guaranteed fallback)
  const muxedCandidates = allFormats
    .filter((f) => f.has_video && f.has_audio && (f.mime_type?.includes('mp4') ?? true))
    .sort((a, b) => (b.height || 0) - (a.height || 0));

  const bestMuxed = muxedCandidates[0];
  const muxedUrl = await resolveUrl(bestMuxed);

  // Pick best adaptive audio (prefer high-bitrate opus/m4a for crystal-clear pitch shifting)
  const audioCandidates = adaptiveFormats
    .filter((f) => f.has_audio && !f.has_video)
    .sort((a, b) => {
      const aMp4 = a.mime_type?.includes('audio/mp4') ? 1 : 0;
      const bMp4 = b.mime_type?.includes('audio/mp4') ? 1 : 0;
      // Prefer highest bitrate; slight tie-break toward audio/mp4 or webm/opus
      const bitrateDiff = (b.bitrate || 0) - (a.bitrate || 0);
      if (Math.abs(bitrateDiff) > 20000) return bitrateDiff;
      return bMp4 - aMp4;
    });

  // Pick crisp adaptive video (prefer 720p/1080p MP4 H.264 for fast hardware decoding)
  const videoCandidates = adaptiveFormats
    .filter(
      (f) =>
        f.has_video &&
        !f.has_audio &&
        (f.height || 0) <= 1080 &&
        (f.mime_type?.includes('video/mp4') || f.mime_type?.includes('video/webm'))
    )
    .sort((a, b) => {
      const aTarget = Math.abs((a.height || 0) - 720);
      const bTarget = Math.abs((b.height || 0) - 720);
      const aMp4 = a.mime_type?.includes('avc1') ? -100 : 0;
      const bMp4 = b.mime_type?.includes('avc1') ? -100 : 0;
      return aTarget + aMp4 - (bTarget + bMp4);
    });

  const bestAudio = audioCandidates[0];
  const bestVideo = videoCandidates[0];

  const adaptiveAudioUrl = await resolveUrl(bestAudio);
  const adaptiveVideoUrl = await resolveUrl(bestVideo);

  if (adaptiveAudioUrl && adaptiveVideoUrl) {
    return {
      videoId,
      videoUrl: adaptiveVideoUrl,
      audioUrl: adaptiveAudioUrl,
      muxedUrl: muxedUrl || undefined,
      qualityLabel: bestVideo?.quality_label || `${bestVideo?.height || 720}p`,
      audioBitrateKbps: bestAudio?.bitrate ? Math.round(bestAudio.bitrate / 1000) : 128,
    };
  }

  if (muxedUrl) {
    return {
      videoId,
      videoUrl: muxedUrl,
      audioUrl: muxedUrl,
      muxedUrl,
      qualityLabel: bestMuxed?.quality_label || `${bestMuxed?.height || 360}p`,
      audioBitrateKbps: bestMuxed?.bitrate ? Math.round(bestMuxed.bitrate / 1000) : 96,
    };
  }

  throw new Error('Could not resolve playable karaoke streams for this video.');
}
