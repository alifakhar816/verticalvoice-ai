import Link from 'next/link';
import type { Metadata } from 'next';
import {
  UtensilsCrossed,
  CalendarClock,
  ShoppingBag,
  Salad,
  ShieldAlert,
  Users,
  Star,
  Check,
  Phone,
} from 'lucide-react';
import { brand } from '@/config/brand';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LiveCallOrb } from '@/components/shared/live-call-orb';

const ACCENT = 'var(--vertical-restaurant)';
const tint = (pct: number) =>
  `color-mix(in oklab, ${ACCENT} ${pct}%, transparent)`;

export const metadata: Metadata = {
  title: `Restaurant AI Voice Agent | ${brand.name}`,
  description:
    'AI voice agent for restaurants. Handle reservations, takeout orders, menu inquiries, and allergen safety, even during peak hours. Recover $2,400 a month in missed calls.',
};

const transcript = [
  { speaker: 'caller' as const, text: 'Table for four this Saturday at 7, and can I add a takeout order?' },
  {
    speaker: 'agent' as const,
    text: 'Booked a table for four, Saturday at 7:00. What would you like for takeout?',
  },
  { speaker: 'caller' as const, text: 'Two margherita pizzas, one with no basil.' },
  {
    speaker: 'agent' as const,
    text: 'Two margherita, one hold the basil, ready for 6:45. Anything else?',
  },
];

const capabilities = [
  {
    title: 'Reservations and waitlist',
    description:
      'Guests book tables through natural conversation. When you are full, the agent adds them to the waitlist and texts them the moment a table opens.',
    icon: CalendarClock,
  },
  {
    title: 'Phone ordering with modifiers',
    description:
      'Captures complete takeout orders with add-ons, substitutions, and special requests, then reads the order back for confirmation.',
    icon: ShoppingBag,
  },
  {
    title: 'Allergen safety guard',
    description:
      'Every allergen question is answered from your verified menu data only. The agent never guesses on ingredients and flags anything it cannot confirm.',
    icon: ShieldAlert,
    guard: true,
  },
  {
    title: 'Menu and specials',
    description:
      'Answers detailed questions about ingredients, dietary options, and daily specials instantly, with zero wait time for the caller.',
    icon: Salad,
  },
  {
    title: 'Peak mode',
    description:
      'When the dinner rush hits, the agent handles calls in parallel, prioritizes reservations, and escalates large parties. No hold music, no missed orders.',
    icon: Users,
  },
  {
    title: 'Feedback collection',
    description:
      'Follows up after the visit to collect ratings, and routes anything negative to a manager immediately, before it reaches social media.',
    icon: Star,
  },
];

const revenueItems = [
  { label: 'Missed calls per week (industry avg)', value: '62' },
  { label: 'Average order value', value: '$38' },
  { label: 'Calls converted to orders', value: '25%' },
  { label: 'Monthly revenue recovered', value: '$2,400+', highlight: true },
];

const peakLog = [
  { time: '6:31 PM', action: 'Reservation booked, party of 4, 7:30 PM', status: 'done' },
  { time: '6:32 PM', action: 'Takeout order, 2 entrees, pickup 7:00 PM', status: 'done' },
  { time: '6:33 PM', action: 'Waitlist, party of 6, est. 25 min', status: 'done' },
  { time: '6:34 PM', action: 'Menu inquiry, gluten-free options', status: 'active' },
  { time: '6:34 PM', action: 'Incoming call, holding', status: 'pending' },
];

const dotColor: Record<string, string> = {
  done: 'var(--success)',
  active: ACCENT,
  pending: 'var(--muted-foreground)',
};

const posIntegrations = ['Toast', 'Square', 'Clover', 'Revel', 'TouchBistro', 'Lightspeed'];

