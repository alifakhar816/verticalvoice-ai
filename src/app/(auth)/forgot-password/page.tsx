'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/database/supabase-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { AuthSplitShell } from '@/components/auth/auth-split-shell';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [emailError, setEmailError] = useState('');

  const supabase = createClient();

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/callback`,
      });

      if (error) {
        toast.error(error.message || 'Could not send the reset link. Please try again.');
        return;
      }

      setSent(true);
    } catch {
      toast.error('Could not send the reset link. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <AuthSplitShell>
        <div className="text-center">
          <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckIcon className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            If an account exists for{' '}
            <strong className="text-foreground">{email}</strong>, we sent a
            password reset link. Please check your inbox.
          </p>
          <Link href="/login">
            <Button variant="ghost" className="mt-6 h-11">
              Back to sign in
            </Button>
          </Link>
        </div>
      </AuthSplitShell>
    );
  }

  return (
    <AuthSplitShell>
      <div>
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Reset your password
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </header>

        <form onSubmit={handleReset} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() =>
                setEmailError(
                  !email
                    ? 'Email is required'
                    : EMAIL_RE.test(email)
                      ? ''
                      : 'Enter a valid email address',
                )
              }
              aria-invalid={!!emailError}
              aria-describedby={emailError ? 'email-error' : undefined}
              required
              autoComplete="email"
            />
            {emailError ? (
              <p id="email-error" className="text-xs text-destructive">
                {emailError}
              </p>
            ) : null}
          </div>
          <Button type="submit" className="h-11 w-full" disabled={loading}>
            {loading ? 'Sending...' : 'Send reset link'}
          </Button>
        </form>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Remembered it?{' '}
          <Link
            href="/login"
            className="font-medium text-foreground transition-colors hover:text-brand"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </AuthSplitShell>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
