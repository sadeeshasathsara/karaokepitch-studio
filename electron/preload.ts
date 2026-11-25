import { contextBridge, ipcRenderer } from 'electron';
import type { DownloadProgress, KaraokeBridgeAPI, KaraokeTrack } from './types';

const api: KaraokeBridgeAPI = {
  platform: 'electron',
  searchKaraoke: (query: string, category?: string) =>
    ipcRenderer.invoke('karaoke:search', query, category),
  getStreamBundle: (videoId: string) =>
    ipcRenderer.invoke('karaoke:streams', videoId),
  listDownloads: () => ipcRenderer.invoke('karaoke:downloads:list'),
  downloadTrack: (track: KaraokeTrack) =>
    ipcRenderer.invoke('karaoke:downloads:start', track),
  deleteDownload: (videoId: string) =>
    ipcRenderer.invoke('karaoke:downloads:delete', videoId),
  onDownloadProgress: (cb: (progress: DownloadProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: DownloadProgress) => cb(data);
    ipcRenderer.on('karaoke:downloads:progress', listener);
    return () => {
      ipcRenderer.removeListener('karaoke:downloads:progress', listener);
    };
  },
};

contextBridge.exposeInMainWorld('karaokeAPI', api);
