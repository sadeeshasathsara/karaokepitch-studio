import type { KaraokeTrack, TrackSettings } from '@/types/karaoke';

const GLOBAL_SETTINGS_KEY = 'karaokepitch.globalSettings.v1';
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

export function getGlobalSettings(): TrackSettings {
  const saved = safeReadJson<Partial<TrackSettings>>(GLOBAL_SETTINGS_KEY, {});
  return { ...DEFAULT_TRACK_SETTINGS, ...saved };
}

export function saveGlobalSettings(settings: TrackSettings): void {
  try {
    localStorage.setItem(GLOBAL_SETTINGS_KEY, JSON.stringify(settings));
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
