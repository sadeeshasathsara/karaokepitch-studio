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
} from 'lucide-react';
import type { DownloadProgress, KaraokeTrack, StreamBundle, TrackSettings } from '@/types/karaoke';
import type { PitchEngineMode } from '@/audio/pitchEngine';
import { StudioConsole } from './StudioConsole';

interface StagePlayerProps {
  visible: boolean;
  track: KaraokeTrack | null;
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
  isDownloaded: boolean;
  downloadProgress?: DownloadProgress;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onTogglePlay: () => void;
  onSeek: (timeSec: number) => void;
  onChangePitch: (semitones: number) => void;
  onChangeOffset: (offsetMs: number) => void;
  onChangeTempo: (tempo: number) => void;
  onChangeVolume: (vol: number) => void;
  onToggleMute: () => void;
  onDownload: () => void;
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
  isDownloaded,
  downloadProgress,
  videoRef,
  onTogglePlay,
  onSeek,
  onChangePitch,
  onChangeOffset,
  onChangeTempo,
  onChangeVolume,
  onToggleMute,
  onDownload,
  onRetryStream,
  onGoDiscover,
}) => {
  const stageBoxRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHud, setShowHud] = useState(true);
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
              isFullscreen ? 'w-screen h-screen rounded-none border-none flex items-center justify-center' : 'aspect-video w-full'
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

          {/* Pro Studio Pitch & Audio Sync Console */}
          <StudioConsole
            settings={settings}
            volume={volume}
            isMuted={isMuted}
            isDownloaded={isDownloaded}
            downloadProgress={downloadProgress}
            onChangePitch={onChangePitch}
            onChangeOffset={onChangeOffset}
            onChangeTempo={onChangeTempo}
            onChangeVolume={onChangeVolume}
            onToggleMute={onToggleMute}
            onDownload={onDownload}
          />

          {/* Subtle keyboard shortcut legend on desktop */}
          <div className="hidden md:flex items-center justify-between text-[11.5px] text-[#6B7280] px-1">
            <span>Per-song pitch and audio sync settings are automatically saved.</span>
            <span className="font-mono-num">
              Space: Play · ↑/↓: Pitch · [ / ]: Audio Sync · ←/→: Seek
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
