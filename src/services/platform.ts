import { Capacitor } from '@capacitor/core';
import type { AppUpdateState, DownloadProgress, KaraokeBridgeAPI, KaraokeTrack } from '@/types/karaoke';
import {
  deleteDownloadAndroid,
  downloadTrackAndroid,
  getStreamBundleAndroid,
  listDownloadsAndroid,
  searchKaraokeAndroid,
} from './youtubeWeb';

const APP_VERSION = '1.1.0';
const GITHUB_LATEST_RELEASE_API =
  'https://api.github.com/repos/sadeeshasathsara/karaokepitch-studio/releases/latest';

const progressListeners = new Set<(p: DownloadProgress) => void>();
const updateListeners = new Set<(s: AppUpdateState) => void>();

function emitProgress(p: DownloadProgress) {
  progressListeners.forEach((cb) => cb(p));
}

function emitUpdateState(s: AppUpdateState) {
  updateListeners.forEach((cb) => cb(s));
}

function isNewerVersion(latest: string, current: string): boolean {
  const a = latest.replace(/^v/i, '').split('.').map(Number);
  const b = current.replace(/^v/i, '').split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff > 0) return true;
    if (diff < 0) return false;
  }
  return false;
}

let lastReleaseUrl = 'https://github.com/sadeeshasathsara/karaokepitch-studio/releases/latest';

async function checkGitHubRelease(): Promise<AppUpdateState> {
  emitUpdateState({ status: 'checking', currentVersion: APP_VERSION });
  try {
    const res = await fetch(GITHUB_LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    const tag: string = (data.tag_name || '').replace(/^v/i, '');
    // Prefer direct APK asset URL on Android
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apkAsset = (data.assets || []).find((a: any) =>
      typeof a.name === 'string' && a.name.endsWith('.apk')
    );
    lastReleaseUrl =
      (Capacitor.isNativePlatform() && apkAsset?.browser_download_url) ||
      data.html_url ||
      lastReleaseUrl;

    const state: AppUpdateState = isNewerVersion(tag, APP_VERSION)
      ? {
          status: 'available',
          currentVersion: APP_VERSION,
          latestVersion: tag,
          releaseUrl: lastReleaseUrl,
        }
      : {
          status: 'up-to-date',
          currentVersion: APP_VERSION,
          latestVersion: tag || APP_VERSION,
        };
    emitUpdateState(state);
    return state;
  } catch (err) {
    const state: AppUpdateState = {
      status: 'error',
      currentVersion: APP_VERSION,
      message: err instanceof Error ? err.message : 'Update check failed',
    };
    emitUpdateState(state);
    return state;
  }
}

export function getPlatformAPI(): KaraokeBridgeAPI {
  if (typeof window !== 'undefined' && window.karaokeAPI) {
    return window.karaokeAPI;
  }

  return {
    platform: Capacitor.isNativePlatform() ? 'android' : 'web',
    appVersion: APP_VERSION,
    searchKaraoke: (query: string) => searchKaraokeAndroid(query),
    getStreamBundle: (videoId: string) => getStreamBundleAndroid(videoId),
    listDownloads: () => listDownloadsAndroid(),
    downloadTrack: (track: KaraokeTrack) => downloadTrackAndroid(track, emitProgress),
    deleteDownload: (videoId: string) => deleteDownloadAndroid(videoId),
    onDownloadProgress: (cb: (p: DownloadProgress) => void) => {
      progressListeners.add(cb);
      return () => {
        progressListeners.delete(cb);
      };
    },
    checkForUpdates: () => checkGitHubRelease(),
    installUpdate: async () => {
      window.open(lastReleaseUrl, '_blank');
    },
    onUpdateState: (cb: (s: AppUpdateState) => void) => {
      updateListeners.add(cb);
      return () => {
        updateListeners.delete(cb);
      };
    },
  };
}
