import { AuthForm } from "@/components/auth/auth-form";

export const metadata = { title: "Criar conta" };

export default function SignUpPage() {
  return <AuthForm mode="registrar" />;
}
