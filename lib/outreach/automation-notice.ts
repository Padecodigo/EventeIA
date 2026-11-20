export const FORWARDED_MESSAGE_NOTICE =
  "Mensagem do cliente do evento, enviada pela EventeIA (serviço autônomo de prospecção de fornecedores):";

export function withAutomationNotice(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith(FORWARDED_MESSAGE_NOTICE)) return trimmed;
  return `${FORWARDED_MESSAGE_NOTICE}\n${trimmed}`;
}
