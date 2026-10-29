import { requireAdmin } from "@/lib/auth";
import { hasFacebookSession, hasInstagramSession } from "@/lib/instagram-browser/session";

import { logoutFacebookAction, logoutInstagramAction } from "./actions";
import { SocialLoginForm } from "./instagram-login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Instagram & Facebook" };

const cardClass = "rounded-card border border-line-subtle bg-white/70 p-5";
const logoutClass =
  "rounded-full border border-line-strong px-4 py-2 text-sm font-semibold text-vinho transition hover:bg-areia-secundaria/60";

export default async function InstagramAdminPage() {
  await requireAdmin();
  const [igConnected, fbConnected] = await Promise.all([hasInstagramSession(), hasFacebookSession()]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-serif text-title-2 text-vinho">Instagram &amp; Facebook</h1>
        <p className="mt-1 text-caption text-vinho/70">
          Sessões do navegador usadas pela automação. Ficam sempre logadas; a sessão é salva e reutilizada pelos jobs.
        </p>
      </header>

      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-vinho">Instagram @eventeia</p>
            <p className="mt-1 text-caption text-vinho/70">
              {igConnected ? "Logado — a automação pode publicar." : "Deslogado — faça login para publicar."}
            </p>
          </div>
          {igConnected ? (
            <form action={logoutInstagramAction}>
              <button type="submit" className={logoutClass}>
                Deslogar
              </button>
            </form>
          ) : null}
        </div>
        <p className="mt-3 text-caption text-vinho/70">
          Entre com <strong>usuário ou e-mail</strong>. Se o Instagram pedir verificação (2FA/checkpoint), use o
          script com tela no servidor.
        </p>
        <SocialLoginForm platform="instagram" />
      </section>

      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-vinho">Facebook — página Eventeia</p>
            <p className="mt-1 text-caption text-vinho/70">
              {fbConnected ? "Logado." : "Deslogado — faça login com a conta que administra a página."}
            </p>
          </div>
          {fbConnected ? (
            <form action={logoutFacebookAction}>
              <button type="submit" className={logoutClass}>
                Deslogar
              </button>
            </form>
          ) : null}
        </div>
        <p className="mt-3 text-caption text-vinho/70">
          Entre com e-mail e senha da conta que administra a página Facebook Eventeia.
        </p>
        <SocialLoginForm platform="facebook" />
      </section>
    </div>
  );
}
