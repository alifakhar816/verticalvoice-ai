import Link from 'next/link';
import type { CSSProperties } from 'react';
import { brand } from '@/config/brand';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ComparisonDemo } from '@/components/marketing/comparison-demo';
import { IndustryGate } from '@/components/marketing/industry-gate';
import { LandingHero } from '@/components/marketing/landing/landing-hero';
import { ScrollReveal } from '@/components/marketing/landing/scroll-reveal';

/* ---------------------------------------------------------------------------
 * Static data
 * --------------------------------------------------------------------------- */

const industries = [
  {
    title: 'Healthcare',
    slug: 'healthcare',
    accent: 'var(--vertical-healthcare)',
    description:
      'Automate appointment scheduling, reminders, and follow-ups for clinics and practices.',
    icon: HeartPulseIcon,
    features: [
      'Appointment scheduling',
      'Patient reminders',
      'Insurance verification',
      'Follow-up calls',
    ],
  },
  {
    title: 'Restaurant',
    slug: 'restaurant',
    accent: 'var(--vertical-restaurant)',
    description:
      'Handle reservations, order confirmations, and customer feedback calls effortlessly.',
    icon: UtensilsIcon,
    features: [
      'Reservation booking',
      'Order confirmations',
      'Feedback collection',
      'Wait-list management',
    ],
  },
  {
    title: 'Real Estate',
    slug: 'real-estate',
    accent: 'var(--vertical-realestate)',
    description:
      'Qualify leads, schedule showings, and nurture prospects around the clock.',
    icon: BuildingIcon,
    features: [
      'Lead qualification',
      'Showing scheduling',
      'Property inquiries',
      'Follow-up nurturing',
    ],
  },
];

const trustPills = ['SOC 2', 'HIPAA aware', '99.9% uptime'];

const steps = [
  {
    number: '01',
    title: 'Choose Your Industry',
    description:
      'Select from Healthcare, Restaurant, or Real Estate to get a pre-trained voice agent tailored to your vertical.',
    icon: TargetIcon,
  },
  {
    number: '02',
    title: 'Configure Your Agent',
    description:
      'Answer a few questions about your business (hours, services, common questions) and we configure your agent automatically.',
    icon: SettingsIcon,
  },
  {
    number: '03',
    title: 'Test Calls',
    description:
      'Make test calls to hear your agent in action. Fine-tune responses, tone, and workflows until it sounds just right.',
    icon: PhoneIcon,
  },
  {
    number: '04',
    title: 'Go Live',
    description:
      'Connect your phone number and your AI agent starts handling calls immediately. Monitor everything from your dashboard.',
    icon: RocketIcon,
  },
];

const testimonials = [
  {
    quote:
      'We went from missing 40% of after-hours calls to capturing every single one. Our booking rate jumped overnight.',
    name: 'Dr. Sarah Chen',
    role: 'Owner, Bright Smile Dental',
    rating: 5,
  },
  {
    quote:
      'Friday nights used to be chaos on the phone. Now our AI handles 200+ reservation calls while we focus on the kitchen.',
    name: 'Marco DiNapoli',
    role: 'GM, Trattoria Rosso',
    rating: 5,
  },
  {
    quote:
      'Every lead gets a response in under 10 seconds, 24/7. My agents can focus on showings instead of playing phone tag.',
    name: 'Jessica Alvarez',
    role: 'Broker, Pinnacle Realty',
    rating: 5,
  },
];

const pricingTiers = [
  {
    name: 'Starter',
    price: '$49',
    period: '/mo',
    description: 'Perfect for small businesses getting started with AI calling.',
    calls: '100 calls/mo',
    features: [
      '1 AI agent',
      '100 calls per month',
      'Business hours routing',
      'Email support',
      'Basic analytics',
    ],
    cta: 'Start Free Trial',
    popular: false,
  },
  {
    name: 'Growth',
    price: '$149',
    period: '/mo',
    description:
      'For growing businesses that need more capacity and customization.',
    calls: '500 calls/mo',
    features: [
      '3 AI agents',
      '500 calls per month',
      '24/7 availability',
      'Priority support',
      'Advanced analytics',
      'Custom voice & tone',
      'CRM integrations',
    ],
    cta: 'Start Free Trial',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For organizations with high volume and custom requirements.',
    calls: 'Unlimited',
    features: [
      'Unlimited agents',
      'Unlimited calls',
      'Dedicated account manager',
      'Custom integrations',
      'SLA guarantee',
      'HIPAA compliance',
      'On-premise option',
    ],
    cta: 'Contact Sales',
    popular: false,
  },
];

/* ---------------------------------------------------------------------------
 * Page component (server)
 * --------------------------------------------------------------------------- */

