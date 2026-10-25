/**
 * Estado de conexão exibido no painel "Agente Orçamentista" (módulo puro).
 * O banco pode atrasar em relação à Evolution (webhook connection.update ainda
 * não processado, ou status salvo por parser antigo): se a Evolution diz "open",
 * o WhatsApp ESTÁ conectado e a tela não deve pedir reconexão.
 */
export function resolvePanelConnection(
  dbStatus: string | null,
  evolutionState: "open" | "connecting" | "close" | null,
): { connected: boolean; showDisconnectedAlert: boolean } {
  const dbConnected = dbStatus === "active" || dbStatus === "draining" || dbStatus === "connected";
  const connected = dbConnected || evolutionState === "open";
  return { connected, showDisconnectedAlert: !connected && dbStatus === "disconnected" };
}

/** "5512981631234@s.whatsapp.net" | "5512981631234" → "+55 12 98163-1234". */
export function formatWhatsappNumber(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const digits = raw.split("@")[0]?.split(":")[0]?.replace(/\D/g, "") ?? "";
  if (digits.length < 8) return null;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    return `+55 ${ddd} ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
  }
  return `+${digits}`;
}
