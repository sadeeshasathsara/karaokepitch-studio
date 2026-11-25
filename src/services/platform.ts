import { Capacitor } from '@capacitor/core';
import type { DownloadProgress, KaraokeBridgeAPI, KaraokeTrack } from '@/types/karaoke';
import {
  deleteDownloadAndroid,
  downloadTrackAndroid,
  getStreamBundleAndroid,
  listDownloadsAndroid,
  searchKaraokeAndroid,
} from './youtubeWeb';

const progressListeners = new Set<(p: DownloadProgress) => void>();

function emitProgress(p: DownloadProgress) {
  progressListeners.forEach((cb) => cb(p));
}

export function getPlatformAPI(): KaraokeBridgeAPI {
  if (typeof window !== 'undefined' && window.karaokeAPI) {
    return window.karaokeAPI;
  }

  return {
    platform: Capacitor.isNativePlatform() ? 'android' : 'web',
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
  };
}