export default function HomePage() {
  return (
    <>
      {/* First-visit industry selector. Landing page only, once per visitor. */}
      <IndustryGate />

      {/* ================================================================== */}
      {/* 5.1 HERO                                                            */}
      {/* ================================================================== */}
      <LandingHero />

      {/* ================================================================== */}
      {/* 5.2 TRUST BAR                                                       */}
      {/* ================================================================== */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4 py-5 sm:px-6 lg:px-8">
          {trustPills.map((pill, i) => (
            <span key={pill} className="flex items-center gap-3">
              {i > 0 && (
                <span aria-hidden className="text-muted-foreground/40">
                  &middot;
                </span>
              )}
              <span className="rounded-full border border-border/70 px-3 py-1 text-xs font-medium text-muted-foreground">
                {pill}
              </span>
            </span>
          ))}
        </div>
      </section>

      {/* ================================================================== */}
      {/* 5.3 INDUSTRY CARDS                                                  */}
      {/* ================================================================== */}
      <section
        id="industries"
        className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8"
      >
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <Badge variant="secondary" className="mb-4">
            Pre-trained agents
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Built for your industry
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Pre-trained AI agents that understand the language, workflows, and
            compliance requirements of your vertical.
          </p>
        </ScrollReveal>

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {industries.map((industry, idx) => (
            <ScrollReveal key={industry.title} delay={idx * 80}>
              <div
                className="group flex h-full flex-col rounded-xl border bg-card p-6 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--jewel)] hover:shadow-lg"
                style={{ '--jewel': industry.accent } as CSSProperties}
              >
                <div
                  className="mb-4 flex size-12 items-center justify-center rounded-xl"
                  style={{
                    color: industry.accent,
                    backgroundColor:
                      'color-mix(in srgb, ' +
                      industry.accent +
                      ' 12%, transparent)',
                  }}
                >
                  <industry.icon className="size-6" />
                </div>

                <h3 className="text-lg font-semibold text-foreground">
                  {industry.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {industry.description}
                </p>

                <ul className="mt-5 space-y-2">
                  {industry.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <CheckCircleIcon
                        className="size-4 shrink-0"
                        style={{ color: industry.accent }}
                      />
                      {feature}
                    </li>
                  ))}
                </ul>

                <div className="mt-6 pt-2">
                  <Link
                    href={`/industries/${industry.slug}`}
                    className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
                    style={{ color: industry.accent }}
                  >
                    Learn more
                    <ArrowRightIcon className="size-3" />
                  </Link>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* ================================================================== */}
      {/* 5.4 SAME CALLER, DIFFERENT INDUSTRY                                 */}
      {/* ================================================================== */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <ScrollReveal className="mx-auto max-w-2xl text-center">
            <Badge variant="secondary" className="mb-4">
              Industry-aware
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Same caller. Different industry. Perfect response.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              When a caller says{' '}
              <span className="font-medium text-foreground">
                &quot;I need to come in today&quot;
              </span>
              , watch how each agent responds with industry-specific
              intelligence.
            </p>
          </ScrollReveal>

          <ScrollReveal className="mt-12" delay={80}>
            <ComparisonDemo />
          </ScrollReveal>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 5.5 HOW IT WORKS                                                    */}
      {/* ================================================================== */}
      <section
        id="how-it-works"
        className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8"
      >
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <Badge variant="secondary" className="mb-4">
            Simple setup
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Up and running in 4 steps
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            No developers needed. No complex setup. Just answer a few questions
            and your AI agent is live.
          </p>
        </ScrollReveal>

        <div className="relative mt-16">
          {/* Connecting brass hairline (desktop only) */}
          <div className="absolute inset-x-0 top-6 hidden h-px bg-brand/30 lg:block" />

          <div className="grid gap-12 lg:grid-cols-4">
            {steps.map((item, idx) => (
              <ScrollReveal key={item.number} delay={idx * 80}>
                <div className="relative text-center">
                  {/* Brass-ring number circle */}
                  <div className="relative z-10 mx-auto mb-6 flex size-12 items-center justify-center rounded-full bg-card font-mono text-sm font-semibold ring-2 ring-brand">
                    <span style={{ color: 'var(--brand)' }}>{item.number}</span>
                  </div>

                  {/* Neutral icon tile */}
                  <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-lg bg-secondary text-foreground">
                    <item.icon className="size-5" />
                  </div>

                  <h3 className="text-lg font-semibold text-foreground">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 5.6 TESTIMONIALS                                                    */}
      {/* ================================================================== */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <ScrollReveal className="mx-auto max-w-2xl text-center">
            <Badge variant="secondary" className="mb-4">
              Trusted by businesses
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Loved by teams across industries
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              See what our customers have to say about their experience with{' '}
              {brand.name}.
            </p>
          </ScrollReveal>

          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((t, idx) => (
              <ScrollReveal key={t.name} delay={idx * 80}>
                <figure className="flex h-full flex-col rounded-xl border bg-card p-6 shadow-sm">
                  {/* Brass 5-star row */}
                  <div className="mb-4 flex gap-0.5">
                    {Array.from({ length: t.rating }).map((_, i) => (
                      <StarIcon
                        key={i}
                        className="size-4"
                        style={{ color: 'var(--brand)', fill: 'var(--brand)' }}
                      />
                    ))}
                  </div>

                  <blockquote className="flex-1 text-base leading-relaxed text-foreground">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>

                  <figcaption className="mt-6 flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-foreground">
                      {t.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {t.name}
                      </p>
                      <p className="text-xs text-muted-foreground">{t.role}</p>
                    </div>
                  </figcaption>
                </figure>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 5.7 PRICING PREVIEW                                                 */}
      {/* ================================================================== */}
      <section
        id="pricing"
        className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8"
      >
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <Badge variant="secondary" className="mb-4">
            Simple pricing
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Plans that scale with you
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Start free, upgrade as you grow. All plans include a 14-day free
            trial.
          </p>
        </ScrollReveal>

        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {pricingTiers.map((tier, idx) => (
            <ScrollReveal key={tier.name} delay={idx * 80} className="h-full">
              <div
                className={`relative flex h-full flex-col rounded-xl border bg-card p-6 shadow-sm ${
                  tier.popular ? 'ring-2 ring-brand' : ''
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center rounded-full bg-brand px-3 py-1 text-xs font-semibold text-brand-foreground shadow-sm">
                      Most popular
                    </span>
                  </div>
                )}

                <div className="text-center">
                  <h3 className="text-lg font-semibold text-foreground">
                    {tier.name}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {tier.description}
                  </p>
                  <div className="mt-5">
                    <span className="text-4xl font-bold text-foreground">
                      {tier.price}
                    </span>
                    {tier.period && (
                      <span className="text-muted-foreground">
                        {tier.period}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-semibold text-brand">
                    {tier.calls}
                  </p>
                </div>

                <ul className="mt-6 flex-1 space-y-3">
                  {tier.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <CheckCircleIcon className="size-4 shrink-0 text-foreground/70" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  <Link href="/pricing" className="block">
                    <Button
                      variant={tier.popular ? 'default' : 'outline'}
                      className="w-full"
                    >
                      {tier.cta}
                    </Button>
                  </Link>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          All plans include a 14-day free trial.{' '}
          <Link href="/pricing" className="font-medium text-foreground hover:underline">
            View full pricing details
          </Link>
        </p>
      </section>

      {/* ================================================================== */}
      {/* 5.8 FINAL CTA                                                       */}
      {/* ================================================================== */}
      <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-2xl bg-primary px-8 py-16 text-center text-primary-foreground sm:px-16">
          {/* One soft brass glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full blur-3xl"
            style={{
              background:
                'radial-gradient(circle, color-mix(in srgb, var(--brand) 35%, transparent), transparent 70%)',
            }}
          />

          {/* Faint equalizer motif in a corner (ties back to the mark) */}
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-6 left-8 flex items-end gap-1 opacity-15"
          >
            {[0.5, 0.8, 1, 0.65, 0.45].map((scale, i) => (
              <span
                key={i}
                className="w-1 rounded-full bg-brand"
                style={{
                  height: 40,
                  transform: `scaleY(${scale})`,
                  transformOrigin: 'bottom',
                }}
              />
            ))}
          </div>

          <div className="relative">
            <h2 className="font-display text-4xl tracking-[-0.015em] sm:text-5xl">
              Ready to automate your calls?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-primary-foreground/80">
              Join businesses that are saving hours every week with AI-powered
              calling agents. Start your free trial today.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link href="/signup">
                <Button
                  size="lg"
                  variant="secondary"
                  className="group h-12 px-8 text-base"
                >
                  {brand.copy.ctaButton}
                  <ArrowRightIcon className="ml-2 size-4 transition-transform duration-150 group-hover:translate-x-[3px]" />
                </Button>
              </Link>
              <Link href={`mailto:${brand.support.email}`}>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 border-primary-foreground/25 bg-transparent px-8 text-base text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                >
                  Contact sales
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/* ---------------------------------------------------------------------------
 * Inline SVG icons
 * --------------------------------------------------------------------------- */

function HeartPulseIcon({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      className={className}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      <path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" />
    </svg>
  );
}

function UtensilsIcon({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      className={className}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </svg>
  );
}

function BuildingIcon({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      className={className}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" />
      <path d="M16 6h.01" />
      <path d="M12 6h.01" />
      <path d="M12 10h.01" />
      <path d="M12 14h.01" />
      <path d="M16 10h.01" />
      <path d="M16 14h.01" />
      <path d="M8 10h.01" />
      <path d="M8 14h.01" />
    </svg>
  );
}

function CheckCircleIcon({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      className={className}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function StarIcon({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      className={className}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function RocketIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}

function TargetIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}
