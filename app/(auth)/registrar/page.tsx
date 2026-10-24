import { AuthForm } from "@/components/auth/auth-form";

export const metadata = { title: "Criar conta", robots: { index: false, follow: true } };

export default function SignUpPage() {
  return <AuthForm mode="registrar" />;
}
