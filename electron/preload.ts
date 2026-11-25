import { contextBridge, ipcRenderer } from 'electron';
import type { AppUpdateState, DownloadProgress, KaraokeBridgeAPI, KaraokeTrack } from './types';

const api: KaraokeBridgeAPI = {
  platform: 'electron',
  appVersion: '1.2.1',
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
  checkForUpdates: () => ipcRenderer.invoke('karaoke:update:check'),
  installUpdate: () => ipcRenderer.invoke('karaoke:update:install'),
  onUpdateState: (cb: (state: AppUpdateState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: AppUpdateState) => cb(data);
    ipcRenderer.on('karaoke:update:state', listener);
    return () => {
      ipcRenderer.removeListener('karaoke:update:state', listener);
    };
  },
};

contextBridge.exposeInMainWorld('karaokeAPI', api);
