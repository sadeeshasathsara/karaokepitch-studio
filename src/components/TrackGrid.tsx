import React from 'react';
import { Play, Download, CheckCircle2, Loader2, Music2 } from 'lucide-react';
import type { DownloadProgress, KaraokeTrack } from '@/types/karaoke';

interface TrackGridProps {
  tracks: KaraokeTrack[];
  isLoading: boolean;
  error: string | null;
  activeTrackId?: string;
  downloadedIds: Set<string>;
  downloadProgressMap: Record<string, DownloadProgress>;
  onPlay: (track: KaraokeTrack) => void;
  onDownload: (track: KaraokeTrack) => void;
  onRetry?: () => void;
}

export const TrackGrid: React.FC<TrackGridProps> = ({
  tracks,
  isLoading,
  error,
  activeTrackId,
  downloadedIds,
  downloadProgressMap,
  onPlay,
  onDownload,
  onRetry,
}) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, idx) => (
          <div
            key={idx}
            className="rounded-xl bg-[#14161B] border border-white/[0.06] overflow-hidden animate-pulse"
          >
            <div className="aspect-video bg-[#1D2028]" />
            <div className="p-3.5 space-y-2.5">
              <div className="h-4 bg-[#222630] rounded w-5/6" />
              <div className="h-3 bg-[#1D2028] rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-[#14161B] border border-red-500/25 p-8 text-center max-w-md mx-auto mt-10">
        <p className="text-[14px] font-medium text-red-300 mb-1">Could not load karaoke tracks</p>
        <p className="text-[12.5px] text-[#8A92A0] mb-4">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0D0E11] text-[13px] font-semibold transition-colors cursor-pointer"
          >
            Try Again
          </button>
        )}
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="rounded-xl bg-[#14161B] border border-white/[0.07] p-12 text-center max-w-md mx-auto mt-10">
        <Music2 className="w-8 h-8 text-[#5C6370] mx-auto mb-3" />
        <p className="text-[14px] font-medium text-[#E5E7EB]">No karaoke tracks found</p>
        <p className="text-[12.5px] text-[#7D8594] mt-1">
          Try searching by song title or artist name. Results are automatically filtered to karaoke tracks only.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {tracks.map((track) => {
        const isCurrent = activeTrackId === track.id;
        const isDownloaded = downloadedIds.has(track.id) || track.isOffline;
        const dl = downloadProgressMap[track.id];
        const isDownloading = dl?.status === 'downloading';

        return (
          <div
            key={track.id}
            className={`group rounded-xl bg-[#14161B] border transition-all overflow-hidden flex flex-col ${
              isCurrent
                ? 'border-amber-500/60 ring-1 ring-amber-500/20'
                : 'border-white/[0.07] hover:border-white/[0.16]'
            }`}
          >
            {/* Thumbnail */}
            <button
              onClick={() => onPlay(track)}
              className="relative aspect-video bg-[#0B0C0F] overflow-hidden text-left cursor-pointer"
            >
              <img
                src={track.thumbnail}
                alt={track.title}
                className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors flex items-center justify-center">
                <div className="w-11 h-11 rounded-full bg-amber-500 text-[#0D0E11] flex items-center justify-center opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all shadow-lg">
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                </div>
              </div>

              {/* Duration badge */}
              <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[11px] font-mono-num text-[#F4F5F7]">
                {track.durationText}
              </span>

              {/* Offline badge */}
              {isDownloaded && (
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-emerald-500/90 text-[#071A12] text-[10.5px] font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Offline
                </span>
              )}
            </button>

            {/* Details */}
            <div className="p-3.5 flex-1 flex flex-col justify-between gap-2.5">
              <div>
                <button
                  onClick={() => onPlay(track)}
                  className="text-left text-[13.5px] font-medium text-[#F4F5F7] hover:text-amber-300 line-clamp-2 leading-snug transition-colors cursor-pointer"
                  title={track.title}
                >
                  {track.title}
                </button>
                <div className="mt-1.5 flex items-center justify-between text-[12px] text-[#7D8594]">
                  <span className="truncate pr-2">{track.channel}</span>
                  {track.viewsText && <span className="shrink-0 text-[11px]">{track.viewsText}</span>}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-white/[0.05]">
                <button
                  onClick={() => onPlay(track)}
                  className="flex-1 h-8 rounded-md bg-white/[0.06] hover:bg-amber-500 hover:text-[#0D0E11] text-[#E5E7EB] text-[12px] font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{isCurrent ? 'Open Stage' : 'Sing Now'}</span>
                </button>

                <button
                  onClick={() => !isDownloaded && !isDownloading && onDownload(track)}
                  disabled={isDownloaded || isDownloading}
                  title={isDownloaded ? 'Saved for offline playback' : 'Download for offline singing'}
                  className={`h-8 px-2.5 rounded-md border text-[12px] font-medium flex items-center gap-1.5 transition-colors ${
                    isDownloaded
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400 cursor-default'
                      : isDownloading
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 cursor-wait'
                      : 'bg-[#1A1D24] border-white/[0.08] text-[#B8BFC9] hover:text-white hover:border-white/[0.18] cursor-pointer'
                  }`}
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span className="font-mono-num text-[11px]">{dl.percent}%</span>
                    </>
                  ) : isDownloaded ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
