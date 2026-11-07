/**
 * O provedor de navegador publica apenas Instagram, sem media id e sem
 * pré-claim de in_flight. O fluxo atual exige Facebook + Instagram pela Graph;
 * portanto jobs antigos do navegador são recusados (nunca publicados).
 */
export interface BrowserPublishRefusal {
  kind: "refused";
  reason: string;
}

export function decideBrowserPublishJob(): BrowserPublishRefusal {
  return {
    kind: "refused",
    reason: "publicação pelo navegador desativada: exige Graph API e claim in_flight",
  };
}
