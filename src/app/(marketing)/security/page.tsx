import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Shield,
  ShieldCheck,
  Lock,
  ClipboardList,
  Database,
  Server,
  Globe,
  KeyRound,
  Check,
  ShieldAlert,
  Salad,
  Scale,
} from 'lucide-react';
import { brand } from '@/config/brand';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Security and Privacy | VerticalVoice AI',
  description:
    'Enterprise-grade security for every call. Learn about our encryption, compliance, and data handling practices.',
};

const badges = [
  { label: 'SOC 2', sublabel: 'Type II ready', icon: ShieldCheck },
  { label: 'HIPAA', sublabel: 'Ready architecture', icon: Shield },
  { label: 'AES-256', sublabel: 'Encryption at rest', icon: Lock },
  { label: 'Data residency', sublabel: 'Regional isolation', icon: Globe },
];

const sections = [
  {
    title: 'Encryption',
    subtitle: 'Your data is protected at every layer',
    icon: Lock,
    items: [
      {
        label: 'AES-256 at rest',
        description:
          'All stored data, call recordings, transcripts, and configuration, is encrypted with AES-256, the standard used by governments and financial institutions.',
      },
      {
        label: 'TLS 1.3 in transit',
        description:
          'Every connection between your browser, our API, and our infrastructure is secured with TLS 1.3, preventing eavesdropping and tampering.',
      },
      {
        label: 'End-to-end call encryption',
        description:
          'Voice data is encrypted from the moment it enters our system to the moment it is stored or discarded, with keys rotated regularly.',
      },
    ],
  },
  {
    title: 'Access control',
    subtitle: 'Granular permissions for every team member',
    icon: KeyRound,
    items: [
      {
        label: 'Row Level Security',
        description:
          'Database-level isolation ensures each organization can only access its own data. No shared tables, no cross-tenant leaks.',
      },
      {
        label: 'Role-based access',
        description:
          'Assign Owner, Admin, or Member roles with different permission sets. Control who can configure agents, view transcripts, or manage billing.',
      },
      {
        label: 'Team permissions',
        description:
          'Create teams within your organization and scope access to specific agents, industries, or dashboard sections.',
      },
    ],
  },
  {
    title: 'Audit logging',
    subtitle: 'Complete visibility into every action',
    icon: ClipboardList,
    items: [
      {
        label: 'Comprehensive action logging',
        description:
          'Every login, configuration change, agent update, and data export is logged with timestamp, user, IP address, and action details.',
      },
      {
        label: 'Exportable audit trail',
        description:
          'Download your full audit log as CSV or JSON for compliance reviews, incident investigations, or internal governance.',
      },
      {
        label: 'Real-time alerts',
        description:
          'Set up notifications for sensitive actions, bulk data exports, permission changes, or unusual login patterns.',
      },
    ],
  },
  {
    title: 'Data handling',
    subtitle: 'You control your data, always',
    icon: Database,
    items: [
      {
        label: 'Data retention policies',
        description:
          'Configure how long call recordings and transcripts are stored. Choose 30, 90, or 180 days, or a custom retention period.',
      },
      {
        label: 'Right to deletion',
        description:
          'Request complete deletion of your data at any time. We process deletion requests within 72 hours and provide written confirmation.',
      },
      {
        label: 'Data portability',
        description:
          'Export all your data, recordings, transcripts, analytics, and configurations, in standard formats (JSON, CSV, WAV) at any time.',
      },
    ],
  },
  {
    title: 'Infrastructure',
    subtitle: 'Enterprise-grade reliability and testing',
    icon: Server,
    items: [
      {
        label: 'SOC 2 Type II readiness',
        description:
          'Our controls and processes are designed to meet SOC 2 Type II requirements for security, availability, and confidentiality.',
      },
      {
        label: 'Regular penetration testing',
        description:
          'We engage independent security firms for quarterly penetration tests and continuous vulnerability scanning.',
      },
      {
        label: '99.9% uptime SLA',
        description:
          'Enterprise customers receive a 99.9% uptime guarantee backed by service credits, on a multi-region architecture built for high availability.',
      },
    ],
  },
];

