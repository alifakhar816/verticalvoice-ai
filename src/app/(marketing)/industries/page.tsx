import Link from 'next/link';
import type { Metadata } from 'next';
import {
  HeartPulse,
  UtensilsCrossed,
  Building2,
  ArrowRight,
  Check,
  X,
} from 'lucide-react';
import { brand } from '@/config/brand';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = {
  title: `Industries | ${brand.name}`,
  description:
    'AI voice agents built for Healthcare, Restaurants, and Real Estate. Pre-trained on industry workflows, compliance, and terminology.',
};

const industries = [
  {
    title: 'Healthcare',
    href: '/industries/healthcare',
    icon: HeartPulse,
    accent: 'var(--vertical-healthcare)',
    description:
      'Automate appointment scheduling, patient reminders, prescription refill routing, and insurance verification, all HIPAA ready.',
    stat: { value: '35%', label: 'Fewer no-shows' },
    features: [
      'Appointment scheduling',
      'Patient reminders',
      'Prescription refill routing',
      'Emergency escalation',
      'Insurance verification',
    ],
  },
  {
    title: 'Restaurant',
    href: '/industries/restaurant',
    icon: UtensilsCrossed,
    accent: 'var(--vertical-restaurant)',
    description:
      'Handle reservations, takeout orders, menu inquiries, and allergen safety protocols, even during peak hours.',
    stat: { value: '$2,400', label: 'Monthly revenue recovered' },
    features: [
      'Reservation booking',
      'Takeout orders',
      'Menu and allergen info',
      'Wait-list management',
      'Feedback collection',
    ],
  },
  {
    title: 'Real Estate',
    href: '/industries/real-estate',
    icon: Building2,
    accent: 'var(--vertical-realestate)',
    description:
      'Respond to property inquiries in under 30 seconds, qualify leads, book showings, and nurture prospects around the clock.',
    stat: { value: '3x', label: 'More leads converted' },
    features: [
      'Speed-to-lead response',
      'Lead qualification',
      'Showing scheduling',
      'Property inquiries',
      'Follow-up nurturing',
    ],
  },
];

const comparisons = [
  {
    feature: 'Industry terminology',
    generic: 'Generic scripts',
    vertical: 'Pre-trained on real workflows',
  },
  {
    feature: 'Compliance',
    generic: 'Not addressed',
    vertical: 'Built in (HIPAA, fair housing, food safety)',
  },
  {
    feature: 'Setup time',
    generic: 'Weeks of configuration',
    vertical: 'Under 10 minutes',
  },
  {
    feature: 'Call routing',
    generic: 'Basic IVR menus',
    vertical: 'Intelligent escalation and context handoff',
  },
  {
    feature: 'Integrations',
    generic: 'Custom development needed',
    vertical: 'Pre-built for EHR, POS, CRM',
  },
];

function tint(accent: string, pct: number) {
  return `color-mix(in oklab, ${accent} ${pct}%, transparent)`;
}

export default function IndustriesPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline" className="mb-6">
              3 verticals available
            </Badge>
            <h1 className="font-display text-4xl tracking-tight sm:text-5xl lg:text-6xl">
              AI agents built for{' '}
              <span className="text-brand">your industry</span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-muted-foreground sm:text-xl">
              Generic chatbots waste your time. Our AI voice agents are
              pre-trained on the terminology, workflows, and compliance
              requirements of your specific vertical.
            </p>
          </div>
        </div>
      </section>

      {/* Industry panels */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {industries.map((industry) => (
            <Card
              key={industry.title}
              className="group relative flex flex-col overflow-hidden p-0 transition-shadow hover:shadow-lg"
            >
              {/* Jewel top rule */}
              <div
                aria-hidden
                className="h-1 w-full"
                style={{ backgroundColor: industry.accent }}
              />
              <div className="flex flex-1 flex-col p-8">
                <div
                  className="flex size-14 items-center justify-center rounded-xl"
                  style={{
                    backgroundColor: tint(industry.accent, 12),
                    color: industry.accent,
                  }}
                >
                  <industry.icon className="size-7" aria-hidden />
                </div>

                <h2 className="mt-6 font-display text-2xl">{industry.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {industry.description}
                </p>

                {/* Stat */}
                <div className="mt-6 rounded-lg border bg-secondary/40 p-4">
                  <div
                    className="font-display text-3xl tabular-nums"
                    style={{ color: industry.accent }}
                  >
                    {industry.stat.value}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {industry.stat.label}
                  </div>
                </div>

                {/* Features */}
                <ul className="mt-6 space-y-2.5">
                  {industry.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-center gap-2.5 text-sm text-muted-foreground"
                    >
                      <Check
                        className="size-4 shrink-0"
                        style={{ color: industry.accent }}
                        aria-hidden
                      />
                      {feature}
                    </li>
                  ))}
                </ul>

                <div className="mt-8 pt-2">
                  <Link
                    href={industry.href}
                    className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors hover:underline"
                    style={{ color: industry.accent }}
                  >
                    Explore {industry.title}
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Comparison table */}
      <section className="border-y bg-secondary/30">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
              How vertical AI differs from generic chatbots
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Purpose-built agents outperform one-size-fits-all solutions in
              every metric that matters.
            </p>
          </div>
          <div className="mx-auto mt-14 max-w-4xl overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-brand text-brand-foreground">
                  <th className="rounded-l-lg px-5 py-3.5 text-sm font-semibold">
                    Feature
                  </th>
                  <th className="px-5 py-3.5 text-sm font-semibold">
                    Generic chatbot
                  </th>
                  <th className="rounded-r-lg px-5 py-3.5 text-sm font-semibold">
                    {brand.name}
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map((row) => (
                  <tr key={row.feature} className="border-b last:border-0">
                    <td className="px-5 py-4 text-sm font-medium">
                      {row.feature}
                    </td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-2">
                        <X
                          className="size-4 shrink-0 text-muted-foreground/50"
                          aria-hidden
                        />
                        {row.generic}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm">
                      <span className="flex items-center gap-2">
                        <Check
                          className="size-4 shrink-0 text-brand"
                          aria-hidden
                        />
                        {row.vertical}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="rounded-2xl bg-primary px-8 py-16 text-center text-primary-foreground sm:px-16">
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
            Ready to deploy your industry agent?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-primary-foreground/80">
            Pick your vertical, answer a few questions, and go live in under 10
            minutes. No developers required.
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
