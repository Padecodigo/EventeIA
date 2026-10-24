/**
 * Publica um depoimento aprovado na vitrine (moderação humana).
 *
 * Uso: pnpm testimonials:publish <testimonial_id>
 * Requer SUPABASE_SERVICE_ROLE_KEY no .env.local (server-only).
 */
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../lib/supabase/types";

const testimonialId = process.argv[2];

if (testimonialId === undefined) {
  console.error("Uso: pnpm testimonials:publish <testimonial_id>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (url === undefined || serviceRoleKey === undefined) {
  console.error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.");
  process.exit(1);
}

const admin = createClient<Database>(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await admin
  .from("testimonials")
  .update({
    status: "approved",
    published: true,
    published_at: new Date().toISOString(),
  })
  .eq("id", testimonialId)
  .select("id,author_name,status,published")
  .maybeSingle();

if (error !== null) {
  console.error(`Falha ao publicar: ${error.message}`);
  process.exit(1);
}

if (data === null) {
  console.error("Depoimento não encontrado.");
  process.exit(1);
}

console.log(
  `Publicado: ${data.author_name} (${data.id}) — status=${data.status}, published=${String(data.published)}`,
);
console.log("A vitrine (/, /para-planners) revalida em até 60 segundos.");
