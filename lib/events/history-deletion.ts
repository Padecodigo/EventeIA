/**
 * Exclusão do histórico de eventos pelo usuário (0075).
 * Regras: só eventos ENCERRADOS (completed/canceled), nunca ativos; soft delete
 * com 30 dias para desfazer; depois o job expurga o conteúdo do usuário.
 */

export const HISTORY_UNDO_DAYS = 30;
export const DELETE_CONFIRMATION_WORD = "APAGAR";

const DELETABLE_STATUSES = new Set(["completed", "canceled"]);

export function canDeleteFromHistory(status: string): boolean {
  return DELETABLE_STATUSES.has(status);
}

/** Exige a palavra exata (ignora espaços nas pontas e caixa). */
export function isDeleteConfirmed(input: FormDataEntryValue | null | undefined): boolean {
  return typeof input === "string" && input.trim().toUpperCase() === DELETE_CONFIRMATION_WORD;
}

export function purgeAfter(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + HISTORY_UNDO_DAYS * 86_400_000);
}

export function canUndoDeletion(deletedAt: Date, now: Date, purged: boolean): boolean {
  return !purged && now.getTime() < purgeAfter(deletedAt).getTime();
}

/** O que é apagado e o que fica — mostrado no modal de confirmação. */
export const DELETION_REMOVES = [
  "Dados do evento (nome, entrevista, local, estilo e orçamento limite)",
  "Orçamentos calculados e cenários",
  "Suas escolhas de opções e produtos",
  "Notificações e convites ligados ao evento",
] as const;

export const DELETION_KEEPS = [
  "Dados dos fornecedores e as cotações que eles enviaram",
  "Registros financeiros obrigatórios (pagamentos, tíquetes e créditos)",
  "Prova do seu consentimento de repasse de contato (LGPD)",
] as const;

/** Rótulo único que o admin vê para evento apagado pelo usuário — sem conteúdo. */
export const ADMIN_USER_DELETED_LABEL = "apagado pelo usuário";

export function isUserDeleted(event: { user_deleted_at?: string | null }): boolean {
  return event.user_deleted_at !== null && event.user_deleted_at !== undefined;
}
