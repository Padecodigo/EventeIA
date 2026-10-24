import { ProfileForm } from "@/components/domain/profile-form";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Perfil" };

export default async function ProfilePage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name,phone_e164,document_number")
    .eq("id", user.id)
    .maybeSingle();

  const phone = profile?.phone_e164 ?? "";
  const { data: consent } =
    phone.length > 0
      ? await supabase
          .from("consents")
          .select("status")
          .eq("profile_id", user.id)
          .eq("phone_e164", phone)
          .maybeSingle()
      : { data: null };

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header>
        <p className="eyebrow">Conta</p>
        <h1 className="mt-3 font-serif text-display-2 font-display">Seu perfil.</h1>
        <p className="mt-3 text-sm leading-6 text-vinho/75">
          Mantenha o telefone e o CPF atualizados. O CPF é usado só para emitir a cobrança; o WhatsApp
          só recebe mensagens com o seu consentimento.
        </p>
      </header>

      <section className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft sm:p-8">
        <ProfileForm
          defaultName={profile?.display_name ?? ""}
          defaultPhone={phone}
          defaultCpf={profile?.document_number ?? ""}
          whatsappOptIn={consent?.status === "opted_in"}
        />
      </section>
    </div>
  );
}
