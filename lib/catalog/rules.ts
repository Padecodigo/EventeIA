/**
 * Regras puras da entrevista: perguntas visíveis, validação (zod) e requisitos resultantes.
 */
import { z } from "zod";

import type { EventType } from "@/lib/engine/types";

import {
  CATALOG_VERSION,
  DEFAULT_OVERRIDES,
  ITEMS,
  QUESTIONS,
  type AnswerValue,
  type CatalogItem,
  type CategoryCode,
  type Condition,
  type Question,
  MAX_SPECIAL_REQUEST,
  SPECIAL_REQUEST_ITEM,
  SPECIAL_REQUEST_QUESTION,
  type Unit,
} from "./v1";

export type Answers = Record<string, AnswerValue>;

export interface Requirement {
  itemCode: string;
  category: CategoryCode;
  label: string;
  unit: Unit;
  quantity: number;
  mandatory: boolean;
  /** Texto livre (só na demanda específica). */
  notes?: string;
}

function applies(appliesTo: EventType[] | "all", eventType: EventType): boolean {
  return appliesTo === "all" || appliesTo.includes(eventType);
}

export function conditionsMet(conditions: Condition[] | undefined, answers: Answers): boolean {
  if (conditions === undefined) return true;
  return conditions.every((c) => answers[c.question] === c.equals);
}

export function defaultAnswer(question: Question, eventType: EventType): AnswerValue {
  return DEFAULT_OVERRIDES[eventType]?.[question.id] ?? question.defaultValue;
}

export function defaultAnswers(eventType: EventType): Answers {
  const answers: Answers = {};
  for (const q of QUESTIONS) {
    if (applies(q.appliesTo, eventType)) answers[q.id] = defaultAnswer(q, eventType);
  }
  return answers;
}

/** Perguntas aplicáveis ao tipo e com showIf satisfeito, na ordem do catálogo. */
export function visibleQuestions(eventType: EventType, answers: Answers): Question[] {
  return QUESTIONS.filter((q) => applies(q.appliesTo, eventType) && conditionsMet(q.showIf, answers));
}

function questionValueSchema(q: Question): z.ZodType<AnswerValue> {
  switch (q.kind) {
    case "boolean":
      return z.boolean();
    case "single":
      return z.enum(q.options.map((o) => o.value) as [string, ...string[]]);
    case "number":
      return z.number().int().min(q.min).max(q.max);
    case "text":
      return z.string().trim().max(q.maxLength);
  }
}

/**
 * Valida as respostas contra o catálogo: só aceita perguntas visíveis, com tipos/limites corretos.
 * Respostas a perguntas ocultas são descartadas (não falham).
 */
export function parseAnswers(
  eventType: EventType,
  raw: unknown,
): { success: true; data: Answers } | { success: false; error: string } {
  const base = z.record(z.string().max(64), z.union([z.boolean(), z.string().max(MAX_SPECIAL_REQUEST * 2), z.number()])).safeParse(raw);
  if (!base.success) return { success: false, error: "Formato de respostas inválido." };

  const merged: Answers = { ...defaultAnswers(eventType), ...base.data };
  const result: Answers = {};
  // Itera até estabilizar: showIf depende de respostas anteriores.
  for (const q of visibleQuestions(eventType, merged)) {
    const value = questionValueSchema(q).safeParse(merged[q.id]);
    if (!value.success) return { success: false, error: `Resposta inválida: ${q.label}` };
    result[q.id] = value.data;
  }
  const stable = visibleQuestions(eventType, result).every((q) => q.id in result);
  if (!stable) return { success: false, error: "Respostas inconsistentes." };
  return { success: true, data: result };
}

function quantityFor(item: CatalogItem, guestCount: number, answers: Answers): number {
  const hours = typeof answers.duracao_horas === "number" ? answers.duracao_horas : 1;
  switch (item.quantity.kind) {
    case "guests":
      return Math.max(1, guestCount);
    case "hours":
      return Math.max(1, hours);
    case "fixed":
      return item.quantity.value;
    case "per_guests":
      return Math.max(1, Math.ceil(guestCount / item.quantity.every));
    case "answer": {
      const v = answers[item.quantity.question];
      return typeof v === "number" && v > 0 ? v : 1;
    }
  }
}

