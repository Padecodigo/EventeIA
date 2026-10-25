import { NextResponse, type NextRequest } from "next/server";

import { requestIsSameOrigin } from "@/lib/http/same-origin";
import { luckyDiscountCents } from "@/lib/lucky/pure";
import { LuckyRateLimitedError, lookupLuckyCoupon, type LuckyCouponView } from "@/lib/lucky/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function currentProfileId(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

function respond(view: LuckyCouponView): NextResponse {
  const fullPriceCents = Number(process.env.B2C_TICKET_PRICE_CENTS ?? "9700");
  const active = view.status === "active" && view.percent !== null && view.remainingMs > 0;
  const finalPriceCents = active
    ? fullPriceCents - luckyDiscountCents(fullPriceCents, view.percent as number)
    : null;
  return NextResponse.json(
    {
      status: active ? "active" : view.status === "active" ? "expired" : view.status,
      // Código exibido só como "comprovante": é preso a este aparelho/conta e aplicado no servidor.
      code: active ? view.code : null,
      percent: active ? view.percent : null,
      remainingMs: active ? view.remainingMs : 0,
      redrawInMs: view.redrawInMs,
      created: active && view.created,
      fullPriceCents,
      finalPriceCents,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function sameOrigin(request: NextRequest): boolean {
  return requestIsSameOrigin(request);
}

async function handle(draw: boolean): Promise<NextResponse> {
  try {
    return respond(await lookupLuckyCoupon({ draw, profileId: await currentProfileId() }));
  } catch (caught) {
    if (caught instanceof LuckyRateLimitedError) {
      return NextResponse.json({ status: "rate_limited" }, { status: 429 });
    }
    throw caught;
  }
}

/** Consulta: "available" ⇒ mostrar o botão "Quer cupom?". Nunca sorteia. */
export async function GET(): Promise<NextResponse> {
  return handle(false);
}

/** Sorteio (POST + same-origin). O body é ignorado: o client não influencia o percentual. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!sameOrigin(request)) {
    return NextResponse.json({ status: "forbidden" }, { status: 403 });
  }
  return handle(true);
}
