import { AuthForm } from "@/components/auth/auth-form";
import { redirectIfSignedIn } from "@/lib/auth";
import { oauthErrorMessage } from "@/lib/auth/oauth";

export const metadata = { title: "Criar conta", robots: { index: false, follow: true } };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  await redirectIfSignedIn();
  const { erro } = await searchParams;
  return <AuthForm mode="registrar" oauthError={oauthErrorMessage(erro)} />;
}
