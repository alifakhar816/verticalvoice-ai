import Link from 'next/link';
import type { Metadata } from 'next';
import {
  Building2,
  Zap,
  Filter,
  CalendarCheck,
  Home,
  Repeat,
  Scale,
  Check,
} from 'lucide-react';
import { brand } from '@/config/brand';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LiveCallOrb } from '@/components/shared/live-call-orb';

const ACCENT = 'var(--vertical-realestate)';
const tint = (pct: number) =>
  `color-mix(in oklab, ${ACCENT} ${pct}%, transparent)`;

export const metadata: Metadata = {
  title: `Real Estate AI Voice Agent | ${brand.name}`,
  description:
    'AI voice agent for real estate. Speed-to-lead in under 30 seconds, qualify buyers, book showings, and nurture prospects 24/7. Convert 3x more leads.',
};

const transcript = [
  { speaker: 'caller' as const, text: 'Calling about the listing on Oak Street. Is it still available?' },
  {
    speaker: 'agent' as const,
    text: 'It is. To match you well, what is your budget range and timeline?',
  },
  { speaker: 'caller' as const, text: 'Around 600k, hoping to move within two months.' },
  {
    speaker: 'agent' as const,
    text: 'Great fit. I can book a showing Thursday at 5, and connect you with the listing agent.',
  },
];

const capabilities = [
  {
    title: 'Speed-to-lead',
    description:
      'Respond to property inquiries in under 30 seconds, day or night. The first agent to respond wins the lead, and now that is always you.',
    icon: Zap,
  },
  {
    title: 'Lead qualification',
    description:
      'Asks the right questions to qualify buyers: budget, timeline, pre-approval status, and property preferences, then scores the lead automatically.',
    icon: Filter,
  },
  {
    title: 'Showing scheduler',
    description:
      'Books property showings against listing-agent availability and sends confirmations plus reminders to both parties.',
    icon: CalendarCheck,
  },
  {
    title: 'Fair-housing guard',
    description:
      'Fair-housing rules are enforced in code, not left to a prompt. The agent describes properties by objective features only and never steers on any protected class.',
    icon: Scale,
    guard: true,
  },
  {
    title: 'Property inquiry handling',
    description:
      'Answers questions about listings, price, square footage, bedrooms, and neighborhood details, straight from your property database.',
    icon: Home,
  },
  {
    title: 'Follow-up nurturing',
    description:
      'Follows up with leads on a customizable cadence and re-engages cold ones with new listings that match their saved criteria.',
    icon: Repeat,
  },
];

const pipelineStats = [
  { value: '3x', label: 'More leads converted', description: 'Compared to agents using voicemail' },
  { value: '<30s', label: 'Response time', description: 'Industry avg is 12+ hours' },
  { value: '100%', label: 'Inquiry coverage', description: 'No call goes unanswered' },
  { value: '24/7', label: 'Availability', description: 'Nights, weekends, holidays' },
];

const responseTimes = [
  { label: brand.name, time: '30 seconds', pct: 3, accent: true },
  { label: 'Top-performing agents', time: '5 minutes', pct: 18 },
  { label: 'Average agents', time: '2 hours', pct: 55 },
  { label: 'Industry average', time: '12+ hours', pct: 100 },
];

const fairHousingPrinciples = [
  {
    title: 'Non-discriminatory language',
    description:
      'The agent describes properties using objective features only, square footage, amenities, school districts, never the demographics of a neighborhood.',
  },
  {
    title: 'Equal treatment protocol',
    description:
      'Every caller receives the same quality of service regardless of accent, name, or background. Consistent scripts ensure equal access to information.',
  },
  {
    title: 'Protected-class awareness',
    description:
      'The agent never asks about or steers based on race, color, religion, sex, national origin, familial status, or disability.',
  },
  {
    title: 'Audit trail',
    description:
      'Complete transcripts of every interaction are logged for compliance review, providing evidence of fair treatment.',
  },
];

const crmIntegrations = ['Follow Up Boss', 'kvCORE', 'BoomTown', 'LionDesk', 'Salesforce', 'HubSpot'];

