import React from 'react';
import { Play, Trash2, HardDrive, DownloadCloud } from 'lucide-react';
import type { KaraokeTrack } from '@/types/karaoke';

interface DownloadsViewProps {
  downloads: KaraokeTrack[];
  activeTrackId?: string;
  onPlay: (track: KaraokeTrack) => void;
  onDelete: (videoId: string) => void;
  onGoDiscover: () => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
}

export const DownloadsView: React.FC<DownloadsViewProps> = ({
  downloads,
  activeTrackId,
  onPlay,
  onDelete,
  onGoDiscover,
}) => {
  const totalBytes = downloads.reduce((acc, t) => acc + (t.localFileSize || 0), 0);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5 pb-28 md:pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-4">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-[#F4F5F7]">
            Offline Karaoke Library
          </h1>
          <p className="text-[13px] text-[#7D8594] mt-0.5">
            Play downloaded tracks anywhere with full real-time pitch shifting and lyric sync
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#14161B] border border-white/[0.08] text-[12px] text-[#C8CDD6]">
          <HardDrive className="w-4 h-4 text-amber-400" />
          <span className="font-mono-num">{downloads.length} tracks</span>
          <span className="text-white/20">·</span>
          <span className="font-mono-num text-[#9CA3AF]">{formatBytes(totalBytes)}</span>
        </div>
      </div>

      {downloads.length === 0 ? (
        <div className="rounded-xl bg-[#14161B] border border-white/[0.07] p-12 text-center max-w-md mx-auto mt-8">
          <DownloadCloud className="w-9 h-9 text-[#5C6370] mx-auto mb-3" />
          <h2 className="text-[15px] font-medium text-[#E5E7EB]">No offline tracks yet</h2>
          <p className="text-[13px] text-[#7D8594] mt-1.5 mb-5">
            Tap the download button on any YouTube karaoke video to save it inside the app for instant offline singing.
          </p>
          <button
            onClick={onGoDiscover}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0D0E11] text-[13px] font-semibold cursor-pointer transition-colors"
          >
            Browse Karaoke
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {downloads.map((track) => {
            const isActive = activeTrackId === track.id;
            return (
              <div
                key={track.id}
                className={`flex items-center gap-3.5 p-3 rounded-xl bg-[#14161B] border transition-colors ${
                  isActive ? 'border-amber-500/50' : 'border-white/[0.07] hover:border-white/[0.14]'
                }`}
              >
                <button
                  onClick={() => onPlay(track)}
                  className="relative w-24 sm:w-32 aspect-video rounded-lg overflow-hidden bg-[#0B0C0F] shrink-0 cursor-pointer group"
                >
                  <img
                    src={track.thumbnail}
                    alt={track.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/25 group-hover:bg-black/45 flex items-center justify-center transition-colors">
                    <Play className="w-5 h-5 text-white fill-current" />
                  </div>
                </button>

                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => onPlay(track)}
                    className="text-left text-[14px] font-medium text-[#F4F5F7] hover:text-amber-300 line-clamp-1 cursor-pointer"
                  >
                    {track.title}
                  </button>
                  <div className="text-[12px] text-[#7D8594] mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                    <span className="truncate">{track.channel}</span>
                    <span>·</span>
                    <span className="font-mono-num">{track.durationText}</span>
                    <span>·</span>
                    <span className="font-mono-num text-emerald-400">{formatBytes(track.localFileSize)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onPlay(track)}
                    className="h-9 px-3.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0D0E11] text-[12.5px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span className="hidden sm:inline">Sing</span>
                  </button>
                  <button
                    onClick={() => onDelete(track.id)}
                    title="Delete offline video"
                    className="h-9 w-9 rounded-lg bg-[#1B1E25] hover:bg-red-500/15 hover:text-red-400 border border-white/[0.08] text-[#8A92A0] flex items-center justify-center cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
