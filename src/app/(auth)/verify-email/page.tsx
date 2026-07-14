import Link from 'next/link';
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function VerifyEmailPage() {
  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <svg
            className="h-6 w-6 text-primary"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        </div>
        <CardTitle className="text-xl">Verify your email</CardTitle>
        <CardDescription className="space-y-2">
          <span className="block">
            We&apos;ve sent a verification link to your email address. Please
            check your inbox and click the link to verify your account.
          </span>
          <span className="block text-xs text-muted-foreground">
            Didn&apos;t receive the email? Check your spam folder or try signing
            up again.
          </span>
        </CardDescription>
      </CardHeader>
      <CardFooter className="justify-center">
        <Link href="/login">
          <Button variant="ghost">Back to sign in</Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
