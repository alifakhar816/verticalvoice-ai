'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Stethoscope, UtensilsCrossed, Building2, Check, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StepProps, Industry } from '../types';

// Per-card jewel tint. Each industry card is tinted to its own vertical
// accent; the selected card's accent becomes the workspace accent for the
// rest of the flow (see accent.ts, derived from data.industry downstream).
const jewel: Record<
  Industry,
  { text: string; ring: string; border: string; wash: string; dot: string }
> = {
  healthcare: {
    text: 'text-vertical-healthcare',
    ring: 'ring-vertical-healthcare',
    border: 'border-vertical-healthcare/60',
    wash: 'bg-vertical-healthcare/10',
    dot: 'bg-vertical-healthcare',
  },
  restaurant: {
    text: 'text-vertical-restaurant',
    ring: 'ring-vertical-restaurant',
    border: 'border-vertical-restaurant/60',
    wash: 'bg-vertical-restaurant/10',
    dot: 'bg-vertical-restaurant',
  },
  real_estate: {
    text: 'text-vertical-realestate',
    ring: 'ring-vertical-realestate',
    border: 'border-vertical-realestate/60',
    wash: 'bg-vertical-realestate/10',
    dot: 'bg-vertical-realestate',
  },
};

const industries: {
  id: Industry;
  label: string;
  icon: React.ReactNode;
  tasks: string[];
  setupTime: string;
  compliance: string | null;
}[] = [
  {
    id: 'healthcare',
    label: 'Healthcare',
    icon: <Stethoscope className="size-8" />,
    tasks: [
      'Appointment scheduling & reminders',
      'Insurance verification calls',
      'Patient intake & follow-ups',
      'Prescription refill requests',
    ],
    setupTime: '~15 minutes',
    compliance: 'HIPAA-compliant voice handling',
  },
  {
    id: 'restaurant',
    label: 'Restaurant',
    icon: <UtensilsCrossed className="size-8" />,
    tasks: [
      'Reservation management',
      'Takeout & delivery orders',
      'Menu inquiries & allergen info',
      'Event & party bookings',
    ],
    setupTime: '~10 minutes',
    compliance: null,
  },
  {
    id: 'real_estate',
    label: 'Real Estate',
    icon: <Building2 className="size-8" />,
    tasks: [
      'Property inquiry handling',
      'Showing scheduling',
      'Lead qualification & follow-up',
      'Open house coordination',
    ],
    setupTime: '~12 minutes',
    compliance: 'Fair Housing Act compliant',
  },
];

export function Step1Industry({ data, updateData }: StepProps) {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {industries.map((ind) => {
        const selected = data.industry === ind.id;
        const j = jewel[ind.id];
        return (
          <Card
            key={ind.id}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            onClick={() => updateData({ industry: ind.id })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                updateData({ industry: ind.id });
              }
            }}
            className={cn(
              'cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md',
              selected
                ? cn('ring-2 shadow-md', j.ring, j.border)
                : 'hover:border-foreground/20'
            )}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <div
                  className={cn(
                    'flex size-12 items-center justify-center rounded-xl transition-colors',
                    j.wash,
                    j.text
                  )}
                >
                  {ind.icon}
                </div>
                {selected && (
                  <Badge className={cn('gap-1', j.wash, j.text, 'border-transparent')}>
                    <Check className="size-3" />
                    Selected
                  </Badge>
                )}
              </div>
              <h3 className="mt-3 text-xl font-semibold">{ind.label}</h3>
              <p className="font-mono text-xs text-muted-foreground">
                Setup time: {ind.setupTime}
              </p>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Typical tasks
              </p>
              <ul className="space-y-2">
                {ind.tasks.map((task) => (
                  <li
                    key={task}
                    className="flex items-start gap-2 text-sm text-foreground"
                  >
                    <span
                      className={cn(
                        'mt-1.5 block size-1.5 shrink-0 rounded-full',
                        j.dot
                      )}
                    />
                    {task}
                  </li>
                ))}
              </ul>
              {ind.compliance && (
                <div className="mt-4 flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className={cn('size-3.5 shrink-0', j.text)} />
                  {ind.compliance}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
