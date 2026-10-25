import { NextResponse, type NextRequest } from "next/server";

import { createServerClient } from "@supabase/ssr";

import { publicOrigin } from "@/lib/auth/oauth";

const PROTECTED_PREFIXES = ["/painel", "/eventos", "/creditos", "/chamados", "/admin"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Renova a sessão Supabase (cookies) e protege rotas autenticadas.
 * Nenhuma lógica de negócio aqui (ver .context/ARCHITECTURE.md §4).
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url === undefined || anonKey === undefined) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  if (isProtected(pathname) && user === null) {
    const redirectUrl = new URL("/entrar", publicOrigin(request.headers, request.url));
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Aplica-se a todas as rotas exceto assets do Next, imagens do public
     * e webhooks (que têm autenticação própria por token).
     */
    "/((?!_next/static|_next/image|favicon.ico|logo-e.png|api/webhooks|api/internal).*)",
  ],
};
