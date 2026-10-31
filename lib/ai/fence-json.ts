/**
 * Extração tolerante de JSON devolvido por um LLM: aceita o objeto puro ou
 * envolto em fences ```json … ```. Compartilhado entre o roteador de LLM e o
 * agente de prospecção (mesma regra de parsing).
 */
export function parseFencedJson(content: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(content);
  const raw = fenced?.[1] ?? content;
  try {
    return JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as unknown;
  } catch {
    return undefined;
  }
}
