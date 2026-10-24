import { NextResponse, type NextRequest } from "next/server";

import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { detectSource, WELCOME_FINAL_PRICE_CENTS } from "@/lib/welcome/pure";
import {
  lookupWelcomeOffer,
  recentWelcomeRedemptions,
  WelcomeRateLimitedError,
  type WelcomeOfferView,
} from "@/lib/welcome/server";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    convite: z.string().max(120).optional(),
    utm_source: z.string().max(120).optional(),
    utm_campaign: z.string().max(120).optional(),
    ref: z.string().max(120).optional(),
  })
  .strip();

async function currentProfileId(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

async function respond(view: WelcomeOfferView): Promise<NextResponse> {
  const fullPriceCents = Number(process.env.B2C_TICKET_PRICE_CENTS ?? "9700");
  const active = view.status === "active" && fullPriceCents > WELCOME_FINAL_PRICE_CENTS;
  const redemptions = active ? await recentWelcomeRedemptions() : 0;
  // 200 sempre (mesmo indisponível) para não poluir o console/Lighthouse. O código do cupom
  // NÃO vai ao client: ele é aplicado no servidor no checkout.
  return NextResponse.json(
    {
      status: active ? "active" : view.status,
      remainingMs: active ? view.remainingMs : 0,
      created: active && view.created,
      fullPriceCents,
      finalPriceCents: WELCOME_FINAL_PRICE_CENTS,
      recentRedemptions: redemptions,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return origin === null || origin === request.nextUrl.origin;
}

/** Consulta sem emitir (usada em /planos e páginas internas). */
export async function GET(): Promise<NextResponse> {
  try {
    return await respond(await lookupWelcomeOffer({ claim: false, source: "new_ip", profileId: await currentProfileId() }));
  } catch (caught) {
    if (caught instanceof WelcomeRateLimitedError) {
      return NextResponse.json({ status: "rate_limited" }, { status: 429 });
    }
    throw caught;
  }
}

/** Emite a oferta para visitante novo (POST + same-origin: protege contra CSRF). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!sameOrigin(request)) {
    return NextResponse.json({ status: "forbidden" }, { status: 403 });
  }
  const raw: unknown = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  const source = detectSource(parsed.success ? parsed.data : {});

  try {
    return await respond(await lookupWelcomeOffer({ claim: true, source, profileId: await currentProfileId() }));
  } catch (caught) {
    if (caught instanceof WelcomeRateLimitedError) {
      return NextResponse.json({ status: "rate_limited" }, { status: 429 });
    }
    throw caught;
  }
}
