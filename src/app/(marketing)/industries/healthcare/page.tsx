import Link from 'next/link';
import type { Metadata } from 'next';
import {
  HeartPulse,
  CalendarCheck,
  BellRing,
  Pill,
  ShieldAlert,
  ShieldCheck,
  FileLock2,
  ScrollText,
  FlaskConical,
  Check,
} from 'lucide-react';
import { brand } from '@/config/brand';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LiveCallOrb } from '@/components/shared/live-call-orb';

const ACCENT = 'var(--vertical-healthcare)';
const tint = (pct: number) =>
  `color-mix(in oklab, ${ACCENT} ${pct}%, transparent)`;

export const metadata: Metadata = {
  title: `Healthcare AI Voice Agent | ${brand.name}`,
  description:
    'HIPAA-ready AI voice agent for healthcare. Automate appointment scheduling, patient reminders, prescription refills, and insurance verification. Setup in under 10 minutes.',
};

const transcript = [
  { speaker: 'caller' as const, text: 'Hi, I need to book a follow-up with Dr. Reyes.' },
  {
    speaker: 'agent' as const,
    text: 'I can help with that. Dr. Reyes has openings Wednesday at 2:30 or Thursday at 10:00.',
  },
  { speaker: 'caller' as const, text: 'Wednesday at 2:30 works.' },
  {
    speaker: 'agent' as const,
    text: 'Booked. I will text a confirmation and a reminder the day before.',
  },
];

const capabilities = [
  {
    title: 'Appointment lifecycle',
    description:
      'Patients book, reschedule, or cancel through natural conversation. Every change syncs to your calendar in real time, with confirmations sent automatically.',
    icon: CalendarCheck,
  },
  {
    title: 'Zero no-show engine',
    description:
      'Multi-touch call and text reminders run on their own. Same-day and multi-day sequences quietly cut no-shows without adding front-desk work.',
    icon: BellRing,
  },
  {
    title: 'Prescription refill routing',
    description:
      'Refill requests are captured, patient identity is verified, and the request is routed straight to your pharmacy team for approval.',
    icon: Pill,
  },
  {
    title: 'Emergency guard',
    description:
      'The agent detects urgent symptoms and transfers to on-call staff or directs the caller to emergency services. It never gives clinical advice.',
    icon: ShieldAlert,
    guard: true,
  },
  {
    title: 'Insurance verification',
    description:
      'Insurance details are collected before the visit, cutting front-desk workload and speeding up check-in on arrival.',
    icon: ShieldCheck,
  },
  {
    title: 'Dashboard visibility',
    description:
      'Every call, transcript, and outcome lands in one place. Watch volume, bookings, and escalations in real time from any device.',
    icon: ScrollText,
  },
];

const compliance = [
  { label: 'HIPAA ready', icon: ShieldCheck },
  { label: 'AES-256 encryption', icon: FileLock2 },
  { label: 'Full audit trail', icon: ScrollText },
  { label: 'Synthetic demo mode', icon: FlaskConical },
];

const stats = [
  { value: '35%', label: 'Reduction in no-shows', description: 'Through automated multi-touch reminders' },
  { value: '80%', label: 'Routine calls handled', description: 'Without human intervention' },
  { value: '<10 min', label: 'Setup time', description: 'From signup to live agent' },
];

const integrations = [
  'Epic',
  'Cerner',
  'Athenahealth',
  'DrChrono',
  'Practice Fusion',
  'AdvancedMD',
];

export default function HealthcarePage() {
  return (
    <>
      {/* Hero, tinted teal */}
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
                <HeartPulse className="mr-1.5 size-3.5" aria-hidden />
                Healthcare
              </Badge>
              <h1 className="font-display text-4xl tracking-tight sm:text-5xl lg:text-6xl">
                Your front desk,{' '}
                <span style={{ color: ACCENT }}>always on</span>
              </h1>
              <p className="mt-6 text-lg leading-8 text-muted-foreground">
                A voice agent trained for healthcare workflows and held to the
                standards your patients deserve. It handles scheduling,
                reminders, refills, and insurance questions, so your staff can
                focus on care.
              </p>
              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <Link href="/signup">
                  <Button size="lg" className="h-12 px-8 text-base">
                    Start your healthcare agent
                  </Button>
                </Link>
                <Link href="/industries">
                  <Button variant="outline" size="lg" className="h-12 px-8 text-base">
                    View all industries
                  </Button>
                </Link>
              </div>
            </div>

            {/* Live call signature */}
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

      {/* Trust and compliance strip */}
      <section className="border-b bg-secondary/30">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {compliance.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
              >
                <item.icon
                  className="size-5 shrink-0 text-brand"
                  aria-hidden
                />
                <span className="text-sm font-medium">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-3">
          {stats.map((stat) => (
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
      </section>

      {/* Capabilities */}
      <section className="border-y bg-secondary/30">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
              Key capabilities
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Every feature your practice needs, built into one intelligent
              voice agent.
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
        </div>
      </section>

      {/* Integrations */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
              Connects to the systems you already use
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Our healthcare agent integrates with major EHR and practice
              management platforms. Appointment data flows both ways, so there
              is no double entry.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {integrations.map((name) => (
                <Badge key={name} variant="outline" className="px-4 py-2 text-sm">
                  {name}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-center">
            <div className="relative h-64 w-64">
              <div
                className="absolute left-1/2 top-1/2 flex size-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-primary-foreground shadow-lg"
                style={{ backgroundColor: ACCENT }}
              >
                <HeartPulse className="size-10" aria-hidden />
              </div>
              {[
                { x: -80, y: -80, label: 'EHR' },
                { x: 80, y: -80, label: 'Calendar' },
                { x: -100, y: 40, label: 'Pharmacy' },
                { x: 100, y: 40, label: 'Billing' },
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
        </div>
      </section>

      {/* Compliance detail */}
      <section className="border-y bg-secondary/30">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <div
              className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl"
              style={{ backgroundColor: tint(12), color: ACCENT }}
            >
              <ShieldCheck className="size-7" aria-hidden />
            </div>
            <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
              Built for compliance
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Healthcare demands the highest standards. Our architecture is
              designed from the ground up for regulatory compliance.
            </p>
          </div>
          <div className="mt-14 grid gap-6 sm:grid-cols-2">
            {[
              {
                title: 'HIPAA-ready architecture',
                description:
                  'End-to-end encryption for all voice data. No patient information is stored on third-party servers without BAA coverage.',
              },
              {
                title: 'Encrypted calls',
                description:
                  'Every call is encrypted in transit and at rest, with TLS 1.3 for all data transmission.',
              },
              {
                title: 'Audit logging',
                description:
                  'A complete audit trail of every interaction, exportable for compliance reviews and incident response.',
              },
              {
                title: 'Synthetic demo mode',
                description:
                  'Test your agent with synthetic patient data. No real PHI is needed during setup or training.',
              },
            ].map((item) => (
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
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="rounded-2xl bg-primary px-8 py-16 text-center text-primary-foreground sm:px-16">
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
            Start your healthcare agent
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-primary-foreground/80">
            Reduce no-shows, reclaim staff time, and give every patient a
            world-class phone experience. Setup takes under 10 minutes.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/signup">
              <Button size="lg" variant="secondary" className="h-12 px-8 text-base">
                {brand.copy.ctaButton}
              </Button>
            </Link>
            <Link href={`mailto:${brand.support.email}`}>
              <Button
                size="lg"
                variant="outline"
                className="h-12 border-primary-foreground/25 bg-transparent px-8 text-base text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              >
                Talk to sales
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
