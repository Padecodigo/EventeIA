import { PasswordForm } from "@/components/domain/password-form";
import { ProfileForm } from "@/components/domain/profile-form";
import { EmailText } from "@/components/ui/email-text";
import { requireUser } from "@/lib/auth";
import { accountHasPassword } from "@/lib/auth/password-server";
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

  const { data: authData } = await supabase.auth.getUser();
  const hasPassword = await accountHasPassword(authData.user);
  const hasGoogle = (authData.user?.identities ?? []).some((i) => i.provider === "google");

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header>
        <p className="eyebrow">Conta</p>
        <h1 className="mt-3 font-serif text-display-2 font-display">Seu perfil.</h1>
        <p className="mt-3 text-sm leading-6 text-vinho/75">
          Mantenha o telefone e o CPF atualizados. O CPF é usado só para emitir a cobrança; o
          WhatsApp só recebe mensagens com o seu consentimento.
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

      <section
        id="senha"
        className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft sm:p-8"
      >
        <h2 className="font-serif text-title-2">{hasPassword ? "Alterar senha" : "Criar senha"}</h2>
        <p className="mt-2 text-sm leading-6 text-vinho/75 [overflow-wrap:anywhere]">
          {hasPassword
            ? "Troque a senha usada para entrar com e-mail."
            : hasGoogle
              ? "Você entra com o Google. Se quiser, crie uma senha para também entrar com e-mail e senha — o Google continua funcionando."
              : "Crie uma senha para entrar com e-mail e senha."}
          {user.email ? (
            <>
              {" "}E-mail de acesso: <EmailText email={user.email} />.
            </>
          ) : null}
        </p>
        <PasswordForm hasPassword={hasPassword} />
      </section>
    </div>
  );
}