export default function RealEstatePage() {
  return (
    <>
      {/* Hero, tinted emerald */}
      <section className="relative overflow-hidden border-b">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to bottom, ${tint(8)}, transparent 70%)`,
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
                <Building2 className="mr-1.5 size-3.5" aria-hidden />
                Real Estate
              </Badge>
              <h1 className="font-display text-4xl tracking-tight sm:text-5xl lg:text-6xl">
                Respond first,{' '}
                <span style={{ color: ACCENT }}>close more</span>
              </h1>
              <p className="mt-6 text-lg leading-8 text-muted-foreground">
                In real estate, the first responder wins the deal. Your agent
                answers property inquiries in under 30 seconds, qualifies leads,
                and books showings, around the clock.
              </p>
              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <Link href="/signup">
                  <Button size="lg" className="h-12 px-8 text-base">
                    Start your real estate agent
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

      {/* Pipeline stats */}
      <section className="border-b bg-secondary/30">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {pipelineStats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div
                  className="font-display text-4xl tabular-nums sm:text-5xl"
                  style={{ color: ACCENT }}
                >
                  {stat.value}
                </div>
                <div className="mt-2 text-sm font-semibold">{stat.label}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {stat.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
            Built for real estate workflows
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            From first contact to closed deal, your AI agent drives the pipeline
            forward.
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

      {/* Speed-to-lead */}
      <section className="border-y bg-secondary/30">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <Badge variant="outline" className="mb-4">
                Speed wins deals
              </Badge>
              <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
                The 30-second advantage
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Responding to a lead within five minutes makes you 21 times more
                likely to qualify them. Your AI agent responds in under 30
                seconds.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  'Instant response to Zillow, Realtor.com, and website leads',
                  'After-hours inquiries answered immediately',
                  'Warm transfer to agents for hot prospects',
                  'Automatic lead scoring and CRM updates',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm">
                    <Check className="size-4 shrink-0 text-brand" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-6">
              <div className="text-sm font-medium">Average lead response time</div>
              {responseTimes.map((item) => (
                <div key={item.label}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="font-medium">{item.label}</span>
                    <span className="font-mono text-muted-foreground">
                      {item.time}
                    </span>
                  </div>
                  <div className="h-4 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${item.pct}%`,
                        minWidth: '2rem',
                        backgroundColor: item.accent
                          ? ACCENT
                          : 'var(--muted-foreground)',
                        opacity: item.accent ? 1 : 0.4,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Fair housing */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div
            className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl"
            style={{ backgroundColor: tint(12), color: ACCENT }}
          >
            <Scale className="size-7" aria-hidden />
          </div>
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
            Fair housing, enforced in code
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Fair-housing compliance is not a suggestion in the prompt. It is
            enforced in the agent logic on every interaction, helping protect
            your brokerage from compliance risk.
          </p>
        </div>
        <div className="mt-16 grid gap-6 sm:grid-cols-2">
          {fairHousingPrinciples.map((item) => (
            <div key={item.title} className="rounded-lg border bg-card p-6">
              <div className="flex items-center gap-3">
                <Check className="size-5 shrink-0 text-brand" aria-hidden />
                <h3 className="font-semibold">{item.title}</h3>
              </div>
              <p className="mt-3 pl-8 text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CRM integration */}
      <section className="border-y bg-secondary/30">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div className="flex items-center justify-center">
              <div className="relative h-64 w-64">
                <div
                  className="absolute left-1/2 top-1/2 flex size-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-primary-foreground shadow-lg"
                  style={{ backgroundColor: ACCENT }}
                >
                  <Building2 className="size-10" aria-hidden />
                </div>
                {[
                  { x: -90, y: -70, label: 'CRM' },
                  { x: 90, y: -70, label: 'MLS' },
                  { x: -110, y: 40, label: 'Zillow' },
                  { x: 110, y: 40, label: 'Calendar' },
                  { x: 0, y: 100, label: 'Phone' },
                ].map((node) => (
                  <div
                    key={node.label}
                    className="absolute flex size-14 items-center justify-center rounded-xl border bg-card text-xs font-medium shadow-sm"
                    style={{
                      left: `calc(50% + ${node.x}px - 28px)`,
                      top: `calc(50% + ${node.y}px - 28px)`,
                    }}
                  >
                    {node.label}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
                CRM integration ready
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Leads flow directly into your CRM with qualification data,
                property preferences, and interaction history. No manual data
                entry.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                {crmIntegrations.map((name) => (
                  <Badge key={name} variant="outline" className="px-4 py-2 text-sm">
                    {name}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="rounded-2xl bg-primary px-8 py-16 text-center text-primary-foreground sm:px-16">
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
            Start your real estate agent
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-primary-foreground/80">
            Respond to every inquiry in seconds, qualify leads automatically,
            and close more deals. Setup takes under 10 minutes.
          </p>
          <div className="mt-8">
            <Link href="/signup">
              <Button size="lg" variant="secondary" className="h-12 px-8 text-base">
                {brand.copy.ctaButton}
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
