'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ icons */

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 6.68 9.14 4.75 12 4.75Z"
      />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.88 9.88a3 3 0 0 0 4.24 4.24" />
      <path d="M10.73 5.08A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}

/* ------------------------------------------------------- Google + divider */

export function GoogleButton({
  onClick,
  loading,
  label = 'Continue with Google',
}: {
  onClick: () => void;
  loading?: boolean;
  label?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={loading}
      className="h-11 w-full gap-3 text-sm font-medium"
    >
      <GoogleIcon />
      {label}
    </Button>
  );
}

export function OrDivider({ label = 'or' }: { label?: string }) {
  return (
    <div className="flex items-center gap-4" role="separator" aria-orientation="horizontal">
      <span className="h-px flex-1 bg-border" aria-hidden />
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}

/* -------------------------------------------------- password field + meter */

/**
 * Password input with a show/hide toggle. Spreads all native input props
 * (value, onChange, onBlur, autoComplete, etc.) straight onto the Input.
 */
export function PasswordField({
  id,
  className,
  ...props
}: React.ComponentProps<'input'>) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? 'text' : 'password'}
        className={cn('pr-11', className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
};

/** Cheap heuristic strength score (0–4). */
export function scorePassword(pw: string): PasswordStrength {
  if (!pw) return { score: 0, label: '' };
  let n = 0;
  if (pw.length >= 8) n += 1;
  if (pw.length >= 12) n += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) n += 1;
  if (/\d/.test(pw)) n += 1;
  if (/[^A-Za-z0-9]/.test(pw)) n += 1;
  const score = Math.min(4, n) as 0 | 1 | 2 | 3 | 4;
  const label = ['', 'Weak', 'Fair', 'Good', 'Strong'][score];
  return { score, label };
}

/**
 * Strength meter. Fill climbs destructive -> warning -> success -> brass as
 * strength increases (brass = strongest, per Obsidian & Brass).
 */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const { score, label } = scorePassword(password);
  const fill = ['bg-muted', 'bg-destructive', 'bg-warning', 'bg-success', 'bg-brand'][score];
  const text = ['text-muted-foreground', 'text-destructive', 'text-warning', 'text-success', 'text-brand'][score];
  return (
    <div aria-live="polite">
      <div className="flex gap-1.5" aria-hidden>
        {[1, 2, 3, 4].map((seg) => (
          <span
            key={seg}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              seg <= score ? fill : 'bg-muted',
            )}
          />
        ))}
      </div>
      {label ? (
        <p className={cn('mt-1.5 text-xs font-medium', text)}>
          Password strength: {label}
        </p>
      ) : null}
    </div>
  );
}
