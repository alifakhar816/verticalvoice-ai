'use client';

import { useState } from 'react';

/* ---------------------------------------------------------------------------
 * Same caller, different industry (section 5.4)
 * ---------------------------------------------------------------------------
 * Three columns, each headed by its vertical jewel, showing the same caller
 * line and three tailored agent responses in the LiveCallOrb transcript
 * bubble style. Interactive: the industry tabs focus a column (brass/jewel
 * ring); on mobile only the focused column is shown.
 * ------------------------------------------------------------------------- */

interface Industry {
  key: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactElement;
  accent: string; // vertical jewel css var
  response: string;
}

const CALLER_LINE = 'I need to come in today.';

const industries: Industry[] = [
  {
    key: 'healthcare',
    label: 'Healthcare',
    icon: HeartPulseIcon,
    accent: 'var(--vertical-healthcare)',
    response:
      'Of course, I can help you with a same-day appointment. Before I check availability, could you let me know the reason for your visit so I can match you with the right provider? And are you an existing patient with us?',
  },
  {
    key: 'restaurant',
    label: 'Restaurant',
    icon: UtensilsIcon,
    accent: 'var(--vertical-restaurant)',
    response:
      "Absolutely, we'd love to have you. How many guests will be joining, and do you have a preferred time? Our chef's special tonight is a pan-seared halibut that has been getting rave reviews.",
  },
  {
    key: 'realestate',
    label: 'Real Estate',
    icon: BuildingIcon,
    accent: 'var(--vertical-realestate)',
    response:
      "Great timing, I have several properties available for showing today. To find the best match, could you tell me what area you're looking in, your budget range, and how many bedrooms do you need?",
  },
];

export function ComparisonDemo() {
  const [active, setActive] = useState(0);

  return (
    <div className="mx-auto max-w-5xl">
      {/* Shared caller line */}
      <div className="mx-auto mb-8 max-w-md">
        <div className="mb-2 flex items-center justify-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          <PhoneIcon className="size-4" />
          Incoming call
        </div>
        <div className="flex justify-center">
          <span className="inline-block rounded-lg bg-secondary px-4 py-2.5 text-base font-medium text-secondary-foreground">
            &quot;{CALLER_LINE}&quot;
          </span>
        </div>
      </div>

      {/* Industry focus tabs */}
      <div className="mb-8 flex flex-wrap justify-center gap-2">
        {industries.map((item, idx) => {
          const isActive = active === idx;
          return (
            <button
              key={item.key}
              onClick={() => setActive(idx)}
              aria-pressed={isActive}
              className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all duration-150"
              style={
                isActive
                  ? {
                      color: item.accent,
                      borderColor:
                        'color-mix(in srgb, ' + item.accent + ' 40%, transparent)',
                      backgroundColor:
                        'color-mix(in srgb, ' + item.accent + ' 10%, transparent)',
                    }
                  : undefined
              }
            >
              <item.icon className="size-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Three columns */}
      <div className="grid gap-6 lg:grid-cols-3">
        {industries.map((item, idx) => {
          const isActive = active === idx;
          const Icon = item.icon;
          return (
            <div
              key={item.key}
              className={[
                'rounded-xl border bg-card p-5 transition-all duration-200',
                isActive ? 'block' : 'hidden lg:block',
                isActive ? 'shadow-md' : 'lg:opacity-60',
              ].join(' ')}
              style={
                isActive
                  ? {
                      borderColor:
                        'color-mix(in srgb, ' + item.accent + ' 45%, transparent)',
                      boxShadow:
                        '0 0 0 1px color-mix(in srgb, ' +
                        item.accent +
                        ' 45%, transparent)',
                    }
                  : undefined
              }
            >
              {/* Column header */}
              <div className="mb-4 flex items-center gap-3 border-b pb-4">
                <div
                  className="flex size-10 items-center justify-center rounded-lg"
                  style={{
                    color: item.accent,
                    backgroundColor:
                      'color-mix(in srgb, ' + item.accent + ' 12%, transparent)',
                  }}
                >
                  <Icon className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {item.label} Agent
                  </p>
                  <p className="text-xs text-muted-foreground">Tailored response</p>
                </div>
              </div>

              {/* Transcript bubbles */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-start">
                  <span className="inline-block max-w-[85%] rounded-lg bg-secondary px-3 py-2 text-sm leading-relaxed text-secondary-foreground">
                    {CALLER_LINE}
                  </span>
                </div>
                <div className="flex justify-end">
                  <span
                    className="inline-block max-w-[92%] rounded-lg border px-3 py-2 text-sm leading-relaxed text-foreground"
                    style={{
                      borderColor:
                        'color-mix(in srgb, ' + item.accent + ' 30%, transparent)',
                      backgroundColor:
                        'color-mix(in srgb, ' + item.accent + ' 8%, transparent)',
                    }}
                  >
                    {item.response}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Inline SVG icons (scoped to this client component)
 * --------------------------------------------------------------------------- */

function HeartPulseIcon({ className }: { className?: string }) {
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
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      <path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" />
    </svg>
  );
}

function UtensilsIcon({ className }: { className?: string }) {
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
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </svg>
  );
}

function BuildingIcon({ className }: { className?: string }) {
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
