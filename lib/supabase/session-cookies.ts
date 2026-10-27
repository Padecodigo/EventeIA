import type { CookieOptions } from "@supabase/ssr";

/**
 * Ajusta o cookie de autenticação para **cookie de sessão** do navegador.
 *
 * O `@supabase/ssr` grava a sessão com `maxAge` de 400 dias, o que mantém o
 * usuário logado mesmo depois de fechar o navegador. Removendo `maxAge` e
 * `expires` o cookie passa a viver só enquanto a sessão do navegador durar:
 * fechar o navegador desloga, recarregar a página não.
 *
 * Deleções (`maxAge: 0`, usadas no signOut e na rotação de token) passam
 * intactas — sem isso o cookie não seria removido.
 *
 * Limite conhecido: navegadores com "continuar de onde parou" podem restaurar
 * cookies de sessão ao reabrir. Não há como impedir isso pelo servidor.
 */
export function sessionCookieOptions(options: CookieOptions | undefined): CookieOptions {
  if (options !== undefined && options.maxAge === 0) return options;
  return { ...options, maxAge: undefined, expires: undefined };
}