export default function RestaurantPage() {
  return (
    <>
      {/* Hero, tinted copper */}
      <section className="relative overflow-hidden border-b">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to bottom, ${tint(9)}, transparent 70%)`,
          }}
        />
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-28 lg:px-8">
          <div className="grid gap-14 lg:grid-cols-2 lg:items-center">
            <div>
              <Badge
                variant="outline"
                className="mb-6"
                style={{ borderColor: tint(40), color: ACCENT }}
              >
                <UtensilsCrossed className="mr-1.5 size-3.5" aria-hidden />
                Restaurant
              </Badge>
              <h1 className="font-display text-4xl tracking-tight sm:text-5xl lg:text-6xl">
                Never miss a{' '}
                <span style={{ color: ACCENT }}>reservation again</span>
              </h1>
              <p className="mt-6 text-lg leading-8 text-muted-foreground">
                A warm, capable voice agent that handles reservations, orders,
                and menu questions even during the dinner rush. Every call
                answered, every order captured.
              </p>
              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <Link href="/signup">
                  <Button size="lg" className="h-12 px-8 text-base">
                    Start your restaurant agent
                  </Button>
                </Link>
                <Link href="/industries">
                  <Button variant="outline" size="lg" className="h-12 px-8 text-base">
                    View all industries
                  </Button>
                </Link>
              </div>
            </div>

            <Card className="p-8 sm:p-10">
              <LiveCallOrb
                size="lg"
                state="live"
                accent={ACCENT}
                showTranscript
                transcript={transcript}
                className="items-start"
              />
            </Card>
          </div>
        </div>
      </section>

      {/* Revenue recovery */}
      <section className="border-b bg-secondary/30">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
                Recover{' '}
                <span style={{ color: ACCENT }}>$2,400 a month</span> in missed
                calls
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                The average restaurant misses 62 calls per week. Each one is a
                lost reservation or takeout order. Our agent picks up every
                single one.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {revenueItems.map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border bg-card p-5"
                  style={
                    item.highlight
                      ? { borderColor: tint(45), backgroundColor: tint(6) }
                      : undefined
                  }
                >
                  <div
                    className="font-display text-2xl tabular-nums sm:text-3xl"
                    style={item.highlight ? { color: ACCENT } : undefined}
                  >
                    {item.value}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground sm:text-sm">
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
            Everything your phone line needs
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            From reservation booking to post-meal feedback, your AI agent
            handles it all.
          </p>
        </div>
        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((item) => (
            <Card
              key={item.title}
              className="transition-shadow hover:shadow-lg"
              style={
                item.guard
                  ? { borderColor: tint(40), backgroundColor: tint(5) }
                  : undefined
              }
            >
              <CardHeader>
                <div
                  className="mb-3 flex size-12 items-center justify-center rounded-xl"
                  style={{ backgroundColor: tint(12), color: ACCENT }}
                >
                  <item.icon className="size-6" aria-hidden />
                </div>
                <CardTitle className="text-lg">{item.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Peak mode */}
      <section className="border-y bg-secondary/30">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div className="flex items-center justify-center">
              <div className="w-full max-w-md overflow-hidden rounded-2xl border bg-card shadow-lg">
                <div
                  className="border-b px-6 py-4 text-primary-foreground"
                  style={{ backgroundColor: ACCENT }}
                >
                  <div className="flex items-center gap-2">
                    <Phone className="size-5" aria-hidden />
                    <span className="font-semibold">Peak mode active</span>
                  </div>
                  <div className="mt-1 text-sm text-primary-foreground/85">
                    Friday 6:30 PM, high call volume detected
                  </div>
                </div>
                <div className="space-y-4 p-6">
                  {peakLog.map((item) => (
                    <div key={item.time + item.action} className="flex items-start gap-3">
                      <div className="mt-0.5 whitespace-nowrap font-mono text-xs text-muted-foreground">
                        {item.time}
                      </div>
                      <span
                        className={`mt-1.5 size-2 shrink-0 rounded-full ${
                          item.status === 'active' ? 'animate-vv-ping' : ''
                        }`}
                        style={{ backgroundColor: dotColor[item.status] }}
                        aria-hidden
                      />
                      <div className="text-sm">{item.action}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <Badge variant="outline" className="mb-4">
                Rush hour ready
              </Badge>
              <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
                Peak mode handles the overflow
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                When call volume spikes during lunch and dinner rushes, your AI
                agent scales instantly. No hold times, no missed calls, no
                frustrated guests.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  'Handles multiple calls simultaneously',
                  'Prioritizes reservations over general inquiries',
                  'Auto-escalates VIP guests and large parties',
                  'Real-time dashboard during peak periods',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm">
                    <Check className="size-4 shrink-0 text-brand" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* POS integration */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
              POS integration ready
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Orders taken by the AI agent flow directly into your point-of-sale
              system. No manual re-entry, no errors, no delays.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {posIntegrations.map((name) => (
                <Badge key={name} variant="outline" className="px-4 py-2 text-sm">
                  {name}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-3">
              {['Phone call', 'AI agent', 'POS system'].map((label, i) => (
                <div key={label} className="flex items-center gap-4 sm:gap-3">
                  <div
                    className="flex size-24 items-center justify-center rounded-2xl border text-center text-xs font-semibold shadow-sm"
                    style={{
                      backgroundColor: tint(10),
                      borderColor: tint(35),
                      color: 'var(--foreground)',
                    }}
                  >
                    {label}
                  </div>
                  {i < 2 && (
                    <span
                      aria-hidden
                      className="hidden text-lg sm:block"
                      style={{ color: ACCENT }}
                    >
                      &rarr;
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="rounded-2xl bg-primary px-8 py-16 text-center text-primary-foreground sm:px-16">
            <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
              Start your restaurant agent
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-primary-foreground/80">
              Answer every call, capture every order, and recover the revenue
              your voicemail is losing. Setup takes under 10 minutes.
            </p>
            <div className="mt-8">
              <Link href="/signup">
                <Button size="lg" variant="secondary" className="h-12 px-8 text-base">
                  {brand.copy.ctaButton}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
