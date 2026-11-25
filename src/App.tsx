import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PitchAudioEngine, type PitchEngineMode } from '@/audio/pitchEngine';
import { getPlatformAPI } from '@/services/platform';
import {
  addRecentTrack,
  DEFAULT_TRACK_SETTINGS,
  getRecentTracks,
  getTrackSettings,
  saveTrackSettings,
} from '@/services/storage';
import type { DownloadProgress, KaraokeTrack, StreamBundle, TrackSettings } from '@/types/karaoke';
import { Sidebar, type NavTab } from '@/components/Sidebar';
import { KARAOKE_CATEGORIES, SearchHeader, type KaraokeCategory } from '@/components/SearchHeader';
import { TrackGrid } from '@/components/TrackGrid';
import { StagePlayer } from '@/components/StagePlayer';
import { DownloadsView } from '@/components/DownloadsView';
import { MiniPlayer } from '@/components/MiniPlayer';

export default function App() {
  const api = useMemo(() => getPlatformAPI(), []);

  // Navigation & Discovery state
  const [activeTab, setActiveTab] = useState<NavTab>('discover');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>(KARAOKE_CATEGORIES[0].id);
  const [tracks, setTracks] = useState<KaraokeTrack[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Offline downloads & recents
  const [downloads, setDownloads] = useState<KaraokeTrack[]>([]);
  const [downloadProgressMap, setDownloadProgressMap] = useState<Record<string, DownloadProgress>>({});
  const [recents, setRecents] = useState<KaraokeTrack[]>(() => getRecentTracks());

  // Active playback state
  const [activeTrack, setActiveTrack] = useState<KaraokeTrack | null>(null);
  const [streamBundle, setStreamBundle] = useState<StreamBundle | null>(null);
  const [isLoadingStream, setIsLoadingStream] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  const [settings, setSettings] = useState<TrackSettings>(DEFAULT_TRACK_SETTINGS);
  const [engineMode, setEngineMode] = useState<PitchEngineMode>('direct');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.95);
  const [isMuted, setIsMuted] = useState(false);

  // Media element & DSP engine refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const engineRef = useRef<PitchAudioEngine | null>(null);
  const settingsRef = useRef<TrackSettings>(settings);
  settingsRef.current = settings;

  const downloadedIds = useMemo(() => new Set(downloads.map((d) => d.id)), [downloads]);

  // Compute target audio time from video time & bidirectional offset
  // Negative offsetMs = audio earlier (audioTime > videoTime)
  // Positive offsetMs = audio later (audioTime < videoTime)
  const computeTargetAudioTime = useCallback((videoTime: number, offsetMs: number, maxDur: number) => {
    const raw = videoTime - offsetMs / 1000;
    if (maxDur > 0) return Math.max(0, Math.min(maxDur, raw));
    return Math.max(0, raw);
  }, []);

  // Load downloads & subscribe to download progress
  useEffect(() => {
    api.listDownloads().then(setDownloads).catch(() => undefined);
    const unsub = api.onDownloadProgress((progress) => {
      setDownloadProgressMap((prev) => ({ ...prev, [progress.videoId]: progress }));
      if (progress.status === 'completed') {
        api.listDownloads().then(setDownloads).catch(() => undefined);
      }
    });
    return unsub;
  }, [api]);

  // Dispose audio engine on unmount
  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
    };
  }, []);

  // Search helper
  const runSearch = useCallback(
    async (query: string) => {
      setIsSearching(true);
      setSearchError(null);
      try {
        const results = await api.searchKaraoke(query);
        setTracks(results);
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : 'Failed to reach YouTube karaoke search.');
      } finally {
        setIsSearching(false);
      }
    },
    [api]
  );

  // Initial trending karaoke load
  useEffect(() => {
    runSearch(KARAOKE_CATEGORIES[0].query);
  }, [runSearch]);

  const handleSelectCategory = (cat: KaraokeCategory) => {
    setActiveCategory(cat.id);
    setSearchQuery('');
    runSearch(cat.query);
  };

  const handleSearch = (q: string) => {
    setActiveCategory('');
    setSearchQuery(q);
    runSearch(q);
  };

  // Load and start a track on the Stage Player
  const loadTrackStreams = useCallback(
    async (track: KaraokeTrack) => {
      setIsLoadingStream(true);
      setStreamError(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(track.durationSec || 0);

      try {
        const videoEl = videoRef.current;
        const audioEl = audioRef.current;
        if (!videoEl || !audioEl) return;

        videoEl.pause();
        audioEl.pause();

        if (!engineRef.current) {
          engineRef.current = new PitchAudioEngine();
        }

        // Resolve YouTube streams and initialize WASM DSP engine in parallel
        const [bundle, mode] = await Promise.all([
          api.getStreamBundle(track.id),
          engineRef.current.attach(audioEl),
        ]);
        setStreamBundle(bundle);
        setEngineMode(mode);

        videoEl.src = bundle.videoUrl;
        audioEl.src = bundle.audioUrl;
        videoEl.load();
        audioEl.load();

        const saved = getTrackSettings(track.id);
        setSettings(saved);
        engineRef.current.setPitch(saved.pitchSemitones);
        engineRef.current.setVolume(isMuted ? 0 : volume);

        videoEl.playbackRate = saved.tempo;
        audioEl.playbackRate = saved.tempo;
        // Preserve pitch when tempo changes so Pitch Shifter remains independent!
        audioEl.preservesPitch = true;

        // Start as soon as first playable frame + audio buffer arrive (readyState >= 2)
        const waitReady = (el: HTMLMediaElement) =>
          new Promise<void>((resolve) => {
            if (el.readyState >= 2) {
              resolve();
              return;
            }
            const done = () => {
              el.removeEventListener('loadeddata', done);
              el.removeEventListener('canplay', done);
              resolve();
            };
            el.addEventListener('loadeddata', done, { once: true });
            el.addEventListener('canplay', done, { once: true });
          });

        await Promise.all([waitReady(videoEl), waitReady(audioEl)]);

        await engineRef.current.resume();
        const targetAudio = computeTargetAudioTime(0, saved.audioOffsetMs, audioEl.duration || 0);
        audioEl.currentTime = targetAudio;
        videoEl.currentTime = 0;

        await Promise.all([videoEl.play(), audioEl.play()]);
        setIsPlaying(true);
      } catch (err) {
        setStreamError(err instanceof Error ? err.message : 'Unable to load karaoke stream.');
      } finally {
        setIsLoadingStream(false);
      }
    },
    [api, computeTargetAudioTime, isMuted, volume]
  );

  const handlePlayTrack = useCallback(
    (track: KaraokeTrack) => {
      setActiveTab('stage');
      if (activeTrack?.id === track.id && streamBundle && !streamError) {
        return;
      }
      setActiveTrack(track);
      setRecents(addRecentTrack(track));
      void loadTrackStreams(track);
    },
    [activeTrack?.id, loadTrackStreams, streamBundle, streamError]
  );

  // Sync monitor: keeps <audio> tightly locked to <video> + custom audioOffsetMs
  useEffect(() => {
    const videoEl = videoRef.current;
    const audioEl = audioRef.current;
    if (!videoEl || !audioEl) return;

    const onTimeUpdate = () => {
      setCurrentTime(videoEl.currentTime);
      if (Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
        setDuration(videoEl.duration);
      }
    };

    const onEnded = () => {
      setIsPlaying(false);
      audioEl.pause();
    };

    const onVideoWaiting = () => {
      if (!audioEl.paused) audioEl.pause();
    };

    const onVideoPlaying = () => {
      if (audioEl.paused && !videoEl.paused) {
        const target = computeTargetAudioTime(
          videoEl.currentTime,
          settingsRef.current.audioOffsetMs,
          audioEl.duration || 0
        );
        audioEl.currentTime = target;
        void audioEl.play().catch(() => undefined);
      }
    };

    videoEl.addEventListener('timeupdate', onTimeUpdate);
    videoEl.addEventListener('loadedmetadata', onTimeUpdate);
    videoEl.addEventListener('ended', onEnded);
    videoEl.addEventListener('waiting', onVideoWaiting);
    videoEl.addEventListener('playing', onVideoPlaying);

    // Tight drift correction loop (every 150ms while playing)
    const driftTimer = window.setInterval(() => {
      if (videoEl.paused || audioEl.paused) return;
      const target = computeTargetAudioTime(
        videoEl.currentTime,
        settingsRef.current.audioOffsetMs,
        audioEl.duration || 0
      );
      const drift = Math.abs(audioEl.currentTime - target);
      if (drift > 0.065) {
        audioEl.currentTime = target;
      }
    }, 150);

    return () => {
      videoEl.removeEventListener('timeupdate', onTimeUpdate);
      videoEl.removeEventListener('loadedmetadata', onTimeUpdate);
      videoEl.removeEventListener('ended', onEnded);
      videoEl.removeEventListener('waiting', onVideoWaiting);
      videoEl.removeEventListener('playing', onVideoPlaying);
      window.clearInterval(driftTimer);
    };
  }, [computeTargetAudioTime]);

  const handleTogglePlay = useCallback(async () => {
    const videoEl = videoRef.current;
    const audioEl = audioRef.current;
    if (!videoEl || !audioEl || !streamBundle) return;

    if (isPlaying) {
      videoEl.pause();
      audioEl.pause();
      setIsPlaying(false);
    } else {
      await engineRef.current?.resume();
      const target = computeTargetAudioTime(
        videoEl.currentTime,
        settingsRef.current.audioOffsetMs,
        audioEl.duration || 0
      );
      audioEl.currentTime = target;
      await Promise.all([
        videoEl.play().catch(() => undefined),
        audioEl.play().catch(() => undefined),
      ]);
      setIsPlaying(true);
    }
  }, [computeTargetAudioTime, isPlaying, streamBundle]);

  const handleSeek = useCallback(
    (timeSec: number) => {
      const videoEl = videoRef.current;
      const audioEl = audioRef.current;
      if (!videoEl || !audioEl) return;
      const clamped = Math.max(0, Math.min(duration || 0, timeSec));
      videoEl.currentTime = clamped;
      audioEl.currentTime = computeTargetAudioTime(
        clamped,
        settingsRef.current.audioOffsetMs,
        audioEl.duration || 0
      );
      setCurrentTime(clamped);
    },
    [computeTargetAudioTime, duration]
  );

  const persistSettings = useCallback(
    (next: TrackSettings) => {
      setSettings(next);
      if (activeTrack) {
        saveTrackSettings(activeTrack.id, next);
      }
    },
    [activeTrack]
  );

  const handleChangePitch = useCallback(
    (semitones: number) => {
      const clamped = Math.max(-12, Math.min(12, Math.round(semitones * 2) / 2));
      engineRef.current?.setPitch(clamped);
      persistSettings({ ...settingsRef.current, pitchSemitones: clamped });
    },
    [persistSettings]
  );

  const handleChangeOffset = useCallback(
    (offsetMs: number) => {
      const clamped = Math.max(-2000, Math.min(2000, Math.round(offsetMs / 5) * 5));
      persistSettings({ ...settingsRef.current, audioOffsetMs: clamped });
      const videoEl = videoRef.current;
      const audioEl = audioRef.current;
      if (videoEl && audioEl) {
        audioEl.currentTime = computeTargetAudioTime(
          videoEl.currentTime,
          clamped,
          audioEl.duration || 0
        );
      }
    },
    [computeTargetAudioTime, persistSettings]
  );

  const handleChangeTempo = useCallback(
    (tempo: number) => {
      const clamped = Math.max(0.75, Math.min(1.25, Math.round(tempo * 20) / 20));
      persistSettings({ ...settingsRef.current, tempo: clamped });
      if (videoRef.current) videoRef.current.playbackRate = clamped;
      if (audioRef.current) {
        audioRef.current.playbackRate = clamped;
        audioRef.current.preservesPitch = true;
      }
    },
    [persistSettings]
  );

  const handleChangeVolume = useCallback((vol: number) => {
    setVolume(vol);
    if (vol > 0 && isMuted) setIsMuted(false);
    engineRef.current?.setVolume(vol);
  }, [isMuted]);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      engineRef.current?.setVolume(next ? 0 : volume);
      return next;
    });
  }, [volume]);

  const handleDownloadTrack = useCallback(
    async (track: KaraokeTrack) => {
      try {
        await api.downloadTrack(track);
        const list = await api.listDownloads();
        setDownloads(list);
      } catch {
        // progress map already surfaces error state
      }
    },
    [api]
  );

  const handleDeleteDownload = useCallback(
    async (videoId: string) => {
      await api.deleteDownload(videoId);
      const list = await api.listDownloads();
      setDownloads(list);
    },
    [api]
  );

  // Desktop keyboard shortcuts when on Stage
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (activeTab !== 'stage' || !activeTrack) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        void handleTogglePlay();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleChangePitch(settingsRef.current.pitchSemitones + 1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleChangePitch(settingsRef.current.pitchSemitones - 1);
      } else if (e.key === '[') {
        e.preventDefault();
        handleChangeOffset(settingsRef.current.audioOffsetMs - 25);
      } else if (e.key === ']') {
        e.preventDefault();
        handleChangeOffset(settingsRef.current.audioOffsetMs + 25);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleSeek((videoRef.current?.currentTime || 0) - 5);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleSeek((videoRef.current?.currentTime || 0) + 5);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, activeTrack, handleChangeOffset, handleChangePitch, handleSeek, handleTogglePlay]);

  return (
    <div className="h-full w-full flex bg-[#0D0E11] text-[#F4F5F7] overflow-hidden">
      {/* Hidden persistent audio element routed into PitchAudioEngine */}
      <audio ref={audioRef} crossOrigin="anonymous" preload="auto" className="hidden" />

      {/* Navigation Rail (Desktop) + Bottom Tab Bar (Mobile) */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        downloadCount={downloads.length}
        hasActiveTrack={Boolean(activeTrack)}
        isPlaying={isPlaying}
        recents={recents}
        onPlayTrack={handlePlayTrack}
      />

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 h-full flex flex-col overflow-hidden relative">
        {/* Discover / Search View */}
        {activeTab === 'discover' && (
          <div className="h-full flex flex-col overflow-hidden">
            <SearchHeader
              query={searchQuery}
              activeCategory={activeCategory}
              isLoading={isSearching}
              onSearch={handleSearch}
              onSelectCategory={handleSelectCategory}
            />
            <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5 pb-32 md:pb-24">
              <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[15px] font-semibold text-[#E5E7EB]">
                    {searchQuery
                      ? `Karaoke results for "${searchQuery}"`
                      : KARAOKE_CATEGORIES.find((c) => c.id === activeCategory)?.label || 'Karaoke'}
                  </h2>
                  {!isSearching && tracks.length > 0 && (
                    <span className="text-[12px] font-mono-num text-[#6B7280]">
                      {tracks.length} tracks
                    </span>
                  )}
                </div>

                <TrackGrid
                  tracks={tracks}
                  isLoading={isSearching}
                  error={searchError}
                  activeTrackId={activeTrack?.id}
                  downloadedIds={downloadedIds}
                  downloadProgressMap={downloadProgressMap}
                  onPlay={handlePlayTrack}
                  onDownload={handleDownloadTrack}
                  onRetry={() =>
                    runSearch(
                      searchQuery ||
                        KARAOKE_CATEGORIES.find((c) => c.id === activeCategory)?.query ||
                        KARAOKE_CATEGORIES[0].query
                    )
                  }
                />
              </div>
            </div>
          </div>
        )}

        {/* Stage Player View (stays mounted so video element & playback persist smoothly) */}
        <StagePlayer
          visible={activeTab === 'stage'}
          track={activeTrack}
          streamBundle={streamBundle}
          isLoadingStream={isLoadingStream}
          streamError={streamError}
          settings={settings}
          engineMode={engineMode}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          volume={volume}
          isMuted={isMuted}
          isDownloaded={activeTrack ? downloadedIds.has(activeTrack.id) : false}
          downloadProgress={activeTrack ? downloadProgressMap[activeTrack.id] : undefined}
          videoRef={videoRef}
          onTogglePlay={() => void handleTogglePlay()}
          onSeek={handleSeek}
          onChangePitch={handleChangePitch}
          onChangeOffset={handleChangeOffset}
          onChangeTempo={handleChangeTempo}
          onChangeVolume={handleChangeVolume}
          onToggleMute={handleToggleMute}
          onDownload={() => activeTrack && void handleDownloadTrack(activeTrack)}
          onRetryStream={() => activeTrack && void loadTrackStreams(activeTrack)}
          onGoDiscover={() => setActiveTab('discover')}
        />

        {/* Offline Downloads Library View */}
        {activeTab === 'downloads' && (
          <div className="h-full overflow-y-auto">
            <DownloadsView
              downloads={downloads}
              activeTrackId={activeTrack?.id}
              onPlay={handlePlayTrack}
              onDelete={(id) => void handleDeleteDownload(id)}
              onGoDiscover={() => setActiveTab('discover')}
            />
          </div>
        )}

        {/* Compact MiniPlayer when browsing outside Stage */}
        {activeTrack && activeTab !== 'stage' && (
          <MiniPlayer
            track={activeTrack}
            settings={settings}
            isPlaying={isPlaying}
            onTogglePlay={() => void handleTogglePlay()}
            onOpenStage={() => setActiveTab('stage')}
          />
        )}
      </main>
    </div>
  );
}
