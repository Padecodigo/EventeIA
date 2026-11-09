import "server-only";

import { serverEnv } from "@/lib/env";

/**
 * Chave do provedor de imagem ATIVO (nvidia ou modelslab) para o caminho de
 * prospecção (posts de isca). Evita puxar as dependências pesadas de sharp e
 * Supabase só para resolver a credencial.
 */
export function activeImageApiKey(): string | undefined {
  const env = serverEnv();
  return env.IMAGE_PROVIDER === "nvidia" ? env.NVIDIA_NIM_API_KEY : env.MODELSLAB_API_KEY;
}
