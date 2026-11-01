/** Eco enviado pelo nosso próprio app já foi gravado por quem enviou (chat/agente). */
export function isOwnAppEcho(appId: string | null, ownAppId: string | undefined): boolean {
  return appId !== null && ownAppId !== undefined && ownAppId.length > 0 && appId === ownAppId;
}
