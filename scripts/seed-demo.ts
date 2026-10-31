/**
 * Seed de demonstração do MVP (ambiente local).
 *
 * Cria:
 * - ana@eventeia.com   (anfitriã B2C, com evento ativo + cotações + histórico)
 * - admin@eventeia.com (moderador, vê /admin/depoimentos)
 *
 * Senhas vêm de DEMO_SEED_PASSWORD e DEMO_SEED_ADMIN_PASSWORD no .env.local.
 *
 * Uso: pnpm demo:seed (com .env.local apontando para o Supabase local)
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../lib/supabase/types";

import { readSeedPasswords } from "./seed-demo-env";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (url === undefined || serviceRoleKey === undefined) {
  console.error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.");
  process.exit(1);
}

const admin = createClient<Database>(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { demoPassword: DEMO_PASSWORD, adminPassword: ADMIN_PASSWORD } = (() => {
  try {
    return readSeedPasswords(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
})();

interface DemoUser {
  id: string;
  email: string;
}

async function ensureUser(
  email: string,
  password: string,
  fullName: string,
): Promise<DemoUser> {
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const found = existing.users.find((user) => user.email === email);

  if (found !== undefined) {
    return { id: found.id, email };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error !== null || data.user === null) {
    throw new Error(`falha ao criar ${email}: ${error?.message ?? "sem usuário"}`);
  }

  return { id: data.user.id, email };
}

function daysFromToday(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

async function upsertProfile(
  user: DemoUser,
  input: {
    displayName: string;
    role: "b2c" | "b2b" | "admin";
    phone: string;
    cpf: string;
  },
): Promise<void> {
  const { error } = await admin
    .from("profiles")
    .update({
      display_name: input.displayName,
      role: input.role,
      phone_e164: input.phone,
      document_type: "cpf",
      document_number: input.cpf,
    })
    .eq("id", user.id);

  if (error !== null) {
    throw new Error(`falha ao atualizar perfil: ${error.message}`);
  }
}

async function seedAna(ana: DemoUser): Promise<void> {
  const { data: existing } = await admin
    .from("events")
    .select("id,title")
    .eq("owner_profile_id", ana.id)
    .eq("title", "Festa de 5 anos da Lia")
    .maybeSingle();

  if (existing !== null) {
    console.log("Ana já possui evento demo — seed de eventos ignorado.");
    return;
  }

  const eventId = randomUUID();
  const completedEventId = randomUUID();
  const paymentId = randomUUID();
  const completedPaymentId = randomUUID();

  await admin.from("events").insert({
    id: eventId,
    owner_profile_id: ana.id,
    title: "Festa de 5 anos da Lia",
    event_type: "festa_infantil",
    event_date: daysFromToday(30),
    region_code: "sp",
    guest_count: 60,
    status: "active",
  });

  await admin.from("payments").insert({
    id: paymentId,
    profile_id: ana.id,
    purpose: "event_ticket",
    event_id: eventId,
    asaas_payment_id: `demo_pay_${randomUUID()}`,
    billing_type: "PIX",
    amount_cents: 9700,
    status: "paid",
    confirmed_at: new Date().toISOString(),
  });

  await admin.from("event_tickets").insert({
    event_id: eventId,
    status: "active",
    payment_id: paymentId,
    activated_at: new Date().toISOString(),
  });

  await admin.from("quotations").insert([
    {
      event_id: eventId,
      category: "buffet",
      vendor_name: "Buffet da Vila",
      vendor_contact: "11 98888-1111",
      amount_cents: 420000,
      status: "sent",
      engine_version: "1.1.0",
    },
    {
      event_id: eventId,
      category: "decoracao",
      vendor_name: "Ateliê Flor de Lis",
      vendor_contact: "11 97777-2222",
      amount_cents: 210000,
      status: "sent",
      engine_version: "1.1.0",
    },
    {
      event_id: eventId,
      category: "fotografia",
      vendor_name: "Estúdio Luz",
      vendor_contact: "11 96666-3333",
      amount_cents: 190000,
      status: "draft",
      engine_version: "1.1.0",
    },
  ]);

  await admin.from("events").insert({
    id: completedEventId,
    owner_profile_id: ana.id,
    title: "Festa de 1 aninho do Theo",
    event_type: "festa_infantil",
    event_date: daysFromToday(-10),
    region_code: "sp",
    guest_count: 40,
    status: "completed",
  });

  await admin.from("payments").insert({
    id: completedPaymentId,
    profile_id: ana.id,
    purpose: "event_ticket",
    event_id: completedEventId,
    asaas_payment_id: `demo_pay_${randomUUID()}`,
    billing_type: "PIX",
    amount_cents: 9700,
    status: "paid",
    confirmed_at: new Date(Date.now() - 20 * 86_400_000).toISOString(),
  });

  await admin.from("event_tickets").insert({
    event_id: completedEventId,
    status: "active",
    payment_id: completedPaymentId,
    activated_at: new Date(Date.now() - 20 * 86_400_000).toISOString(),
  });

  const inviteToken = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const { data: invite } = await admin
    .from("testimonial_invites")
    .insert({
      event_id: completedEventId,
      profile_id: ana.id,
      token: inviteToken,
      expires_at: new Date(Date.now() + 15 * 86_400_000).toISOString(),
    })
    .select("id")
    .maybeSingle();

  await admin.from("testimonials").insert({
    invite_id: invite?.id ?? null,
    profile_id: ana.id,
    event_id: completedEventId,
    author_name: "Ana Souza",
    city: "São José dos Campos, SP",
    event_context: "festa_infantil · 40 convidados",
    audience: "b2c",
    quote:
      "Consegui organizar a festa do Theo sem virar noites em planilhas. As propostas chegaram organizadas e eu só precisei escolher com calma.",
    outcome: "3 propostas em 48 horas",
    consent_given: true,
    consent_text_version: "2026-10-v2",
    status: "pending",
    published: false,
  });

  const now = Date.now();
  const history = [
    {
      type: "event.created",
      occurred_at: new Date(now - 12 * 86_400_000).toISOString(),
      actor_type: "user" as const,
      aggregate_type: "event",
      aggregate_id: eventId,
      payload: { event_type: "festa_infantil" },
      correlation_id: eventId,
      source: "app" as const,
    },
    {
      type: "payment.confirmed",
      occurred_at: new Date(now - 12 * 86_400_000 + 3_600_000).toISOString(),
      actor_type: "webhook" as const,
      aggregate_type: "payment",
      aggregate_id: paymentId,
      payload: { amount_cents: 9700, billing_type: "PIX" },
      correlation_id: paymentId,
      source: "webhook" as const,
    },
    {
      type: "event.activated",
      occurred_at: new Date(now - 12 * 86_400_000 + 3_700_000).toISOString(),
      actor_type: "webhook" as const,
      aggregate_type: "event",
      aggregate_id: eventId,
      payload: {},
      correlation_id: paymentId,
      source: "webhook" as const,
    },
    {
      type: "quotation.created",
      occurred_at: new Date(now - 2 * 86_400_000).toISOString(),
      actor_type: "user" as const,
      aggregate_type: "event",
      aggregate_id: eventId,
      payload: { quotations: 3 },
      correlation_id: eventId,
      source: "app" as const,
    },
    {
      type: "quotation.dispatched",
      occurred_at: new Date(now - 1 * 86_400_000).toISOString(),
      actor_type: "user" as const,
      aggregate_type: "event",
      aggregate_id: eventId,
      payload: { quotations: 3 },
      correlation_id: eventId,
      source: "app" as const,
    },
  ];

  await admin.from("system_events").insert(
    history.map((item) => ({
      ...item,
      actor_id: item.actor_type === "user" ? ana.id : null,
    })),
  );

  console.log(`Evento demo de Ana criado (${eventId}).`);
  console.log(`Convite de depoimento demo: /depoimento?token=${inviteToken}`);
}

async function main(): Promise<void> {
  const ana = await ensureUser("ana@eventeia.com", DEMO_PASSWORD, "Ana Souza");
  const adminUser = await ensureUser("admin@eventeia.com", ADMIN_PASSWORD, "Admin EventeIA");

  await upsertProfile(ana, {
    displayName: "Ana Souza",
    role: "b2c",
    phone: "+5511999990001",
    cpf: "11144477735",
  });

  await upsertProfile(adminUser, {
    displayName: "Admin EventeIA",
    role: "admin",
    phone: "+5511999990002",
    cpf: "52998224725",
  });

  await seedAna(ana);

  console.log("");
  console.log("Credenciais de demonstração:");
  console.log(`  Anfitriã: ana@eventeia.com / ${DEMO_PASSWORD}`);
  console.log(`  Admin:    admin@eventeia.com / ${ADMIN_PASSWORD}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
