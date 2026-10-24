import { z } from "zod";

import { TestimonialForm } from "@/components/marketing/testimonial-form";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { CONSENT_TEXT, isInviteUsable } from "@/lib/testimonials/pure";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Conte a sua história",
  robots: { index: false, follow: false },
};

function InviteUnavailable({ reason }: { reason: string }) {
  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-24 sm:px-8">
      <p className="eyebrow">Depoimento</p>
      <h1 className="mt-4 font-serif text-display-2 font-display leading-tight">
        Convite indisponível.
      </h1>
      <p className="mt-4 text-vinho/75">{reason}</p>
      <p className="mt-8 text-sm text-vinho/70">
        Se você acredita que isto é um engano, fale com a gente pelo atendimento da EventeIA.
      </p>
    </section>
  );
}

export default async function TestimonialInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const parsed = z.string().uuid().safeParse(token);

  if (!parsed.success) {
    return <InviteUnavailable reason="O link não contém um convite válido." />;
  }

  try {
    const admin = getSupabaseAdmin();

    const { data: invite } = await admin
      .from("testimonial_invites")
      .select("id,event_id,profile_id,expires_at,used_at")
      .eq("token", parsed.data)
      .maybeSingle();

    if (invite === null || !isInviteUsable(invite)) {
      return (
        <InviteUnavailable reason="Este convite expirou ou já foi utilizado. Cada evento gera um convite próprio." />
      );
    }

    const [eventResult, profileResult] = await Promise.all([
      admin
        .from("events")
        .select("event_type,guest_count")
        .eq("id", invite.event_id)
        .maybeSingle(),
      admin.from("profiles").select("display_name").eq("id", invite.profile_id).maybeSingle(),
    ]);

    const context =
      eventResult.data === null
        ? "Evento na EventeIA"
        : `${eventResult.data.event_type} · ${String(eventResult.data.guest_count)} convidados`;

    return (
      <section className="mx-auto w-full max-w-2xl px-4 py-20 sm:px-8">
        <p className="eyebrow">Sua história importa</p>
        <h1 className="mt-4 font-serif text-[clamp(2.2rem,5vw,3.4rem)] font-display leading-[1.05] tracking-[-0.02em]">
          Conte como foi viver a EventeIA.
        </h1>
        <p className="mt-5 text-vinho/75">
          O seu relato ajuda outras famílias a decidir com mais clareza — e ajuda a gente a melhorar.
          Publicamos apenas com a sua autorização.
        </p>
        <p className="mt-3 inline-flex rounded-full bg-champagne-claro/60 px-3 py-1 text-caption text-vinho">
          {context}
        </p>

        <div className="mt-10 rounded-card border border-line-subtle bg-off-white p-6 shadow-soft sm:p-8">
          <TestimonialForm
            token={parsed.data}
            defaultName={profileResult.data?.display_name ?? ""}
            consentText={CONSENT_TEXT}
          />
        </div>
      </section>
    );
  } catch {
    return (
      <InviteUnavailable reason="O formulário está indisponível neste ambiente no momento." />
    );
  }
}
