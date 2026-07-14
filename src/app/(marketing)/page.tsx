import Link from 'next/link';
import { brand } from '@/config/brand';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const industries = [
  {
    title: 'Healthcare',
    description: 'Automate appointment scheduling, reminders, and follow-ups for clinics and practices.',
    icon: HeartPulseIcon,
    features: ['Appointment scheduling', 'Patient reminders', 'Insurance verification', 'Follow-up calls'],
  },
  {
    title: 'Restaurant',
    description: 'Handle reservations, order confirmations, and customer feedback calls effortlessly.',
    icon: UtensilsIcon,
    features: ['Reservation booking', 'Order confirmations', 'Feedback collection', 'Wait-list management'],
  },
  {
    title: 'Real Estate',
    description: 'Qualify leads, schedule showings, and nurture prospects around the clock.',
    icon: BuildingIcon,
    features: ['Lead qualification', 'Showing scheduling', 'Property inquiries', 'Follow-up nurturing'],
  },
];

const steps = [
  {
    step: '01',
    title: 'Choose your industry',
    description: 'Select from Healthcare, Restaurant, or Real Estate to get a pre-trained voice agent tailored to your vertical.',
  },
  {
    step: '02',
    title: 'Answer a few questions',
    description: 'Tell us about your business -- operating hours, services, common questions -- and we configure your agent automatically.',
  },
  {
    step: '03',
    title: 'Go live in minutes',
    description: 'Connect your phone number and your AI agent starts handling calls immediately. Monitor everything from your dashboard.',
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-background px-4 py-1.5 text-sm text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              Now available for 3 industries
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              {brand.copy.heroTitle}
            </h1>
            <p className="mt-6 text-lg leading-8 text-muted-foreground sm:text-xl">
              {brand.copy.heroSubtitle}
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link href="/signup">
                <Button size="lg" className="h-12 px-8 text-base">
                  {brand.copy.ctaButton}
                </Button>
              </Link>
              <Link href="#how-it-works">
                <Button variant="outline" size="lg" className="h-12 px-8 text-base">
                  See how it works
                </Button>
              </Link>
            </div>

            {/* Social proof */}
            <div className="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircleIcon className="h-4 w-4 text-green-500" />
                No credit card required
              </div>
              <div className="flex items-center gap-2">
                <CheckCircleIcon className="h-4 w-4 text-green-500" />
                Setup in under 5 minutes
              </div>
              <div className="flex items-center gap-2">
                <CheckCircleIcon className="h-4 w-4 text-green-500" />
                Cancel anytime
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Industries */}
      <section id="industries" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Built for your industry
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Pre-trained AI agents that understand the language, workflows, and
            compliance requirements of your vertical.
          </p>
        </div>
        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {industries.map((industry) => (
            <Card key={industry.title} className="relative overflow-hidden transition-shadow hover:shadow-lg">
              <CardHeader>
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <industry.icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">{industry.title}</CardTitle>
                <CardDescription>{industry.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {industry.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircleIcon className="h-4 w-4 shrink-0 text-green-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-y bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Up and running in 3 steps
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              No developers needed. No complex setup. Just answer a few questions
              and your AI agent is live.
            </p>
          </div>
          <div className="mt-16 grid gap-12 lg:grid-cols-3">
            {steps.map((item) => (
              <div key={item.step} className="relative text-center lg:text-left">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
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
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to automate your calls?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-primary-foreground/80">
            Join businesses that are saving hours every week with AI-powered calling agents.
            Start your free trial today.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/signup">
              <Button
                size="lg"
                variant="secondary"
                className="h-12 px-8 text-base"
              >
                {brand.copy.ctaButton}
              </Button>
            </Link>
            <Link href={`mailto:${brand.support.email}`}>
              <Button
                size="lg"
                variant="outline"
                className="h-12 border-primary-foreground/20 px-8 text-base text-primary-foreground hover:bg-primary-foreground/10"
              >
                Contact sales
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

// Inline SVG icons

function HeartPulseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      <path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" />
    </svg>
  );
}

function UtensilsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </svg>
  );
}

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  );
}
