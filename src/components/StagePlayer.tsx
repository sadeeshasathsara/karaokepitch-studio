import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
  Loader2,
  AlertCircle,
  Minus,
  Plus,
  ArrowLeft,
  ArrowRight,
  Cpu,
  WifiOff,
  Music,
  SlidersHorizontal,
  ListMusic,
  Download,
  CheckCircle2,
} from 'lucide-react';
import type { DownloadProgress, KaraokeTrack, StreamBundle, TrackSettings } from '@/types/karaoke';
import type { PitchEngineMode } from '@/audio/pitchEngine';
import { StudioConsole } from './StudioConsole';

type StageDockTab = 'settings' | 'upnext';

interface StagePlayerProps {
  visible: boolean;
  track: KaraokeTrack | null;
  upNextTracks: KaraokeTrack[];
  streamBundle: StreamBundle | null;
  isLoadingStream: boolean;
  streamError: string | null;
  settings: TrackSettings;
  engineMode: PitchEngineMode;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  downloadedIds: Set<string>;
  downloadProgressMap: Record<string, DownloadProgress>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onTogglePlay: () => void;
  onSeek: (timeSec: number) => void;
  onChangePitch: (semitones: number) => void;
  onChangeOffset: (offsetMs: number) => void;
  onChangeTempo: (tempo: number) => void;
  onChangeVolume: (vol: number) => void;
  onToggleMute: () => void;
  onPlayTrack: (track: KaraokeTrack) => void;
  onDownloadTrack: (track: KaraokeTrack) => void;
  onRetryStream: () => void;
  onGoDiscover: () => void;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const StagePlayer: React.FC<StagePlayerProps> = ({
  visible,
  track,
  upNextTracks,
  streamBundle,
  isLoadingStream,
  streamError,
  settings,
  engineMode,
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  downloadedIds,
  downloadProgressMap,
  videoRef,
  onTogglePlay,
  onSeek,
  onChangePitch,
  onChangeOffset,
  onChangeTempo,
  onChangeVolume,
  onToggleMute,
  onPlayTrack,
  onDownloadTrack,
  onRetryStream,
  onGoDiscover,
}) => {
  const stageBoxRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHud, setShowHud] = useState(true);
  const [dockTab, setDockTab] = useState<StageDockTab>('settings');
  const hudTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const bumpHud = () => {
    setShowHud(true);
    if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current);
    hudTimerRef.current = window.setTimeout(() => {
      if (isPlaying) setShowHud(false);
    }, 3200);
  };

  const toggleFullscreen = async () => {
    if (!stageBoxRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await stageBoxRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // ignore if fullscreen unavailable
    }
  };

  const clampPitch = (v: number) => Math.max(-12, Math.min(12, Math.round(v * 2) / 2));
  const clampOffset = (v: number) => Math.max(-2000, Math.min(2000, Math.round(v / 5) * 5));

  const isDownloaded = track ? downloadedIds.has(track.id) : false;
  const currentDownloadProgress = track ? downloadProgressMap[track.id] : undefined;

  return (
    <div className={visible ? 'block h-full overflow-y-auto' : 'hidden'}>
      {!track ? (
        <div className="h-full flex items-center justify-center p-6">
          <div className="rounded-xl bg-[#14161B] border border-white/[0.08] p-10 text-center max-w-md">
            <Music className="w-9 h-9 text-amber-400/80 mx-auto mb-3" />
            <h2 className="text-[16px] font-semibold text-[#F4F5F7]">Stage Ready</h2>
            <p className="text-[13px] text-[#7D8594] mt-1.5 mb-5">
              Select any YouTube karaoke track from Discover or your Offline Library to open the real-time pitch and sync console.
            </p>
            <button
              onClick={onGoDiscover}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0D0E11] text-[13px] font-semibold cursor-pointer transition-colors"
            >
              Find a Karaoke Track
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3 sm:p-4 md:p-6 max-w-6xl mx-auto space-y-4 pb-28 md:pb-8">
          {/* Track Header */}
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h1 className="text-[16px] sm:text-[18px] font-semibold tracking-tight text-[#F4F5F7] line-clamp-1">
                {track.title}
              </h1>
              <div className="text-[12.5px] text-[#7D8594] flex flex-wrap items-center gap-2 mt-0.5">
                <span>{track.channel}</span>
                {streamBundle && (
                  <>
                    <span>·</span>
                    <span className="font-mono-num text-[#B8BFC9]">
                      {streamBundle.qualityLabel}
                      {streamBundle.audioBitrateKbps ? ` · ${streamBundle.audioBitrateKbps} kbps` : ''}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {streamBundle?.isOffline && (
                <span className="px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold flex items-center gap-1.5">
                  <WifiOff className="w-3 h-3" />
                  Offline
                </span>
              )}
              <span
                className="px-2.5 py-1 rounded-md bg-[#161920] border border-white/[0.08] text-[#9CA3AF] text-[11px] font-mono-num flex items-center gap-1.5"
                title="Active real-time DSP pitch engine"
              >
                <Cpu className="w-3 h-3 text-amber-400" />
                {engineMode === 'signalsmith-wasm'
                  ? 'Signalsmith DSP'
                  : engineMode === 'worklet-fallback'
                  ? 'Worklet DSP'
                  : 'Direct Audio'}
              </span>
            </div>
          </div>

          {/* 16:9 Lyric Video Stage */}
          <div
            ref={stageBoxRef}
            onMouseMove={bumpHud}
            onTouchStart={bumpHud}
            className={`relative rounded-xl overflow-hidden bg-black border border-white/[0.1] shadow-2xl select-none ${
              isFullscreen
                ? 'w-screen h-screen rounded-none border-none flex items-center justify-center'
                : 'aspect-video w-full'
            }`}
          >
            {/* Muted Video Element (Lyrics Display) */}
            <video
              ref={videoRef}
              muted
              playsInline
              onClick={onTogglePlay}
              className="w-full h-full object-contain bg-black cursor-pointer"
              poster={track.thumbnail}
            />

            {/* Loading Overlay */}
            {isLoadingStream && (
              <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-center gap-2.5 z-20">
                <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
                <span className="text-[13px] text-[#D1D5DB] font-medium">
                  Loading high-quality karaoke stream...
                </span>
              </div>
            )}

            {/* Error Overlay */}
            {streamError && !isLoadingStream && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-6 text-center z-20">
                <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
                <p className="text-[14px] font-medium text-red-200 mb-1">Stream failed to load</p>
                <p className="text-[12px] text-[#9CA3AF] max-w-sm mb-4">{streamError}</p>
                <button
                  onClick={onRetryStream}
                  className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0D0E11] text-[12.5px] font-semibold cursor-pointer"
                >
                  Retry Stream
                </button>
              </div>
            )}

            {/* Transport & Fullscreen HUD Overlay */}
            <div
              className={`absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/55 to-transparent pt-10 pb-3 px-3.5 sm:px-4 transition-opacity duration-200 ${
                showHud || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              {/* Seek Bar */}
              <div className="flex items-center gap-2.5 mb-2">
                <span className="font-mono-num text-[11px] text-[#D1D5DB] w-10 text-right">
                  {formatTime(currentTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(duration, 1)}
                  step={0.1}
                  value={Math.min(currentTime, duration || 1)}
                  onChange={(e) => onSeek(Number(e.target.value))}
                  aria-label="Seek timeline"
                  className="studio-slider flex-1"
                />
                <span className="font-mono-num text-[11px] text-[#9CA3AF] w-10">
                  {formatTime(duration)}
                </span>
              </div>

              {/* Transport Controls + Fullscreen Quick Pitch/Sync */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    onClick={() => onSeek(Math.max(0, currentTime - 5))}
                    className="w-8 h-8 rounded-md bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
                    title="Back 5 seconds"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>
                  <button
                    onClick={onTogglePlay}
                    className="w-10 h-10 rounded-full bg-amber-500 hover:bg-amber-400 text-[#0D0E11] flex items-center justify-center cursor-pointer shadow-md"
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? (
                      <Pause className="w-4 h-4 fill-current" />
                    ) : (
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    )}
                  </button>
                  <button
                    onClick={() => onSeek(Math.min(duration || 0, currentTime + 5))}
                    className="w-8 h-8 rounded-md bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
                    title="Forward 5 seconds"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                </div>

                {/* Inline Pitch & Sync quick controls in Fullscreen */}
                {isFullscreen && (
                  <div className="flex items-center gap-2 bg-black/65 backdrop-blur-md border border-white/15 rounded-lg px-2.5 py-1">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onChangePitch(clampPitch(settings.pitchSemitones - 1))}
                        className="w-7 h-7 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="font-mono-num text-[12px] text-amber-300 px-1.5 min-w-[62px] text-center">
                        {settings.pitchSemitones > 0 ? `+${settings.pitchSemitones}` : settings.pitchSemitones} ST
                      </span>
                      <button
                        onClick={() => onChangePitch(clampPitch(settings.pitchSemitones + 1))}
                        className="w-7 h-7 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="w-px h-5 bg-white/15" />
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onChangeOffset(clampOffset(settings.audioOffsetMs - 25))}
                        className="w-7 h-7 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </button>
                      <span className="font-mono-num text-[12px] text-emerald-300 px-1.5 min-w-[62px] text-center">
                        {settings.audioOffsetMs > 0 ? `+${settings.audioOffsetMs}` : settings.audioOffsetMs}ms
                      </span>
                      <button
                        onClick={() => onChangeOffset(clampOffset(settings.audioOffsetMs + 25))}
                        className="w-7 h-7 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                <button
                  onClick={toggleFullscreen}
                  className="w-8 h-8 rounded-md bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
                  title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Stage'}
                >
                  {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* YouTube-Style Under-Video Tabs: Karaoke Settings | Next to Sing */}
          <div className="space-y-3.5">
            <div className="flex items-center gap-1 border-b border-white/[0.08]">
              <button
                onClick={() => setDockTab('settings')}
                className={`px-4 py-2.5 text-[13.5px] font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
                  dockTab === 'settings'
                    ? 'border-amber-500 text-[#F4F5F7]'
                    : 'border-transparent text-[#8A92A0] hover:text-[#D1D5DB]'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                <span>Karaoke Settings</span>
              </button>

              <button
                onClick={() => setDockTab('upnext')}
                className={`px-4 py-2.5 text-[13.5px] font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
                  dockTab === 'upnext'
                    ? 'border-amber-500 text-[#F4F5F7]'
                    : 'border-transparent text-[#8A92A0] hover:text-[#D1D5DB]'
                }`}
              >
                <ListMusic className="w-4 h-4 text-amber-400" />
                <span>Next to Sing</span>
                {upNextTracks.length > 0 && (
                  <span className="font-mono-num text-[11px] px-1.5 py-0.5 rounded bg-white/[0.08] text-[#C8CDD6]">
                    {upNextTracks.length}
                  </span>
                )}
              </button>
            </div>

            {dockTab === 'settings' ? (
              <div className="space-y-3">
                <StudioConsole
                  settings={settings}
                  volume={volume}
                  isMuted={isMuted}
                  isDownloaded={isDownloaded}
                  downloadProgress={currentDownloadProgress}
                  onChangePitch={onChangePitch}
                  onChangeOffset={onChangeOffset}
                  onChangeTempo={onChangeTempo}
                  onChangeVolume={onChangeVolume}
                  onToggleMute={onToggleMute}
                  onDownload={() => onDownloadTrack(track)}
                />

                <div className="hidden md:flex items-center justify-between text-[11.5px] text-[#6B7280] px-1">
                  <span>Pitch, audio sync, and tempo stay active across all karaoke songs.</span>
                  <span className="font-mono-num">
                    Space: Play · ↑/↓: Pitch · [ / ]: Audio Sync · ←/→: Seek
                  </span>
                </div>
              </div>
            ) : (
              /* YouTube-Style "Next to Sing" Vertical List */
              <div className="space-y-2">
                {upNextTracks.length === 0 ? (
                  <div className="rounded-xl bg-[#14161B] border border-white/[0.07] p-8 text-center">
                    <p className="text-[13.5px] text-[#9CA3AF]">
                      Search or browse a karaoke category to populate your Next to Sing queue.
                    </p>
                  </div>
                ) : (
                  upNextTracks.map((item) => {
                    const itemDownloaded = downloadedIds.has(item.id) || item.isOffline;
                    const dl = downloadProgressMap[item.id];
                    const itemDownloading = dl?.status === 'downloading';

                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 p-2.5 rounded-xl bg-[#14161B] border border-white/[0.07] hover:border-white/[0.15] transition-colors group"
                      >
                        <button
                          onClick={() => onPlayTrack(item)}
                          className="relative w-32 sm:w-40 aspect-video rounded-lg overflow-hidden bg-[#0B0C0F] shrink-0 cursor-pointer"
                        >
                          <img
                            src={item.thumbnail}
                            alt={item.title}
                            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 flex items-center justify-center transition-colors">
                            <Play className="w-6 h-6 text-white fill-current opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 text-[10.5px] font-mono-num text-[#F4F5F7]">
                            {item.durationText}
                          </span>
                        </button>

                        <div className="min-w-0 flex-1">
                          <button
                            onClick={() => onPlayTrack(item)}
                            className="text-left text-[13.5px] sm:text-[14px] font-medium text-[#F4F5F7] hover:text-amber-300 line-clamp-2 leading-snug cursor-pointer"
                          >
                            {item.title}
                          </button>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[#7D8594]">
                            <span className="truncate">{item.channel}</span>
                            {item.viewsText && (
                              <>
                                <span>·</span>
                                <span>{item.viewsText}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => !itemDownloaded && !itemDownloading && onDownloadTrack(item)}
                            disabled={itemDownloaded || itemDownloading}
                            title={itemDownloaded ? 'Saved offline' : 'Download for offline singing'}
                            className={`h-9 px-2.5 rounded-lg border text-[12px] flex items-center gap-1 transition-colors ${
                              itemDownloaded
                                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400 cursor-default'
                                : itemDownloading
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 cursor-wait'
                                : 'bg-[#1B1E25] border-white/[0.08] text-[#B8BFC9] hover:text-white cursor-pointer'
                            }`}
                          >
                            {itemDownloading ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span className="font-mono-num text-[11px]">{dl.percent}%</span>
                              </>
                            ) : itemDownloaded ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