/** Itens que o agente vai cotar para este evento. */
export function resolveRequirements(eventType: EventType, guestCount: number, answers: Answers): Requirement[] {
  const seen = new Set<string>();
  const out: Requirement[] = [];
  for (const item of ITEMS) {
    if (!applies(item.appliesTo, eventType) || !conditionsMet(item.when, answers)) continue;
    if (seen.has(item.code)) continue;
    seen.add(item.code);
    out.push({
      itemCode: item.code,
      category: item.category,
      label: item.label,
      unit: item.unit,
      quantity: quantityFor(item, guestCount, answers),
      mandatory: item.mandatory,
    });
  }
  const special = answers[SPECIAL_REQUEST_QUESTION];
  if (typeof special === "string" && special.trim().length > 0) {
    out.push({
      itemCode: SPECIAL_REQUEST_ITEM,
      category: "outros",
      label: "Demanda específica do cliente",
      unit: "pacote",
      quantity: 1,
      mandatory: false,
      notes: special.trim().slice(0, MAX_SPECIAL_REQUEST),
    });
  }
  return out;
}

export function requiredCategories(reqs: Requirement[]): CategoryCode[] {
  return [...new Set(reqs.map((r) => r.category))];
}

export { CATALOG_VERSION };

const conditionSchema = z.object({ question: z.string(), equals: z.union([z.boolean(), z.string(), z.number()]) });
const itemSchema = z.object({
  code: z.string().regex(/^[a-z0-9_]+$/),
  category: z.string(),
  label: z.string().min(2),
  unit: z.enum(["por_pessoa", "por_hora", "unidade", "pacote"]),
  mandatory: z.boolean(),
  when: z.array(conditionSchema).optional(),
});

/** Integridade do catálogo: códigos únicos e condições apontando para perguntas/opções reais. */
export function validateCatalog(): string[] {
  const errors: string[] = [];
  const qById = new Map(QUESTIONS.map((q) => [q.id, q]));
  if (qById.size !== QUESTIONS.length) errors.push("ids de pergunta duplicados");
  const codes = new Set(ITEMS.map((i) => i.code));
  if (codes.size !== ITEMS.length) errors.push("códigos de item duplicados");

  const checkCond = (where: string, c: Condition) => {
    const q = qById.get(c.question);
    if (q === undefined) return errors.push(`${where}: pergunta inexistente ${c.question}`);
    if (q.kind === "boolean" && typeof c.equals !== "boolean") errors.push(`${where}: tipo inválido`);
    if (q.kind === "single" && !q.options.some((o) => o.value === c.equals)) errors.push(`${where}: opção inexistente`);
    if (q.kind === "number" && typeof c.equals !== "number") errors.push(`${where}: tipo inválido`);
    return undefined;
  };
  for (const item of ITEMS) {
    if (!itemSchema.safeParse(item).success) errors.push(`item inválido ${item.code}`);
    if (!item.mandatory && item.when === undefined) errors.push(`${item.code}: opcional sem condição`);
    item.when?.forEach((c) => checkCond(item.code, c));
    if (item.quantity.kind === "answer" && !qById.has(item.quantity.question)) errors.push(`${item.code}: quantidade sem pergunta`);
  }
  for (const q of QUESTIONS) q.showIf?.forEach((c) => checkCond(q.id, c));
  for (const [type, overrides] of Object.entries(DEFAULT_OVERRIDES)) {
    for (const [id, value] of Object.entries(overrides ?? {})) {
      const q = qById.get(id);
      if (q === undefined) errors.push(`override ${type}.${id} inexistente`);
      else if (!questionValueSchema(q).safeParse(value).success) errors.push(`override ${type}.${id} inválido`);
    }
  }
  return errors;
}
