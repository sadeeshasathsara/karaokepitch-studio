import React from 'react';
import {
  Minus,
  Plus,
  RotateCcw,
  Volume2,
  VolumeX,
  Gauge,
  ArrowLeft,
  ArrowRight,
  SlidersHorizontal,
  Download,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import type { DownloadProgress, TrackSettings } from '@/types/karaoke';

interface StudioConsoleProps {
  settings: TrackSettings;
  volume: number;
  isMuted: boolean;
  isDownloaded: boolean;
  downloadProgress?: DownloadProgress;
  onChangePitch: (semitones: number) => void;
  onChangeOffset: (offsetMs: number) => void;
  onChangeTempo: (tempo: number) => void;
  onChangeVolume: (vol: number) => void;
  onToggleMute: () => void;
  onDownload: () => void;
}

export const StudioConsole: React.FC<StudioConsoleProps> = ({
  settings,
  volume,
  isMuted,
  isDownloaded,
  downloadProgress,
  onChangePitch,
  onChangeOffset,
  onChangeTempo,
  onChangeVolume,
  onToggleMute,
  onDownload,
}) => {
  const { pitchSemitones, audioOffsetMs, tempo } = settings;

  const formatPitch = (val: number) => {
    if (Math.abs(val) < 0.01) return '0.0 ST';
    const sign = val > 0 ? '+' : '';
    return `${sign}${val.toFixed(1)} ST`;
  };

  const formatOffset = (ms: number) => {
    if (ms === 0) return '0 ms';
    return `${ms > 0 ? '+' : ''}${ms} ms`;
  };

  const getSyncHint = (ms: number) => {
    if (ms === 0) return 'Audio locked to video lyrics';
    if (ms < 0) return `Audio ${Math.abs(ms)} ms earlier (fixes early lyrics)`;
    return `Audio ${ms} ms later (fixes late lyrics)`;
  };

  const clampPitch = (v: number) => Math.max(-12, Math.min(12, Math.round(v * 2) / 2));
  const clampOffset = (v: number) => Math.max(-2000, Math.min(2000, Math.round(v / 5) * 5));

  const isDownloading = downloadProgress?.status === 'downloading';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
      {/* MODULE 1: REAL-TIME PITCH SHIFTER */}
      <section className="rounded-xl bg-[#14161B] border border-white/[0.08] p-4 flex flex-col justify-between gap-3.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-amber-400" />
              <h3 className="text-[13.5px] font-semibold text-[#F4F5F7] tracking-tight">
                Key & Pitch Shift
              </h3>
            </div>
            <p className="text-[11.5px] text-[#7D8594] mt-0.5">
              Real-time semitone shift without changing song speed
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`font-mono-num text-[14px] font-bold px-2.5 py-1 rounded-md border ${
                pitchSemitones === 0
                  ? 'bg-[#1B1E25] border-white/[0.08] text-[#D1D5DB]'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              }`}
            >
              {formatPitch(pitchSemitones)}
            </span>
            <button
              onClick={() => onChangePitch(0)}
              disabled={pitchSemitones === 0}
              title="Reset pitch to original key"
              className="h-8 w-8 rounded-md bg-[#1B1E25] hover:bg-white/[0.1] disabled:opacity-35 border border-white/[0.08] flex items-center justify-center text-[#C8CDD6] cursor-pointer disabled:cursor-default transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Tactile Semitone Stepper Row */}
        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => onChangePitch(clampPitch(pitchSemitones - 1))}
            className="h-11 rounded-lg bg-[#1B1E25] hover:bg-[#242832] active:scale-[0.98] border border-white/[0.08] text-[#F4F5F7] font-mono-num text-[13px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-all"
          >
            <Minus className="w-3.5 h-3.5 text-amber-400" />
            <span>1 ST</span>
          </button>
          <button
            onClick={() => onChangePitch(clampPitch(pitchSemitones - 0.5))}
            className="h-11 rounded-lg bg-[#181B21] hover:bg-[#222630] active:scale-[0.98] border border-white/[0.06] text-[#C8CDD6] font-mono-num text-[12.5px] font-medium flex items-center justify-center cursor-pointer transition-all"
          >
            -0.5
          </button>
          <button
            onClick={() => onChangePitch(clampPitch(pitchSemitones + 0.5))}
            className="h-11 rounded-lg bg-[#181B21] hover:bg-[#222630] active:scale-[0.98] border border-white/[0.06] text-[#C8CDD6] font-mono-num text-[12.5px] font-medium flex items-center justify-center cursor-pointer transition-all"
          >
            +0.5
          </button>
          <button
            onClick={() => onChangePitch(clampPitch(pitchSemitones + 1))}
            className="h-11 rounded-lg bg-[#1B1E25] hover:bg-[#242832] active:scale-[0.98] border border-white/[0.08] text-[#F4F5F7] font-mono-num text-[13px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-all"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>1 ST</span>
          </button>
        </div>

        {/* Continuous Pitch Slider */}
        <div>
          <div className="relative flex items-center">
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[2px] h-3 bg-white/25 rounded-full" />
            <input
              type="range"
              min={-12}
              max={12}
              step={0.5}
              value={pitchSemitones}
              onChange={(e) => onChangePitch(Number(e.target.value))}
              aria-label="Pitch shift in semitones"
              className="studio-slider"
            />
          </div>
          <div className="flex justify-between text-[10.5px] font-mono-num text-[#6B7280] px-0.5">
            <span>-12 Lower</span>
            <span>Original (0)</span>
            <span>+12 Higher</span>
          </div>
        </div>
      </section>

      {/* MODULE 2: CUSTOM AUDIO SYNC (LEFT / RIGHT TIME SHIFT) */}
      <section className="rounded-xl bg-[#14161B] border border-white/[0.08] p-4 flex flex-col justify-between gap-3.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <h3 className="text-[13.5px] font-semibold text-[#F4F5F7] tracking-tight">
                Audio / Lyric Sync Shift
              </h3>
            </div>
            <p className="text-[11.5px] text-[#7D8594] mt-0.5">
              {getSyncHint(audioOffsetMs)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`font-mono-num text-[14px] font-bold px-2.5 py-1 rounded-md border ${
                audioOffsetMs === 0
                  ? 'bg-[#1B1E25] border-white/[0.08] text-[#D1D5DB]'
                  : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              }`}
            >
              {formatOffset(audioOffsetMs)}
            </span>
            <button
              onClick={() => onChangeOffset(0)}
              disabled={audioOffsetMs === 0}
              title="Reset audio sync to 0 ms"
              className="h-8 w-8 rounded-md bg-[#1B1E25] hover:bg-white/[0.1] disabled:opacity-35 border border-white/[0.08] flex items-center justify-center text-[#C8CDD6] cursor-pointer disabled:cursor-default transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Left / Right Nudge Buttons */}
        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => onChangeOffset(clampOffset(audioOffsetMs - 100))}
            className="h-11 rounded-lg bg-[#1B1E25] hover:bg-[#242832] active:scale-[0.98] border border-white/[0.08] text-[#F4F5F7] font-mono-num text-[12px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-all"
            title="Shift audio earlier by 100ms"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-emerald-400" />
            <span>100ms</span>
          </button>
          <button
            onClick={() => onChangeOffset(clampOffset(audioOffsetMs - 25))}
            className="h-11 rounded-lg bg-[#181B21] hover:bg-[#222630] active:scale-[0.98] border border-white/[0.06] text-[#C8CDD6] font-mono-num text-[12px] font-medium flex items-center justify-center cursor-pointer transition-all"
            title="Shift audio earlier by 25ms"
          >
            -25ms
          </button>
          <button
            onClick={() => onChangeOffset(clampOffset(audioOffsetMs + 25))}
            className="h-11 rounded-lg bg-[#181B21] hover:bg-[#222630] active:scale-[0.98] border border-white/[0.06] text-[#C8CDD6] font-mono-num text-[12px] font-medium flex items-center justify-center cursor-pointer transition-all"
            title="Shift audio later by 25ms"
          >
            +25ms
          </button>
          <button
            onClick={() => onChangeOffset(clampOffset(audioOffsetMs + 100))}
            className="h-11 rounded-lg bg-[#1B1E25] hover:bg-[#242832] active:scale-[0.98] border border-white/[0.08] text-[#F4F5F7] font-mono-num text-[12px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-all"
            title="Shift audio later by 100ms"
          >
            <span>100ms</span>
            <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
          </button>
        </div>

        {/* Continuous Sync Slider */}
        <div>
          <div className="relative flex items-center">
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[2px] h-3 bg-white/25 rounded-full" />
            <input
              type="range"
              min={-2000}
              max={2000}
              step={10}
              value={audioOffsetMs}
              onChange={(e) => onChangeOffset(Number(e.target.value))}
              aria-label="Audio sync offset in milliseconds"
              className="studio-slider"
            />
          </div>
          <div className="flex justify-between text-[10.5px] font-mono-num text-[#6B7280] px-0.5">
            <span>◀ -2.0s Earlier</span>
            <span>0 ms</span>
            <span>+2.0s Later ▶</span>
          </div>
        </div>
      </section>

      {/* UTILITY STRIP: TEMPO, VOLUME, OFFLINE DOWNLOAD */}
      <section className="lg:col-span-2 rounded-xl bg-[#14161B] border border-white/[0.08] px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Tempo Control */}
        <div className="flex items-center gap-3 min-w-[200px] flex-1">
          <div className="flex items-center gap-1.5 text-[12px] text-[#9CA3AF] shrink-0">
            <Gauge className="w-4 h-4 text-[#7D8594]" />
            <span>Tempo</span>
          </div>
          <input
            type="range"
            min={0.75}
            max={1.25}
            step={0.05}
            value={tempo}
            onChange={(e) => onChangeTempo(Number(e.target.value))}
            aria-label="Playback tempo"
            className="studio-slider max-w-[160px]"
          />
          <button
            onClick={() => onChangeTempo(1)}
            className="font-mono-num text-[12px] text-[#D1D5DB] hover:text-amber-300 px-1.5 py-0.5 rounded bg-[#1B1E25] border border-white/[0.07] cursor-pointer"
            title="Click to reset tempo to 1.00x"
          >
            {tempo.toFixed(2)}x
          </button>
        </div>

        {/* Master Volume */}
        <div className="flex items-center gap-2.5 min-w-[170px] flex-1">
          <button
            onClick={onToggleMute}
            className="text-[#9CA3AF] hover:text-white cursor-pointer"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1.2}
            step={0.02}
            value={isMuted ? 0 : volume}
            onChange={(e) => onChangeVolume(Number(e.target.value))}
            aria-label="Master volume"
            className="studio-slider max-w-[140px]"
          />
          <span className="font-mono-num text-[11.5px] text-[#7D8594] w-9">
            {Math.round((isMuted ? 0 : volume) * 100)}%
          </span>
        </div>

        {/* Offline Save Action */}
        <button
          onClick={() => !isDownloaded && !isDownloading && onDownload()}
          disabled={isDownloaded || isDownloading}
          className={`h-9 px-3.5 rounded-lg text-[12.5px] font-semibold flex items-center gap-2 border transition-colors ${
            isDownloaded
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 cursor-default'
              : isDownloading
              ? 'bg-amber-500/15 border-amber-500/35 text-amber-300 cursor-wait'
              : 'bg-[#1D2028] hover:bg-amber-500 hover:text-[#0D0E11] border-white/[0.1] text-[#F4F5F7] cursor-pointer'
          }`}
        >
          {isDownloading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="font-mono-num">Downloading {downloadProgress.percent}%</span>
            </>
          ) : isDownloaded ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Saved Offline</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              <span>Save Offline</span>
            </>
          )}
        </button>
      </section>
    </div>
  );
};
