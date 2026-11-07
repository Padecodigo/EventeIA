import { AuthForm } from "@/components/auth/auth-form";
import { redirectIfSignedIn } from "@/lib/auth";
import { oauthErrorMessage } from "@/lib/auth/oauth";

export const metadata = {
  title: "Criar conta — comece o orçamento do seu evento",
  description: "Crie sua conta na EventeIA e comece o orçamento do seu evento: você conta o que imagina e recebe o orçamento pronto no menor preço válido.",
  robots: { index: false, follow: true },
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  await redirectIfSignedIn();
  const { erro } = await searchParams;
  return <AuthForm mode="registrar" oauthError={oauthErrorMessage(erro)} />;
}
