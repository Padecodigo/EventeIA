import "server-only";

import { serverEnv } from "@/lib/env";

/**
 * Chave do provedor de imagem ATIVO (nvidia ou modelslab) para o caminho de
 * prospecção (posts de isca). Espelha `activeImageApiKey` de
 * `lib/marketing/autopilot-art.ts` sem puxar as dependências pesadas daquele
 * módulo (sharp/ffmpeg/Supabase).
 */
export function activeImageApiKey(): string | undefined {
  const env = serverEnv();
  return env.IMAGE_PROVIDER === "nvidia" ? env.NVIDIA_NIM_API_KEY : env.MODELSLAB_API_KEY;
}
