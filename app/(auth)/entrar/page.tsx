import { AuthForm } from "@/components/auth/auth-form";
import { redirectIfSignedIn } from "@/lib/auth";
import { oauthErrorMessage } from "@/lib/auth/oauth";

export const metadata = { title: "Entrar", robots: { index: false, follow: true } };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  await redirectIfSignedIn();
  const { erro } = await searchParams;
  return <AuthForm mode="entrar" oauthError={oauthErrorMessage(erro)} />;
}
