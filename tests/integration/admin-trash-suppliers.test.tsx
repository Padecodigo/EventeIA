// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { memDb, type Row } from "../unit/helpers/mem-db";

/** Integração: depoimentos (regressão do chip), fornecedores (excluir), lixeira (esvaziar/definitivo). */
let tables: Record<string, Row[]> = {};
let db = memDb(tables);
const removed: string[][] = [];
// jsdom não implementa <dialog>.showModal/close.
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); } }));
vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn(() => Promise.resolve({ id: "admin1", email: "a@x" })) }));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: (t: string) => db.from(t), storage: { from: () => ({ remove: (f: string[]) => (removed.push(f), Promise.resolve({ error: null })) }) } }),
}));

const { default: Depoimentos } = await import("@/app/admin/depoimentos/page");
const { default: Fornecedores } = await import("@/app/admin/fornecedores/page");
const { default: Fornecedor } = await import("@/app/admin/fornecedores/[id]/page");
const { default: Lixeira } = await import("@/app/admin/lixeira/page");
const { default: ArquivoMorto } = await import("@/app/admin/lixeira/arquivo-morto/page");
const { GET: arquivoCsv } = await import("@/app/admin/lixeira/arquivo-morto/csv/route");
const { ADMIN_NAV } = await import("@/lib/admin/nav");
const { purgeAction, restoreAction } = await import("@/app/admin/lixeira/actions");
const { deleteSupplierAction } = await import("@/app/admin/fornecedores/actions");

const S1 = "00000000-0000-4000-8000-000000000001";
const S2 = "00000000-0000-4000-8000-000000000002";
const sup = (id: string, name: string, deleted_at: string | null) => ({ id, name, category: "buffet", city: "Taubaté", phone_e164: null, whatsapp_verified: null, opt_out_at: null, last_contacted_at: null, first_seen_at: "2026-10-01", source_provider: "osm", website_url: null, deleted_at });
const fd = (o: Record<string, string | string[]>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x); return f; };

beforeEach(() => {
  tables = { suppliers: [sup(S1, "Buffet Ativo", null), sup(S2, "Buffet Velho", "2026-10-20T00:00:00Z")], vendor_prospects: [], cost_entries: [{ id: "00000000-0000-4000-8000-0000000000c1", provider: "vps", kind: "fixed", note: null, cost_brl_cents: 100, occurred_at: "2026-10-01", deleted_at: "2026-10-20" }], llm_usage_events: [], finance_alerts: [], support_tickets: [], testimonials: [] };
  db = memDb(tables);
  removed.length = 0;
});
afterEach(cleanup);

describe("depoimentos: subtítulo (regressão do chip /para-planners)", () => {
  it("mostra link normal para /para-planners sem <code>", async () => {
    const { container } = render(await Depoimentos());
    const link = screen.getByTestId("link-para-planners");
    expect(link).toHaveAttribute("href", "/para-planners");
    expect(link.className).toContain("whitespace-nowrap");
    expect(container.querySelector("code")).toBeNull();
  });
});

describe("fornecedores: excluir (soft delete)", () => {
  it("lista oculta excluídos e o detalhe oferece 'Excluir fornecedor'", async () => {
    render(await Fornecedores({ searchParams: Promise.resolve({}) }));
    // A lista agora também renderiza o diálogo de exclusão (com o nome do
    // fornecedor), então o alvo é o link da tabela, não qualquer texto igual.
    expect(screen.getByRole("link", { name: "Buffet Ativo" })).toBeInTheDocument();
    expect(screen.queryByText("Buffet Velho")).toBeNull();
    cleanup();
    render(await Fornecedor({ params: Promise.resolve({ id: S1 }) }));
    fireEvent.click(screen.getByTestId("supplier-delete"));
    expect(screen.getByText("Excluir este fornecedor?")).toBeInTheDocument();
  });

  it("ação marca deleted_at e o item aparece na Lixeira; restaurar devolve", async () => {
    expect(await deleteSupplierAction(null, fd({ supplierId: S1 }))).toEqual({ ok: true });
    expect(tables.suppliers[0]).toMatchObject({ deleted_by: "admin1" });
    render(await Lixeira());
    expect(screen.getByTestId("lixeira-fornecedores")).toHaveTextContent("Buffet Ativo");
    await restoreAction(fd({ kind: "fornecedores", id: S1 }));
    expect(tables.suppliers[0].deleted_at).toBeNull();
  });
});

