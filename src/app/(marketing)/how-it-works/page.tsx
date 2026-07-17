import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Target,
  SlidersHorizontal,
  PhoneCall,
  Rocket,
  Brain,
  MessageSquare,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LiveCallOrb } from '@/components/shared/live-call-orb';

export const metadata: Metadata = {
  title: 'How It Works | VerticalVoice AI',
  description:
    'From signup to live calls in under 10 minutes. Learn how VerticalVoice AI sets up your industry-specific voice agent step by step.',
};

const steps = [
  {
    step: 1,
    title: 'Choose your industry',
    subtitle: 'Start with a foundation built for your vertical',
    description:
      'Select Healthcare, Restaurant, or Real Estate. Each template arrives pre-loaded with industry-specific intents, terminology, and compliance guardrails, so your agent sounds like an expert from day one.',
    details: [
      'Pre-trained on thousands of real industry conversations',
      'Built-in compliance rules (HIPAA, fair housing, food safety)',
      'Industry-specific vocabulary and phrasing',
      'Optimized call flows for common scenarios',
    ],
    icon: Target,
  },
  {
    step: 2,
    title: 'Configure your agent',
    subtitle: 'Customize every detail without writing code',
    description:
      'Answer a short questionnaire about your business, operating hours, services offered, common questions, booking rules, and the agent configures itself around your answers.',
    details: [
      'Business hours and holiday schedule setup',
      'Services, pricing, and availability configuration',
      'Custom FAQ responses for your common questions',
      'Escalation rules for when to transfer to a human',
    ],
    icon: SlidersHorizontal,
  },
  {
    step: 3,
    title: 'Test your agent',
    subtitle: 'Make real test calls before going live',
    description:
      'Call your agent, review transcripts, and fine-tune responses. The testing sandbox lets you simulate every scenario, peak hours, edge cases, difficult callers, until you are confident.',
    details: [
      'Make unlimited test calls from your browser',
      'Review full transcripts with intent annotations',
      'A/B test different response styles',
      'Simulate callers who are rushed, confused, or upset',
    ],
    icon: PhoneCall,
  },
  {
    step: 4,
    title: 'Go live',
    subtitle: 'Connect your number and start handling calls',
    description:
      'Forward your business number (or get a new one from us) and your AI agent begins answering calls immediately. Monitor performance from a real-time dashboard.',
    details: [
      'Port your existing number or provision a new one',
      'Real-time call monitoring dashboard',
      'Automatic performance reports and analytics',
      'Continuous learning from every conversation',
    ],
    icon: Rocket,
  },
];

const behindTheScenes = [
  {
    title: 'AI training',
    description:
      'Your agent is fine-tuned on thousands of real industry conversations, learning the nuances of tone, timing, and terminology that make callers feel heard.',
    icon: Brain,
  },
  {
    title: 'Intent recognition',
    description:
      'Language models parse caller intent in real time, distinguishing a new appointment request from a reschedule or a billing question within milliseconds.',
    icon: Target,
  },
  {
    title: 'Response generation',
    description:
      'Context-aware responses are generated on the fly, blending your business rules with natural conversational flow so every reply sounds human and helpful.',
    icon: MessageSquare,
  },
];

const faqs = [
  {
    question: 'Do I need any technical knowledge to set up?',
    answer:
      'Not at all. Setup is a guided questionnaire, no code, no integrations, no IT department required. If you can fill out a form, you can launch an AI agent.',
  },
  {
    question: 'Can I change my agent after going live?',
    answer:
      'Absolutely. You can update responses, hours, services, and escalation rules at any time from your dashboard. Changes take effect immediately.',
  },
  {
    question: 'What happens if the AI cannot handle a call?',
    answer:
      'Your agent gracefully transfers to a human team member based on the escalation rules you set. You also get a notification, so nothing slips through the cracks.',
  },
  {
    question: 'How long does the whole setup actually take?',
    answer:
      'Most businesses finish setup in 5 to 10 minutes. Testing takes as long as you want. Some launch after a single test call, others spend a day fine-tuning. Either way, you are in control.',
  },
];

export default function HowItWorksPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline" className="mb-6">
              4-step setup
            </Badge>
            <h1 className="font-display text-4xl tracking-tight sm:text-5xl lg:text-6xl">
              From signup to live calls in under 10 minutes
            </h1>
            <p className="mt-6 text-lg leading-8 text-muted-foreground sm:text-xl">
              No developers. No complex integrations. Just answer a few
              questions about your business and your AI calling agent is ready
              to go.
            </p>
          </div>
        </div>
      </section>

      {/* Vertical timeline */}
      <section className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="relative">
          {/* Brass connecting line */}
          <div
            aria-hidden
            className="absolute left-5 top-2 bottom-2 w-px bg-brand/40 sm:left-6"
          />
          <ol className="space-y-10">
            {steps.map((item) => (
              <li key={item.step} className="relative pl-16 sm:pl-20">
                {/* Node */}
                <div className="absolute left-0 top-1 flex size-10 items-center justify-center rounded-full border border-brand/50 bg-card font-mono text-sm font-semibold text-brand shadow-sm sm:size-12">
                  {item.step}
                </div>
                <Card className="animate-vv-fade-up transition-shadow hover:shadow-lg">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                        <item.icon className="size-5" aria-hidden />
                      </div>
                      <div>
                        <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                          Step {item.step} of 4
                        </p>
                        <CardTitle className="mt-0.5 text-xl">
                          {item.title}
                        </CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm font-medium text-foreground">
                      {item.subtitle}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                    <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                      {item.details.map((detail) => (
                        <li
                          key={detail}
                          className="flex items-start gap-2 text-sm text-muted-foreground"
                        >
                          <Check
                            className="mt-0.5 size-4 shrink-0 text-brand"
                            aria-hidden
                          />
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Test call moment */}
      <section className="border-y bg-secondary/30">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Badge variant="outline" className="mb-4">
              The test call
            </Badge>
            <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
              Hear it before you go live
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Step 3 is the moment it clicks. Place a real call to your agent
              and watch the live transcript stream in.
            </p>
          </div>
          <div className="mt-14 flex justify-center">
            <Card className="w-full max-w-xl p-8 sm:p-10">
              <LiveCallOrb size="lg" state="live" showTranscript />
            </Card>
          </div>
        </div>
      </section>

      {/* Behind the scenes */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
            What happens behind the scenes
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Sophisticated AI working invisibly so every call feels natural.
          </p>
        </div>
        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {behindTheScenes.map((item) => (
            <Card key={item.title} className="text-center">
              <CardHeader>
                <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
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

      {/* FAQ */}
      <section className="border-t bg-secondary/30">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
              Common questions
            </h2>
          </div>
          <div className="mx-auto mt-12 max-w-3xl space-y-4">
            {faqs.map((faq) => (
              <div key={faq.question} className="rounded-lg border bg-card p-6">
                <h3 className="font-semibold">{faq.question}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {faq.answer}
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
            Start your free setup
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-primary-foreground/80">
            Get your AI calling agent configured and tested in minutes. No
            credit card required.
          </p>
          <div className="mt-8">
            <Link href="/signup">
              <Button size="lg" variant="secondary" className="h-12 px-8 text-base">
                Start free setup
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
