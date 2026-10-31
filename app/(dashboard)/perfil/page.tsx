import { EventHistoryDeletion } from "@/components/domain/event-history-deletion";
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
    .select("display_name,phone_e164,document_number,contact_whatsapp_e164,instagram_handle")
    .eq("id", user.id)
    .maybeSingle();

  const phone = profile?.phone_e164 ?? "";
  const { data: authData } = await supabase.auth.getUser();
  const hasPassword = await accountHasPassword(authData.user);
  const hasGoogle = (authData.user?.identities ?? []).some((i) => i.provider === "google");

  // Histórico (0074): só eventos encerrados do próprio usuário; apagados somem pela RLS.
  const { data: closedRows } = await supabase
    .from("events")
    .select("id,title,event_date,status")
    .eq("owner_profile_id", user.id)
    .in("status", ["completed", "canceled"])
    .order("event_date", { ascending: false })
    .limit(100);
  const { data: deletedRows } = await supabase.rpc("list_my_deleted_events");
  const dateLabel = (iso: string) =>
    new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const closedEvents = (closedRows ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    dateLabel: dateLabel(e.event_date),
    statusLabel: e.status === "completed" ? "Encerrado" : "Excluído",
  }));
  const deletedEvents = (deletedRows ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    purgeAfterLabel: new Date(e.purge_after).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
  }));

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header>
        <p className="eyebrow">Conta</p>
        <h1 className="mt-3 font-serif text-display-2 font-display">Seu perfil.</h1>
        <p className="mt-3 text-sm leading-6 text-vinho/75">
          Mantenha o telefone, o WhatsApp e o CPF atualizados. O CPF é usado só para emitir a
          cobrança; o telefone e o WhatsApp são usados para contato sobre os seus eventos.
        </p>
      </header>

      <section className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft sm:p-8">
        <ProfileForm
          defaultName={profile?.display_name ?? ""}
          defaultPhone={phone}
          defaultCpf={profile?.document_number ?? ""}
          defaultWhatsapp={profile?.contact_whatsapp_e164 ?? ""}
          defaultInstagram={profile?.instagram_handle ?? ""}
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
      <EventHistoryDeletion closedEvents={closedEvents} deletedEvents={deletedEvents} />
    </div>
  );
}
