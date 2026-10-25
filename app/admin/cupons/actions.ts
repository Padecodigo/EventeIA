"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { normalizeCouponCode } from "@/lib/coupons/pure";
import { emitFeed } from "@/lib/feeds";
import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface CouponAdminState {
  error?: string;
  success?: boolean;
}

const createCouponSchema = z.object({
  code: z.string().trim().min(2).max(24),
  discountType: z.enum(["percent", "fixed_cents", "free"]),
  value: z.coerce.number().int().positive(),
  maxUses: z.coerce.number().int().positive().optional(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const VALUE_LIMITS: Record<"percent" | "fixed_cents" | "free", number> = {
  percent: 90,
  fixed_cents: 100_000,
  // Cortesia: valor é irrelevante (gratuidade total); gravado como 1.
  free: Number.MAX_SAFE_INTEGER,
};

export async function createCouponAction(
  _previous: CouponAdminState,
  formData: FormData,
): Promise<CouponAdminState> {
  const adminUser = await requireAdmin();

  const expiresRaw = formData.get("expiresAt");
  const parsed = createCouponSchema.safeParse({
    code: formData.get("code"),
    discountType: formData.get("discountType"),
    value: formData.get("value"),
    maxUses: formData.get("maxUses") ?? undefined,
    expiresAt: typeof expiresRaw === "string" && expiresRaw.length > 0 ? expiresRaw : undefined,
  });

  if (!parsed.success) {
    return { error: "Confira código, tipo e valor do cupom." };
  }

  const code = normalizeCouponCode(parsed.data.code);
  const limit = VALUE_LIMITS[parsed.data.discountType];

  if (parsed.data.value > limit) {
    return {
      error:
        parsed.data.discountType === "percent"
          ? "Percentual máximo: 90%."
          : "Valor fixo máximo: R$ 1.000,00.",
    };
  }

  const isFree = parsed.data.discountType === "free";
  const admin = getSupabaseAdmin();

  const { error } = await admin.from("coupons").insert({
    code,
    description: null,
    discount_type: parsed.data.discountType,
    value: isFree ? 1 : parsed.data.value,
    active: true,
    expires_at:
      parsed.data.expiresAt !== undefined
        ? new Date(`${parsed.data.expiresAt}T23:59:59Z`).toISOString()
        : null,
    // Cortesia sem limite explícito vale 1 uso (nunca ilimitada por engano).
    max_redemptions: parsed.data.maxUses ?? (isFree ? 1 : null),
    redemptions: 0,
  });

  if (error !== null) {
    if (error.code === "23505") {
      return { error: `O cupom ${code} já existe.` };
    }
    logger.error({ code: error.code }, "falha ao criar cupom");
    return { error: "Não foi possível criar o cupom." };
  }

  try {
    await emitFeed(admin, {
      type: "coupon.created",
      actorType: "admin",
      actorId: adminUser.id,
      aggregateType: "coupon",
      aggregateId: code,
      payload: { discount_type: parsed.data.discountType, value: parsed.data.value },
      correlationId: code,
      source: "app",
    });
  } catch {
    // feed não bloqueia a criação
  }

  revalidatePath("/admin/cupons");
  return { success: true };
}

export async function toggleCouponAction(formData: FormData): Promise<void> {
  const adminUser = await requireAdmin();
  const parsed = z
    .object({ couponId: z.string().uuid(), activate: z.enum(["true", "false"]) })
    .safeParse({
      couponId: formData.get("couponId"),
      activate: formData.get("activate"),
    });

  if (!parsed.success) {
    revalidatePath("/admin/cupons");
    return;
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("coupons")
    .update({ active: parsed.data.activate === "true" })
    .eq("id", parsed.data.couponId);

  if (error !== null) {
    logger.error({ code: error.code }, "falha ao alternar cupom");
  } else {
    try {
      await emitFeed(admin, {
        type: "coupon.updated",
        actorType: "admin",
        actorId: adminUser.id,
        aggregateType: "coupon",
        aggregateId: parsed.data.couponId,
        payload: { active: parsed.data.activate === "true" },
        correlationId: parsed.data.couponId,
        source: "app",
      });
    } catch {
      // feed não bloqueia a alternância
    }
  }

  revalidatePath("/admin/cupons");
}
