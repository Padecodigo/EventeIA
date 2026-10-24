import { AuthForm } from "@/components/auth/auth-form";

export const metadata = { title: "Entrar" };

export default function SignInPage() {
  return <AuthForm mode="entrar" />;
}
