"use client";

import * as React from "react";
import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

/* =====================================================================
   RecordingPlayer  ·  custom audio player with a brass scrubber + waveform
   ---------------------------------------------------------------------
   Wraps a native <audio> element (hidden default chrome) with a
   play/pause control, a mono mm:ss readout, and a clickable waveform
   that doubles as the seek scrubber. The played portion fills brass,
   the rest sits on the muted track. Bar heights are deterministic
   (seeded by index) so the "waveform" is stable across renders.

   No motion loops here, so nothing to gate for reduced motion beyond
   what the browser already does. The src is passed in from the server
   component; this file holds no data logic.
   ===================================================================== */

const BAR_COUNT = 56;

/** Deterministic pseudo-random height (0.25-1) so the waveform is stable. */
function barHeight(i: number): number {
  const seed = Math.sin(i * 12.9898) * 43758.5453;
  const frac = seed - Math.floor(seed);
  return 0.25 + frac * 0.75;
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

export function RecordingPlayer({ src }: { src: string }) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [current, setCurrent] = React.useState(0);
  const [duration, setDuration] = React.useState(0);

  const progress = duration > 0 ? current / duration : 0;

  const toggle = React.useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
    } else {
      el.pause();
    }
  }, []);

  const seekToFraction = React.useCallback(
    (fraction: number) => {
      const el = audioRef.current;
      if (!el || duration <= 0) return;
      el.currentTime = Math.max(0, Math.min(1, fraction)) * duration;
      setCurrent(el.currentTime);
    },
    [duration],
  );

  const bars = React.useMemo(
    () => Array.from({ length: BAR_COUNT }, (_, i) => barHeight(i)),
    [],
  );

  return (
    <div className="flex items-center gap-4">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        className="sr-only"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => setPlaying(false)}
      >
        Your browser does not support the audio element.
      </audio>

      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause recording" : "Play recording"}
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/80 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {playing ? <Pause className="size-5" /> : <Play className="ml-0.5 size-5" />}
      </button>

      {/* Waveform scrubber */}
      <button
        type="button"
        aria-label="Seek recording"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          seekToFraction((e.clientX - rect.left) / rect.width);
        }}
        className="flex h-12 flex-1 items-center gap-[2px] rounded-md px-1 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {bars.map((h, i) => {
          const played = i / bars.length <= progress;
          return (
            <span
              key={i}
              className={cn(
                "w-full rounded-full transition-colors",
                played ? "bg-brand" : "bg-muted-foreground/30",
              )}
              style={{ height: `${Math.round(h * 100)}%` }}
              aria-hidden="true"
            />
          );
        })}
      </button>

      <div className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
        {formatClock(current)} / {formatClock(duration)}
      </div>
    </div>
  );
}

export default RecordingPlayer;
