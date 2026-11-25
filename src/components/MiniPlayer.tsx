import React from 'react';
import { Play, Pause, Maximize2 } from 'lucide-react';
import type { KaraokeTrack, TrackSettings } from '@/types/karaoke';

interface MiniPlayerProps {
  track: KaraokeTrack;
  settings: TrackSettings;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onOpenStage: () => void;
}

export const MiniPlayer: React.FC<MiniPlayerProps> = ({
  track,
  settings,
  isPlaying,
  onTogglePlay,
  onOpenStage,
}) => {
  return (
    <div className="fixed bottom-16 md:bottom-4 left-3 right-3 md:left-[252px] md:right-5 z-30">
      <div className="rounded-xl bg-[#161921]/95 backdrop-blur-md border border-white/[0.12] shadow-2xl px-3 py-2.5 flex items-center gap-3">
        <button
          onClick={onOpenStage}
          className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
        >
          <img
            src={track.thumbnail}
            alt=""
            className="w-12 h-8 rounded object-cover bg-[#0B0C0F] shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-[#F4F5F7] truncate">{track.title}</div>
            <div className="flex items-center gap-2 text-[11px] font-mono-num text-[#9CA3AF]">
              <span className={settings.pitchSemitones !== 0 ? 'text-amber-400' : ''}>
                Pitch {settings.pitchSemitones > 0 ? `+${settings.pitchSemitones}` : settings.pitchSemitones} ST
              </span>
              <span>·</span>
              <span className={settings.audioOffsetMs !== 0 ? 'text-emerald-400' : ''}>
                Sync {settings.audioOffsetMs > 0 ? `+${settings.audioOffsetMs}` : settings.audioOffsetMs} ms
              </span>
            </div>
          </div>
        </button>

        <button
          onClick={onTogglePlay}
          className="w-9 h-9 rounded-full bg-amber-500 hover:bg-amber-400 text-[#0D0E11] flex items-center justify-center shrink-0 cursor-pointer"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
        </button>

        <button
          onClick={onOpenStage}
          className="w-9 h-9 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[#D1D5DB] flex items-center justify-center shrink-0 cursor-pointer"
          aria-label="Open Stage Player"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
