import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/database/supabase-server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth code exchange failed or no code -- redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
