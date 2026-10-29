import { requireAdmin } from "@/lib/auth";
import { hasInstagramSession } from "@/lib/instagram-browser/session";

import { logoutInstagramAction } from "./actions";
import { InstagramLoginForm } from "./instagram-login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Instagram" };

export default async function InstagramAdminPage() {
  await requireAdmin();
  const connected = await hasInstagramSession();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-serif text-title-2 text-vinho">Instagram &amp; Facebook</h1>
        <p className="mt-1 text-caption text-vinho/70">
          Sessão do navegador usada para publicar no Instagram @eventeia e na página Facebook Eventeia.
          Pode ficar sempre logada; a sessão é salva e reutilizada pela automação.
        </p>
      </header>

      <section className="rounded-card border border-line-subtle bg-white/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-vinho">Sessão atual</p>
            <p className="mt-1 text-caption text-vinho/70">
              {connected
                ? "Logado — a automação pode publicar."
                : "Deslogado — faça login para publicar."}
            </p>
          </div>
          {connected ? (
            <form action={logoutInstagramAction}>
              <button
                type="submit"
                className="rounded-full border border-line-strong px-4 py-2 text-sm font-semibold text-vinho transition hover:bg-areia-secundaria/60"
              >
                Deslogar
              </button>
            </form>
          ) : null}
        </div>
      </section>

      <section className="rounded-card border border-line-subtle bg-white/70 p-5">
        <p className="text-sm font-medium text-vinho">{connected ? "Trocar de conta" : "Logar"}</p>
        <p className="mt-1 text-caption text-vinho/70">
          Entre com a conta @eventeia (ou outra). O login é feito no navegador do servidor; se o Instagram
          pedir verificação (2FA/checkpoint), use o script com tela no servidor.
        </p>
        <InstagramLoginForm />
      </section>
    </div>
  );
}
