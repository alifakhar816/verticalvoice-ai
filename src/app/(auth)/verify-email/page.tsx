import Link from 'next/link';
import Image from 'next/image';
import { brand } from '@/config/brand';
import { Button } from '@/components/ui/button';

export default function VerifyEmailPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link
        href="/"
        className="mb-10 inline-flex transition-opacity hover:opacity-80"
        aria-label={`${brand.name} home`}
      >
        <Image
          src="/logo/full.svg"
          alt={brand.logoAlt}
          width={168}
          height={32}
          priority
          className="h-8 w-auto"
        />
      </Link>

      <div className="w-full max-w-md animate-vv-fade-up rounded-xl border border-border bg-card p-8 text-center shadow-sm sm:p-10">
        {/* animated brass pulse */}
        <div className="relative mx-auto mb-6 flex size-14 items-center justify-center">
          <span
            aria-hidden
            className="absolute inset-0 rounded-full bg-brand/30 animate-vv-ping"
          />
          <span className="relative flex size-14 items-center justify-center rounded-full bg-brand/10 text-brand">
            <MailIcon className="size-7" />
          </span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">
          Verify your email
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We&apos;ve sent a verification link to your email address. Check your
          inbox and click the link to activate your account.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Didn&apos;t get it? Check your spam folder, or resend below.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3">
          <Link href="/signup" className="w-full">
            <Button variant="outline" className="h-11 w-full">
              Resend verification email
            </Button>
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-brand"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

function MailIcon({ className }: { className?: string }) {
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
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}
