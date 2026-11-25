import type { KaraokeTrack, TrackSettings } from '@/types/karaoke';

const SETTINGS_KEY = 'karaokepitch.trackSettings.v1';
const RECENTS_KEY = 'karaokepitch.recents.v1';

export const DEFAULT_TRACK_SETTINGS: TrackSettings = {
  pitchSemitones: 0,
  audioOffsetMs: 0,
  tempo: 1.0,
};

function safeReadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getTrackSettings(videoId: string): TrackSettings {
  const map = safeReadJson<Record<string, TrackSettings>>(SETTINGS_KEY, {});
  return { ...DEFAULT_TRACK_SETTINGS, ...(map[videoId] || {}) };
}

export function saveTrackSettings(videoId: string, settings: TrackSettings): void {
  const map = safeReadJson<Record<string, TrackSettings>>(SETTINGS_KEY, {});
  map[videoId] = settings;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

export function getRecentTracks(): KaraokeTrack[] {
  return safeReadJson<KaraokeTrack[]>(RECENTS_KEY, []);
}

export function addRecentTrack(track: KaraokeTrack): KaraokeTrack[] {
  const existing = getRecentTracks().filter((t) => t.id !== track.id);
  const updated = [track, ...existing].slice(0, 12);
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(updated));
  } catch {
    // ignore quota errors
  }
  return updated;
}
