"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { track as trackAnalyticsEvent } from "@vercel/analytics";
import { tracks, type Track } from "@/app/lib/tracks";
import { useYouTubePlayer, YT_PLAYER_STATE } from "@/app/lib/useYouTubePlayer";

// Element id the YouTube IFrame API mounts its player into. Kept
// visible (small, corner-docked) per platform requirement; the rest of
// the player UI design is untouched.
const YT_CONTAINER_ID = "yt-audio-player";

const GLASS =
  "border border-white/10 bg-gradient-to-b from-white/[0.15] to-white/[0.055] backdrop-blur-3xl backdrop-saturate-[1.7] shadow-[0_16px_48px_-12px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.2)]";

const ACCENT = "#e0af5c"; // amber-300, matches existing palette
const ACCENT_SOFT = "rgba(224,175,92,0.55)";

function formatTime(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

// Analytics for YouTube playback errors. Logs error code + videoId so
// failures (invalid id, embed disabled, removed video, etc.) are
// traceable both in the console and as a Vercel Analytics custom event.
function logYouTubeError(errorCode: number, videoId: string | undefined) {
  const payload = { errorCode, videoId: videoId ?? "unknown" };
  console.error("[nostalgia-radio] YouTube playback error", payload);
  trackAnalyticsEvent("youtube_playback_error", payload);
}

/* ------------------------------------------------------------------ */
/* Icons — module scope, purely presentational                         */
/* ------------------------------------------------------------------ */

function PlayIcon({ playing, className }: { playing: boolean; className?: string }) {
  if (playing) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <rect x="6.5" y="5" width="4" height="14" rx="1" />
        <rect x="13.5" y="5" width="4" height="14" rx="1" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M7 4.5v15l13-7.5-13-7.5Z" />
    </svg>
  );
}

function SkipIcon({ direction, className }: { direction: "prev" | "next"; className?: string }) {
  const flip = direction === "prev" ? "scale-x-[-1]" : "";
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={`${className ?? ""} ${flip}`}>
      <path d="M6 5v14h2V5H6Zm3.5 7 10 7V5l-10 7Z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Shared sub-pieces — module scope so identity is stable across       */
/* progress re-renders (this keeps the vinyl's CSS animation running   */
/* instead of restarting on every tick).                               */
/* ------------------------------------------------------------------ */

type VinylProps = {
  playing: boolean;
  sizeClassName: string;
  spindleSizeClassName: string;
};

function Vinyl({ playing, sizeClassName, spindleSizeClassName }: VinylProps) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full border border-amber-100/25 bg-gradient-to-br from-amber-500 via-rust-500 to-rust-700 shadow-[0_6px_18px_-4px_rgba(0,0,0,0.7)] ${sizeClassName}`}
      style={{
        animation: "spin 8s linear infinite",
        animationPlayState: playing ? "running" : "paused",
      }}
    >
      {/* grooves */}
      <div className="absolute inset-1.5 rounded-full border border-amber-100/10" />
      <div className="absolute inset-3 rounded-full border border-amber-100/10" />
      <div className="absolute inset-[18%] rounded-full border border-amber-100/10" />
      {/* label sheen */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-black/30" />
      {/* spindle hole */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className={`rounded-full bg-black/70 ring-2 ring-white/40 ${spindleSizeClassName}`} />
      </div>
    </div>
  );
}

type TrackInfoProps = {
  track: Track;
  titleClassName: string;
  artistClassName: string;
};

function TrackInfo({ track, titleClassName, artistClassName }: TrackInfoProps) {
  return (
    <div className="min-w-0 flex-1">
      <p className={`truncate text-amber-50 text-shadow-soft ${titleClassName}`}>{track.title}</p>
      <p className={`truncate text-white/70 ${artistClassName}`}>
        {track.movie} &middot; {track.year}
      </p>
    </div>
  );
}

type SeekBarProps = {
  progressRatio: number; // 0..1
  onSeek: (ratio: number) => void;
  className?: string;
};

function SeekBar({ progressRatio, onSeek, className }: SeekBarProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const ratioFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0; // not laid out yet — avoid NaN/Infinity
    const raw = (clientX - rect.left) / rect.width;
    return Math.min(1, Math.max(0, raw));
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      setDragging(true);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      onSeek(ratioFromClientX(e.clientX));
    },
    [onSeek, ratioFromClientX]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      onSeek(ratioFromClientX(e.clientX));
    },
    [dragging, onSeek, ratioFromClientX]
  );

  const endDrag = useCallback(() => setDragging(false), []);

  const pct = `${progressRatio * 100}%`;

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={dragging ? undefined : endDrag}
      className={`group/seek relative flex h-6 w-full touch-none items-center ${className ?? ""}`}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progressRatio * 100)}
    >
      {/* rail */}
      <div className="relative h-[3px] w-full overflow-visible rounded-full bg-white/15">
        {/* played fill with soft glow */}
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: pct,
            backgroundColor: ACCENT,
            boxShadow: `0 0 8px 1px ${ACCENT_SOFT}`,
          }}
        />
        {/* knob — hidden normally, visible on hover/drag */}
        <div
          className={`pointer-events-none absolute top-1/2 h-3 w-3 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.5)] transition-opacity duration-150 ${
            dragging ? "opacity-100" : "opacity-0 group-hover/seek:opacity-100"
          }`}
          style={{ left: pct }}
        />
      </div>
    </div>
  );
}

type TimeReadoutProps = {
  elapsed: number;
  duration: number;
  className?: string;
};

function TimeReadout({ elapsed, duration, className }: TimeReadoutProps) {
  return (
    <div className={`flex items-center gap-1 tabular-nums text-[10.5px] text-white/60 ${className ?? ""}`}>
      <span>{formatTime(elapsed)}</span>
      <span className="text-white/30">/</span>
      <span>{formatTime(duration)}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Spotify embed — plays fully in-app, no redirect to open.spotify.com */
/* ------------------------------------------------------------------ */

function SpotifyEmbed({ spotifyId }: { spotifyId: string }) {
  return (
    <iframe
      key={spotifyId}
      title="Spotify player"
      src={`https://open.spotify.com/embed/track/${spotifyId}?utm_source=generator&theme=0`}
      width="100%"
      height="80"
      style={{ borderRadius: "12px", border: "none" }}
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
    />
  );
}

