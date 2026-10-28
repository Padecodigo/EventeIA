import { NextResponse, type NextRequest } from "next/server";

import { createServerClient } from "@supabase/ssr";

import { publicOrigin } from "@/lib/auth/oauth";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  isSessionCookie,
  sessionExpired,
} from "@/lib/auth/session-ttl";
import { sessionCookieOptions } from "@/lib/supabase/session-cookies";

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
          response.cookies.set(name, value, sessionCookieOptions(options));
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // TTL curto: sessão iniciada há mais de SESSION_MAX_AGE_MINUTES é encerrada.
  if (user !== null) {
    const started = request.cookies.get(SESSION_COOKIE)?.value;
    if (started === undefined) {
      response.cookies.set(SESSION_COOKIE, String(Date.now()), SESSION_COOKIE_OPTIONS);
    } else if (sessionExpired(started, Date.now())) {
      const redirect = NextResponse.redirect(
        new URL("/entrar?expirada=1", publicOrigin(request.headers, request.url)),
      );
      for (const cookie of request.cookies.getAll()) {
        if (isSessionCookie(cookie.name)) {
          redirect.cookies.delete({ name: cookie.name, path: "/" });
        }
      }
      redirect.cookies.delete({ name: SESSION_COOKIE, path: "/" });
      return redirect;
    }
  }

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
