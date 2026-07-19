import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/database/supabase-server";
import { getCurrentTenantId } from "@/domain/tenants/current";
import {
  filterVoices,
  getVoiceCatalog,
  listLanguages,
  toVoiceSummary,
} from "@/lib/voices/catalog";

/**
 * Lists the Ultravox voice catalog for the voice picker.
 *
 * Authenticated and tenant-scoped: the catalog is not tenant data, but it is
 * bought with our Ultravox key, so it is not something to hand to anonymous
 * callers. Reading the session cookie makes this route dynamic, which is what
 * we want — Next.js does not cache Route Handlers by default, and the
 * in-memory catalog cache in `@/lib/voices/catalog` is what actually keeps us
 * off the upstream API.
 *
 * The `definition` blob Ultravox returns (Eleven Labs ids, models) never
 * reaches the browser; only `toVoiceSummary`'s trimmed shape does.
 *
 * The language list is always computed from the FULL catalog, never from the
 * filtered result — otherwise picking a language would collapse the filter to
 * that one option and strand the user there.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenant_id = await getCurrentTenantId(user.id);
    if (!tenant_id) {
      return NextResponse.json(
        { error: "No tenant found for this account." },
        { status: 403 }
      );
    }

    const catalog = await getVoiceCatalog();

    const search = request.nextUrl.searchParams.get("search");
    const language = request.nextUrl.searchParams.get("language");
    const matches = filterVoices(catalog, { search, language });

    return NextResponse.json({
      data: {
        voices: matches.map(toVoiceSummary),
        languages: listLanguages(catalog),
        total: catalog.length,
        matched: matches.length,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "The list of voices could not be loaded. Please try again." },
      { status: 502 }
    );
  }
}
