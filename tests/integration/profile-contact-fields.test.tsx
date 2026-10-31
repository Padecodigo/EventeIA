// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { memDb, type Row } from "../unit/helpers/mem-db";

let tables: Record<string, Row[]> = {};
let db = memDb(tables);

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(() => Promise.resolve({ id: "admin1", email: "a@x" })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: (t: string) => db.from(t) }),
}));

const AdminCliente = (await import("@/app/admin/clientes/[id]/page")).default;
const PrivacyPage = (await import("@/app/(marketing)/privacidade/page")).default;

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const profile = (id: string) => ({
  id,
  display_name: "Ana Anfitriã",
  email: "ana@eventeia.com",
  phone_e164: "+5511988887777",
  contact_whatsapp_e164: "+5511999998888",
  instagram_handle: "ana.anfitria",
  role: "b2c",
  document_type: "cpf",
  created_at: "2026-10-01T00:00:00Z",
});

beforeEach(() => {
  tables = { profiles: [profile(ID)], events: [], payments: [], support_tickets: [] };
  db = memDb(tables);
});
afterEach(cleanup);

describe("tela de cliente no admin exibe contatos opcionais", () => {
  it("mostra WhatsApp e Instagram (@) do cliente", async () => {
    render(await AdminCliente({ params: Promise.resolve({ id: ID }) }));
    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("+5511999998888")).toBeInTheDocument();
    expect(screen.getByText("Instagram")).toBeInTheDocument();
    expect(screen.getByText("@ana.anfitria")).toBeInTheDocument();
  });
});

describe("política de privacidade menciona contatos opcionais", () => {
  it("cita WhatsApp e Instagram como dados coletados", () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/número de WhatsApp e o @ de Instagram/)).toBeInTheDocument();
  });
});
