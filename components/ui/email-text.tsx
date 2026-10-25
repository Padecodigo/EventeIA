/**
 * Exibe um e-mail sem que o "Email Obfuscation" do Cloudflare o reescreva no HTML.
 *
 * Regressão: o Cloudflare troca `fulano@dominio` no SSR por `[email protected]`
 * (link /cdn-cgi/l/email-protection), o React encontra outro texto na hidratação e
 * dispara o erro #418 (visto em /perfil). Separar o "@" num elemento próprio impede
 * o casamento do padrão de e-mail sem mudar o que o usuário vê.
 */
export function splitEmail(email: string): [string, string] | null {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return [email.slice(0, at), email.slice(at + 1)];
}

export function EmailText({ email }: { email: string | null | undefined }) {
  if (!email) return null;
  const parts = splitEmail(email);
  if (parts === null) return <>{email}</>;
  return (
    <>
      {parts[0]}
      <span>@</span>
      {parts[1]}
    </>
  );
}
