import Link from 'next/link';
import { brand } from '@/config/brand';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-4 py-12">
      <div className="mb-8 flex flex-col items-center gap-2">
        <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-lg">
            V
          </div>
          <span className="text-xl font-bold tracking-tight">{brand.name}</span>
        </Link>
        <p className="text-sm text-muted-foreground">{brand.tagline}</p>
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
