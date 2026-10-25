import { PasswordForm } from "@/components/domain/password-form";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Nova senha", robots: { index: false, follow: false } };

/** Destino do link "Esqueci minha senha" (sessão criada pelo /auth/callback). */
export default async function ResetPasswordPage() {
  const user = await requireUser();
  return (
    <div>
      <h1 className="font-serif text-title-1">Crie uma nova senha</h1>
      <p className="mt-2 text-sm text-vinho/70">
        Para {user.email ?? "a sua conta"}. Depois você pode entrar com e-mail e senha — e, se usa o
        Google, ele continua funcionando.
      </p>
      <PasswordForm hasPassword={false} submitLabel="Salvar nova senha" />
    </div>
  );
}