const guards = [
  {
    title: 'Emergency guard',
    industry: 'Healthcare',
    accent: 'var(--vertical-healthcare)',
    icon: ShieldAlert,
    description:
      'The healthcare agent detects urgent symptoms and transfers to on-call staff or emergency services. It is an administrative assistant only and never gives clinical advice.',
  },
  {
    title: 'Allergen guard',
    industry: 'Restaurant',
    accent: 'var(--vertical-restaurant)',
    icon: Salad,
    description:
      'The restaurant agent answers allergen questions from your verified menu data only. It never guesses on ingredients and flags anything it cannot confirm for a human to review.',
  },
  {
    title: 'Fair-housing guard',
    industry: 'Real Estate',
    accent: 'var(--vertical-realestate)',
    icon: Scale,
    description:
      'The real estate agent enforces fair-housing rules in code. It describes properties by objective features only and never steers based on any protected class.',
  },
];

const tint = (accent: string, pct: number) =>
  `color-mix(in oklab, ${accent} ${pct}%, transparent)`;

export default function SecurityPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-accent text-brand">
              <Shield className="size-8" aria-hidden />
            </div>
            <h1 className="font-display text-4xl tracking-tight sm:text-5xl lg:text-6xl">
              Enterprise-grade security for every call
            </h1>
            <p className="mt-6 text-lg leading-8 text-muted-foreground sm:text-xl">
              Your callers trust you with their information. We take that
              responsibility seriously, with encryption, compliance, and
              transparency at every level.
            </p>
          </div>
        </div>
      </section>

      {/* Badge grid */}
      <section className="border-b bg-secondary/30">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {badges.map((badge) => (
              <Card key={badge.label} className="p-6 text-center">
                <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-accent text-brand">
                  <badge.icon className="size-6" aria-hidden />
                </div>
                <div className="font-display text-xl">{badge.label}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {badge.sublabel}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Security sections */}
      {sections.map((section, index) => (
        <section
          key={section.title}
          className={index % 2 === 1 ? 'border-y bg-secondary/30' : ''}
        >
          <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-12 lg:flex-row lg:items-start">
              <div className="lg:sticky lg:top-24 lg:w-1/3">
                <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-accent text-brand">
                  <section.icon className="size-6" aria-hidden />
                </div>
                <h2 className="font-display text-2xl tracking-tight sm:text-3xl">
                  {section.title}
                </h2>
                <p className="mt-2 text-muted-foreground">{section.subtitle}</p>
              </div>
              <div className="flex-1 space-y-6">
                {section.items.map((item) => (
                  <Card key={item.label}>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Check className="size-5 text-brand" aria-hidden />
                        {item.label}
                      </CardTitle>
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
          </div>
        </section>
      ))}

      {/* Per-vertical guards */}
      <section className="border-t">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
              Guardrails for every vertical
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Each industry pack ships with a hard safety boundary, enforced in
              the agent itself, not left to a prompt.
            </p>
          </div>
          <div className="mt-16 grid gap-8 lg:grid-cols-3">
            {guards.map((guard) => (
              <Card
                key={guard.title}
                className="overflow-hidden p-0"
                style={{
                  borderColor: tint(guard.accent, 40),
                  backgroundColor: tint(guard.accent, 5),
                }}
              >
                <div
                  aria-hidden
                  className="h-1 w-full"
                  style={{ backgroundColor: guard.accent }}
                />
                <div className="p-8">
                  <div
                    className="flex size-12 items-center justify-center rounded-xl"
                    style={{
                      backgroundColor: tint(guard.accent, 14),
                      color: guard.accent,
                    }}
                  >
                    <guard.icon className="size-6" aria-hidden />
                  </div>
                  <p
                    className="mt-5 text-xs font-medium uppercase tracking-wide"
                    style={{ color: guard.accent }}
                  >
                    {guard.industry}
                  </p>
                  <h3 className="mt-1 font-display text-xl">{guard.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {guard.description}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-secondary/30">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="rounded-2xl bg-primary px-8 py-16 text-center text-primary-foreground sm:px-16">
            <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
              Talk to our security team
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-primary-foreground/80">
              Questions about compliance, data handling, or custom security
              requirements? Our team is ready to help.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link href={`mailto:${brand.support.email}`}>
                <Button size="lg" variant="secondary" className="h-12 px-8 text-base">
                  Contact security team
                </Button>
              </Link>
              <Link href={brand.support.docs}>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 border-primary-foreground/25 bg-transparent px-8 text-base text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                >
                  Read security docs
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
