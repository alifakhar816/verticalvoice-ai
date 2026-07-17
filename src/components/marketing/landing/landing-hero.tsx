'use client';

import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { LiveCallOrb, type TranscriptLine } from '@/components/shared/live-call-orb';

/* ---------------------------------------------------------------------------
 * Landing hero (flagship, section 5.1)
 * ---------------------------------------------------------------------------
 * Two-column on desktop, stacked on mobile. Left: eyebrow pill with a live
 * pulse dot, Instrument Serif headline, muted subhead, two CTAs, trust strip.
 * Right: the LiveCallOrb "call in progress" panel with a subtle float.
 * Everything reveals on mount with a staggered vv-fade-up.
 * ------------------------------------------------------------------------- */

const HERO_TRANSCRIPT: TranscriptLine[] = [
  { speaker: 'caller', text: 'I need to come in today' },
  {
    speaker: 'agent',
    text: 'I can see an opening at 2:30 this afternoon, does that work?',
  },
];

const TRUST_ITEMS = [
  'No credit card required',
  'Setup in under 5 minutes',
  'Cancel anytime',
];

export function LandingHero() {
  return (
    <section className="relative overflow-hidden">
      {/* Local float keyframe (scoped; global reduced-motion rule also stops it) */}
      <style>{`
        @keyframes vv-float { 0%,100%{transform:translateY(-6px)} 50%{transform:translateY(6px)} }
        .vv-float { animation: vv-float 6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce){ .vv-float{ animation:none } }
      `}</style>

      {/* Soft brass radial wash, top-center only (no gradient blobs) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[620px]"
        style={{
          background:
            'radial-gradient(ellipse 62% 52% at 50% 0%, color-mix(in srgb, var(--brand) 11%, transparent), transparent 70%)',
        }}
      />

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-12 lg:px-8 lg:py-28">
        {/* ---- Left column -------------------------------------------------- */}
        <div className="text-center lg:text-left">
          <div
            className="animate-vv-fade-up mb-6 inline-flex items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-sm text-muted-foreground shadow-sm"
            style={{ animationDelay: '0ms' }}
          >
            <span className="relative flex size-2">
              <span
                className="absolute inline-flex size-full animate-vv-ping rounded-full opacity-70"
                style={{ backgroundColor: 'var(--success)' }}
              />
              <span
                className="relative inline-flex size-2 rounded-full"
                style={{ backgroundColor: 'var(--success)' }}
              />
            </span>
            Now answering calls for 3 industries
          </div>

          <h1
            className="animate-vv-fade-up font-display text-[2.75rem] leading-[1.03] tracking-[-0.015em] text-foreground sm:text-6xl lg:text-[4.25rem]"
            style={{ animationDelay: '60ms' }}
          >
            Your industry already taught the agent what matters.
          </h1>

          <p
            className="animate-vv-fade-up mx-auto mt-6 max-w-xl text-[19px] leading-relaxed text-muted-foreground lg:mx-0"
            style={{ animationDelay: '120ms' }}
          >
            Deploy intelligent voice agents for Healthcare, Restaurants, and
            Real Estate, ready to answer in minutes.
          </p>

          <div
            className="animate-vv-fade-up mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start"
            style={{ animationDelay: '180ms' }}
          >
            <Link href="/signup">
              <Button size="lg" className="group h-12 px-8 text-base">
                Start free trial
                <ArrowRight className="ml-2 size-4 transition-transform duration-150 group-hover:translate-x-[3px]" />
              </Button>
            </Link>
            <Link href="#how-it-works">
              <Button variant="outline" size="lg" className="h-12 px-8 text-base">
                See how it works
              </Button>
            </Link>
          </div>

          <div
            className="animate-vv-fade-up mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-muted-foreground lg:justify-start"
            style={{ animationDelay: '240ms' }}
          >
            {TRUST_ITEMS.map((item) => (
              <div key={item} className="flex items-center gap-2">
                <Check className="size-4" style={{ color: 'var(--success)' }} />
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* ---- Right column: live call panel -------------------------------- */}
        <div
          className="animate-vv-fade-up flex justify-center lg:justify-end"
          style={{ animationDelay: '300ms' }}
        >
          <div className="vv-float w-full max-w-md rounded-xl border bg-card p-6 shadow-lg shadow-black/[0.04]">
            {/* Panel header: caller identity + live state */}
            <div className="mb-6 flex items-center gap-3 border-b pb-5">
              <div className="flex size-11 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-foreground">
                JM
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium text-foreground">
                  Incoming caller
                </p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  +1 (415) 555 0142
                </p>
              </div>
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
                style={{
                  color: 'var(--success)',
                  borderColor: 'color-mix(in srgb, var(--success) 30%, transparent)',
                  backgroundColor:
                    'color-mix(in srgb, var(--success) 12%, transparent)',
                }}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: 'var(--success)' }}
                />
                Live
              </span>
            </div>

            <LiveCallOrb
              size="lg"
              state="live"
              showTranscript
              transcript={HERO_TRANSCRIPT}
              className="!flex-col !items-stretch !gap-6"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export default LandingHero;