type TransportProps = {
  playing: boolean;
  onPrev: () => void;
  onToggle: () => void;
  onNext: () => void;
  size: "desktop" | "mobile";
};

function Transport({ playing, onPrev, onToggle, onNext, size }: TransportProps) {
  const isMobile = size === "mobile";
  const sideBtn = isMobile
    ? "flex h-11 w-11 items-center justify-center rounded-full text-white/75 transition-colors duration-200 hover:text-white active:scale-95"
    : "flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition-colors duration-200 hover:text-white active:scale-95";
  const iconSize = isMobile ? "h-5 w-5" : "h-4 w-4";
  const playBtn = isMobile
    ? "flex h-[52px] w-[52px] items-center justify-center rounded-full bg-gradient-to-b from-amber-300 to-rust-500 text-ink ring-1 ring-white/25 shadow-[0_8px_24px_-6px_rgba(224,175,92,0.65)] transition-transform duration-200 active:scale-95"
    : "flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-b from-amber-300 to-rust-500 text-ink ring-1 ring-white/25 shadow-[0_6px_16px_-4px_rgba(224,175,92,0.6)] transition-transform duration-200 hover:scale-105 active:scale-95";
  const playIconSize = isMobile ? "h-6 w-6" : "h-5 w-5";

  return (
    <div className={`flex items-center ${isMobile ? "justify-center gap-5" : "gap-2"}`}>
      <button type="button" onClick={onPrev} aria-label="Previous track" className={sideBtn}>
        <SkipIcon direction="prev" className={iconSize} />
      </button>
      <button type="button" onClick={onToggle} aria-label={playing ? "Pause" : "Play"} className={playBtn}>
        <PlayIcon playing={playing} className={`${playIconSize} ${playing ? "" : "ml-0.5"}`} />
      </button>
      <button type="button" onClick={onNext} aria-label="Next track" className={sideBtn}>
        <SkipIcon direction="next" className={iconSize} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Desktop player — horizontal floating pill                           */
/* ------------------------------------------------------------------ */

type PlayerProps = {
  track: Track;
  playing: boolean;
  elapsed: number;
  onSeek: (ratio: number) => void;
  onPrev: () => void;
  onToggle: () => void;
  onNext: () => void;
};

function DesktopPlayer({ track, playing, elapsed, onSeek, onPrev, onToggle, onNext }: PlayerProps) {
  const progressRatio = track.duration > 0 ? elapsed / track.duration : 0;

  return (
    <div className={`hidden sm:flex w-full max-w-xl flex-col gap-2 rounded-[26px] p-3 ${GLASS}`}>
      <div className="flex items-center gap-4 pr-2">
        <Vinyl playing={playing} sizeClassName="h-20 w-20" spindleSizeClassName="h-3 w-3" />

        <div className="min-w-0 flex-1">
          <TrackInfo track={track} titleClassName="text-[15px] font-semibold" artistClassName="text-[12.5px]" />
          <div className="mt-1.5 flex items-center gap-2">
            <TimeReadout elapsed={elapsed} duration={track.duration} />
            <SeekBar progressRatio={progressRatio} onSeek={onSeek} className="flex-1" />
          </div>
        </div>

        <Transport playing={playing} onPrev={onPrev} onToggle={onToggle} onNext={onNext} size="desktop" />
      </div>
      {track.spotifyId && <SpotifyEmbed spotifyId={track.spotifyId} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile player — stacked card                                        */
/* ------------------------------------------------------------------ */

function MobilePlayer({ track, playing, elapsed, onSeek, onPrev, onToggle, onNext }: PlayerProps) {
  const progressRatio = track.duration > 0 ? elapsed / track.duration : 0;

  return (
    <div className={`sm:hidden flex w-full max-w-xl flex-col gap-3 rounded-[26px] p-4 ${GLASS}`}>
      {/* Row 1 */}
      <div className="flex items-center gap-3">
        <Vinyl playing={playing} sizeClassName="h-16 w-16" spindleSizeClassName="h-3 w-3" />
        <TrackInfo track={track} titleClassName="text-[15px] font-semibold" artistClassName="text-[12.5px]" />
      </div>

      {/* Row 2 */}
      <SeekBar progressRatio={progressRatio} onSeek={onSeek} />

      {/* Row 3 */}
      <div className="relative flex items-center">
        <TimeReadout elapsed={elapsed} duration={track.duration} className="absolute left-0" />
        <div className="mx-auto">
          <Transport playing={playing} onPrev={onPrev} onToggle={onToggle} onNext={onNext} size="mobile" />
        </div>
      </div>

      {track.spotifyId && <SpotifyEmbed spotifyId={track.spotifyId} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Container — owns playback state, renders both blocks                */
/* ------------------------------------------------------------------ */

export default function MusicPlayer() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const track = useMemo(() => tracks[index], [index]);

  // Mutable snapshot of the current track, readable from inside the
  // YouTube event callbacks below without re-subscribing the player.
  const trackRef = useRef(track);
  trackRef.current = track;

  const next = useCallback(() => {
    setIndex((prev) => (prev + 1) % tracks.length);
    setElapsed(0);
  }, []);

  const prev = useCallback(() => {
    setIndex((prev) => (prev - 1 + tracks.length) % tracks.length);
    setElapsed(0);
  }, []);

  // Reflect YouTube's actual state onto the UI, and react to track end
  // or playback errors — both simply advance to the next track.
  const handleStateChange = useCallback(
    (state: number) => {
      if (!trackRef.current.videoId) return; // event from a stale/unattached player
      if (state === YT_PLAYER_STATE.PLAYING) setPlaying(true);
      else if (state === YT_PLAYER_STATE.PAUSED) setPlaying(false);
      else if (state === YT_PLAYER_STATE.ENDED) next();
    },
    [next]
  );

  const handleError = useCallback(
    (errorCode: number) => {
      // Any YouTube playback error (invalid id, embed disabled, etc.) —
      // log it for analytics, then skip forward rather than getting
      // stuck on this track.
      logYouTubeError(errorCode, trackRef.current.videoId);
      next();
    },
    [next]
  );

  const {
    load: loadVideo,
    play: playVideo,
    pause: pauseVideo,
    seekTo,
    getCurrentTime,
  } = useYouTubePlayer(YT_CONTAINER_ID, handleStateChange, handleError);

  // Advance playback while playing. YouTube-backed tracks (videoId) are
  // driven by a rAF loop polling YouTube's real playback time, so the
  // seek bar moves smoothly instead of in steps. Spotify-backed tracks
  // (spotifyId) and tracks with neither play their audio via the
  // Spotify embed widget or not at all, respectively — either way this
  // UI's own elapsed clock is just a synthetic tick so the seek bar and
  // timer still progress, since Spotify's embed doesn't expose a
  // postMessage/JS API for us to read real playback time from.
  useEffect(() => {
    if (!playing) return;

    if (track.videoId) {
      let frameId: number;
      const tick = () => {
        setElapsed(getCurrentTime());
        frameId = requestAnimationFrame(tick);
      };
      frameId = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(frameId);
    }

    const interval = setInterval(() => {
      setElapsed((prev) => {
        if (prev + 1 >= track.duration) {
          setIndex((i) => (i + 1) % tracks.length);
          return 0;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [playing, track.duration, track.videoId, getCurrentTime]);

  // Load the current track's video whenever it changes. A missing
  // videoId is a silent no-op — nothing to load yet for that track.
  useEffect(() => {
    loadVideo(track.videoId, playing);
  }, [track.videoId, loadVideo, playing]);

  // Mirror the play/pause UI state onto the YouTube player.
  useEffect(() => {
    if (playing) {
      playVideo();
    } else {
      pauseVideo();
    }
  }, [playing, playVideo, pauseVideo]);

  const togglePlay = useCallback(() => {
    setPlaying((p) => !p);
  }, []);

  const seek = useCallback(
    (ratio: number) => {
      const seconds = ratio * track.duration;
      setElapsed(seconds);
      if (track.videoId) seekTo(seconds);
    },
    [track.duration, track.videoId, seekTo]
  );

  return (
    <>
      {/* YouTube player — audio-only. Kept mounted and functional but
          visually off-screen: YouTube's own error/ad overlays render
          relative to this iframe and can otherwise cover the UI. */}
      <div
        id={YT_CONTAINER_ID}
        className="fixed -bottom-[200px] -right-[200px] h-[72px] w-[128px] overflow-hidden opacity-0"
        aria-hidden="true"
      />

      <DesktopPlayer
        track={track}
        playing={playing}
        elapsed={elapsed}
        onSeek={seek}
        onPrev={prev}
        onToggle={togglePlay}
        onNext={next}
      />
      <MobilePlayer
        track={track}
        playing={playing}
        elapsed={elapsed}
        onSeek={seek}
        onPrev={prev}
        onToggle={togglePlay}
        onNext={next}
      />
    </>
  );
}
