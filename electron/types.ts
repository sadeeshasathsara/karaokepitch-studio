export interface KaraokeTrack {
  id: string;
  title: string;
  channel: string;
  durationText: string;
  durationSec: number;
  thumbnail: string;
  viewsText?: string;
  publishedText?: string;
  isOffline?: boolean;
  localFileSize?: number;
  downloadedAt?: number;
}

export interface StreamBundle {
  videoId: string;
  videoUrl: string;
  audioUrl: string;
  muxedUrl?: string;
  qualityLabel: string;
  audioBitrateKbps?: number;
  isOffline: boolean;
}

export interface DownloadProgress {
  videoId: string;
  percent: number;
  status: 'downloading' | 'completed' | 'error';
  error?: string;
}

export interface KaraokeBridgeAPI {
  platform: 'electron' | 'android' | 'web';
  searchKaraoke: (query: string, category?: string) => Promise<KaraokeTrack[]>;
  getStreamBundle: (videoId: string) => Promise<StreamBundle>;
  listDownloads: () => Promise<KaraokeTrack[]>;
  downloadTrack: (track: KaraokeTrack) => Promise<KaraokeTrack>;
  deleteDownload: (videoId: string) => Promise<boolean>;
  onDownloadProgress: (cb: (progress: DownloadProgress) => void) => () => void;
}