describe("lixeira: exclusão definitiva", () => {
  it("botões com confirmação digitada e aviso de permanente; botão Arquivo morto dentro da lixeira", async () => {
    render(await Lixeira());
    expect(screen.getByTestId("lixeira-arquivo-morto")).toHaveAttribute("href", "/admin/lixeira/arquivo-morto");
    fireEvent.click(screen.getByTestId("lixeira-esvaziar"));
    expect(screen.getAllByText(/Esta ação é permanente/).length).toBeGreaterThan(0);
    const confirm = screen.getByTestId("lixeira-esvaziar-confirm");
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getAllByLabelText(/Digite EXCLUIR/)[0], { target: { value: "EXCLUIR" } });
    expect(confirm).toBeEnabled();
    expect(screen.getByTestId(`purge-fornecedores-${S2}`)).toBeInTheDocument();
  });

  it("sem a palavra EXCLUIR nada é apagado", async () => {
    const r = await purgeAction(null, fd({ kind: "all", confirm: "sim" }));
    expect(r?.ok).toBe(false);
    expect(tables.suppliers).toHaveLength(2);
  });

  it("Esvaziar deixa a lixeira VAZIA: apaga soltos, arquiva custos, anonimiza fornecedor referenciado", async () => {
    const S3 = "00000000-0000-4000-8000-000000000003";
    tables.suppliers.push({ ...sup(S3, "Buffet Contatado", "2026-10-20T00:00:00Z"), phone_e164: "+5512999990000", contact_email: "x@y.com", website_url: "https://b.com", source_url: "https://src", external_id: "e1" });
    tables.prospect_conversations = [{ id: "pc1", supplier_id: S3 }];
    tables.support_tickets.push({ id: "00000000-0000-4000-8000-0000000000t1", deleted_at: "2026-10-21", attachment_path: "u/a.png" });
    const r = await purgeAction(null, fd({ kind: "all", confirm: "EXCLUIR" }));
    expect(r?.ok).toBe(true);
    expect(r?.message).toMatch(/2 itens apagados/);
    expect(r?.message).toMatch(/1 custo movido para o Arquivo morto/);
    expect(r?.message).toMatch(/1 fornecedor anonimizado/);
    expect(tables.suppliers.map((s) => s.id)).toEqual([S1, S3]);
    expect(tables.suppliers[1]).toMatchObject({ name: "Fornecedor removido", phone_e164: null, contact_email: null, website_url: null, external_id: null });
    expect(tables.suppliers[1].anonymized_at).toBeTruthy();
    expect(tables.cost_entries[0].archived_at).toBeTruthy();
    expect(tables.cost_entries[0].archived_by).toBe("admin1");
    expect(removed).toEqual([["u/a.png"]]);
    cleanup();
    render(await Lixeira());
    for (const k of ["custos", "fornecedores", "chamados"]) expect(screen.getByTestId(`lixeira-${k}`)).toHaveTextContent("Nada na lixeira.");
    expect(screen.queryByTestId("lixeira-esvaziar")).toBeNull();
    // restaurar não traz de volta itens arquivados/anonimizados
    await restoreAction(fd({ kind: "custos", id: "00000000-0000-4000-8000-0000000000c1" }));
    expect(tables.cost_entries[0].deleted_at).not.toBeNull();
    await restoreAction(fd({ kind: "fornecedores", id: S3 }));
    expect(tables.suppliers[1].deleted_at).not.toBeNull();
  });

  it("Arquivo morto: lista somente leitura com data de retenção (5 anos) e CSV fiscal", async () => {
    tables.cost_entries[0] = { ...tables.cost_entries[0], reason: "vps", quantity: 1, cost_micro_usd: 0, event_id: null, occurred_at: "2026-10-01T00:00:00.000Z", archived_at: "2026-10-31T20:00:00.000Z" };
    render(await ArquivoMorto());
    const card = screen.getByTestId("arquivo-custos");
    expect(card).toHaveTextContent("Custos arquivados (1)");
    expect(card).toHaveTextContent("2031");
    expect(screen.getByTestId("arquivo-csv")).toHaveAttribute("href", "/admin/lixeira/arquivo-morto/csv");
    expect(screen.queryByRole("button")).toBeNull(); // sem restaurar/excluir
    const res = await arquivoCsv();
    const text = await res.text();
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(text.split("\n")[0]).toContain("guardar_ate_utc");
    expect(text).toContain("2031-10-31T20:00:00.000Z");
  });

  it("Arquivo morto não ganha aba nova no menu do admin", () => {
    expect(JSON.stringify(ADMIN_NAV)).not.toContain("arquivo-morto");
    expect(ADMIN_NAV.some((n) => n.href === "/admin/lixeira")).toBe(true);
  });

  it("Excluir definitivamente um item ativo (fora da lixeira) não faz nada", async () => {
    await purgeAction(null, fd({ kind: "fornecedores", id: S1, confirm: "EXCLUIR" }));
    expect(tables.suppliers.map((s) => s.id)).toContain(S1);
  });
});
