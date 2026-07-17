import Link from 'next/link';
import Image from 'next/image';
import { brand } from '@/config/brand';

/**
 * Shared two-column split shell for the auth screens (Obsidian & Brass).
 *
 * LEFT  = ink brand panel (bg-primary / text-primary-foreground): reversed
 *         logo, an Instrument Serif quote, a trust row, a soft brass glow and
 *         a faint brass equalizer. Hidden below lg; the form takes the full
 *         width on mobile.
 * RIGHT = the form, centered on the surface.
 *
 * Purely presentational. All auth logic lives in the page components.
 */
export function AuthSplitShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* LEFT — ink brand panel */}
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-primary p-12 text-primary-foreground lg:flex xl:p-16">
        {/* soft brass glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-32 top-1/4 h-[28rem] w-[28rem] rounded-full bg-brand/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -right-24 h-[24rem] w-[24rem] rounded-full bg-brand/10 blur-3xl"
        />

        {/* logo */}
        <div className="relative z-10">
          <Link
            href="/"
            className="inline-flex transition-opacity hover:opacity-80"
            aria-label={`${brand.name} home`}
          >
            <Image
              src="/logo/full-reversed.svg"
              alt={brand.logoAlt}
              width={171}
              height={32}
              priority
              className="h-8 w-auto"
            />
          </Link>
        </div>

        {/* serif quote */}
        <div className="relative z-10 max-w-md">
          <p className="font-display text-3xl leading-[1.1] tracking-[-0.015em] xl:text-4xl">
            Voice agents that answer every call, book every appointment, and
            never miss a lead.
          </p>
          <p className="mt-6 text-sm text-primary-foreground/60">
            Deployed across Healthcare, Restaurants, and Real Estate.
          </p>
        </div>

        {/* trust row + faint equalizer */}
        <div className="relative z-10 space-y-6">
          <div
            aria-hidden
            className="flex h-8 items-end gap-1"
            title="Live call activity"
          >
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <span
                key={i}
                className="w-1 rounded-full bg-brand/50 animate-vv-eq"
                style={{
                  height: '100%',
                  transformOrigin: 'bottom',
                  animationDelay: `${i * 0.15}s`,
                }}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-primary-foreground/60">
            <span>SOC 2 Type II</span>
            <span aria-hidden>&middot;</span>
            <span>HIPAA ready</span>
            <span aria-hidden>&middot;</span>
            <span>256-bit encryption</span>
          </div>
        </div>
      </aside>

      {/* RIGHT — form */}
      <main className="flex flex-1 flex-col px-4 py-10 sm:px-8">
        {/* mobile logo (left panel hidden below lg) */}
        <div className="mb-8 lg:hidden">
          <Link
            href="/"
            className="inline-flex transition-opacity hover:opacity-80"
            aria-label={`${brand.name} home`}
          >
            <Image
              src="/logo/full.svg"
              alt={brand.logoAlt}
              width={171}
              height={32}
              priority
              className="h-8 w-auto"
            />
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md animate-vv-fade-up">{children}</div>
        </div>
      </main>
    </div>
  );
}
