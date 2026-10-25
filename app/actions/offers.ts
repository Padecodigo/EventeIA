"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { offerHeadline } from "@/lib/offers/pure";
import { requestUserOffer } from "@/lib/offers/server";

export interface RequestOfferState {
  error?: string;
  offer?: { code: string; headline: string; remainingMs: number; isNew: boolean };
  /** Próximo pedido liberado em (ISO, relógio do banco). */
  cooldownUntil?: string;
}

/** "Quer cupom?" — 1ª vez: boas-vindas; depois 1 cupom pessoal a cada 90 dias. */
export async function requestOfferAction(
  _previous: RequestOfferState,
  _formData: FormData,
): Promise<RequestOfferState> {
  const user = await requireUser();
  const result = await requestUserOffer(user.id);
  if (result.status === "error") {
    return { error: "Não foi possível gerar o cupom agora. Tente novamente." };
  }
  if (result.status === "cooldown") {
    return { cooldownUntil: result.nextAt };
  }
  revalidatePath("/", "layout");
  return {
    offer: {
      code: result.offer.code,
      headline: offerHeadline(result.offer.kind, result.offer),
      remainingMs: result.offer.remainingMs,
      isNew: result.status === "created",
    },
  };
}
