import React from 'react';
import { Compass, Disc3, Download, Mic2, Clock, RefreshCw, ArrowDownToLine } from 'lucide-react';
import type { AppUpdateState, KaraokeTrack } from '@/types/karaoke';

export type NavTab = 'discover' | 'stage' | 'downloads';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  downloadCount: number;
  hasActiveTrack: boolean;
  isPlaying: boolean;
  recents: KaraokeTrack[];
  updateState: AppUpdateState;
  onPlayTrack: (track: KaraokeTrack) => void;
  onCheckUpdates: () => void;
  onInstallUpdate: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  downloadCount,
  hasActiveTrack,
  isPlaying,
  recents,
  updateState,
  onPlayTrack,
  onCheckUpdates,
  onInstallUpdate,
}) => {
  const navItems: { id: NavTab; label: string; icon: React.ReactNode; badge?: number | string }[] = [
    { id: 'discover', label: 'Discover', icon: <Compass className="w-[18px] h-[18px]" /> },
    {
      id: 'stage',
      label: 'Stage Player',
      icon: (
        <Disc3
          className={`w-[18px] h-[18px] ${isPlaying ? 'animate-spin' : ''}`}
          style={{ animationDuration: '6s' }}
        />
      ),
      badge: hasActiveTrack ? 'LIVE' : undefined,
    },
    {
      id: 'downloads',
      label: 'Offline Library',
      icon: <Download className="w-[18px] h-[18px]" />,
      badge: downloadCount > 0 ? downloadCount : undefined,
    },
  ];

  const hasUpdate =
    updateState.status === 'available' ||
    updateState.status === 'downloading' ||
    updateState.status === 'downloaded';

  return (
    <>
      {/* Desktop / Tablet Sidebar */}
      <aside className="hidden md:flex flex-col w-[236px] shrink-0 bg-[#111318] border-r border-white/[0.07] select-none">
        {/* Brand Header */}
        <div className="h-16 px-5 flex items-center gap-3 border-b border-white/[0.06]">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Mic2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold tracking-tight text-[#F4F5F7] leading-tight">
              KaraokePitch
            </div>
            <div className="text-[11px] text-[#7D8594] font-medium tracking-wide uppercase">
              Studio Edition
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-white/[0.08] text-[#F4F5F7] border border-white/[0.08]'
                    : 'text-[#9CA3AF] hover:text-[#F4F5F7] hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className={active ? 'text-amber-400' : 'text-[#7D8594]'}>{item.icon}</span>
                  <span>{item.label}</span>
                </span>
                {item.badge !== undefined && (
                  <span
                    className={`font-mono-num text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                      item.badge === 'LIVE'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-white/[0.08] text-[#C8CDD6]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Recently Sung */}
        <div className="mt-2 px-4 pt-3 border-t border-white/[0.06] flex-1 overflow-y-auto">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] mb-2.5">
            <Clock className="w-3.5 h-3.5" />
            <span>Recent Sessions</span>
          </div>
          {recents.length === 0 ? (
            <p className="text-[12px] text-[#5C6370] leading-relaxed">
              Tracks you sing will appear here for quick replay.
            </p>
          ) : (
            <div className="space-y-1 pb-4">
              {recents.slice(0, 7).map((track) => (
                <button
                  key={track.id}
                  onClick={() => onPlayTrack(track)}
                  className="w-full text-left flex items-center gap-2.5 p-1.5 rounded-md hover:bg-white/[0.05] transition-colors group cursor-pointer"
                >
                  <img
                    src={track.thumbnail}
                    alt=""
                    className="w-10 h-7 rounded object-cover bg-[#1B1E25] shrink-0"
                    loading="lazy"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] text-[#D1D5DB] group-hover:text-white truncate leading-snug">
                      {track.title}
                    </div>
                    <div className="text-[11px] text-[#6B7280] truncate">{track.channel}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer Version & Auto-Update Action */}
        <div className="p-3 border-t border-white/[0.06] space-y-2">
          {hasUpdate ? (
            <button
              onClick={onInstallUpdate}
              className="w-full py-2 px-2.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-[12px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <ArrowDownToLine className="w-3.5 h-3.5" />
              <span>
                {updateState.status === 'downloaded'
                  ? `Restart to v${updateState.latestVersion}`
                  : updateState.status === 'downloading'
                  ? `Updating ${updateState.percent ?? 0}%`
                  : `Update to v${updateState.latestVersion}`}
              </span>
            </button>
          ) : (
            <button
              onClick={onCheckUpdates}
              disabled={updateState.status === 'checking'}
              className="w-full flex items-center justify-between text-[11.5px] text-[#7D8594] hover:text-[#D1D5DB] px-1 py-0.5 cursor-pointer transition-colors"
              title="Check GitHub Releases for app updates"
            >
              <span className="flex items-center gap-1.5">
                <RefreshCw
                  className={`w-3 h-3 ${updateState.status === 'checking' ? 'animate-spin text-amber-400' : ''}`}
                />
                <span>
                  {updateState.status === 'checking'
                    ? 'Checking updates...'
                    : updateState.status === 'up-to-date'
                    ? 'Up to date'
                    : 'Check for updates'}
                </span>
              </span>
              <span className="font-mono-num text-[#9CA3AF]">v{updateState.currentVersion}</span>
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#111318]/95 backdrop-blur-md border-t border-white/[0.08] pb-safe">
        <div className="grid grid-cols-3 h-15">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                  active ? 'text-amber-400' : 'text-[#8A92A0]'
                }`}
              >
                <div className="relative">
                  {item.icon}
                  {typeof item.badge === 'number' && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-[#0D0E11] font-mono-num text-[10px] font-bold flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
