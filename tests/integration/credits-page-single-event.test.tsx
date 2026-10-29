// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Regressão: o painel /creditos exibia só a assinatura mensal (franquia). O evento
 * avulso precisa aparecer sempre — com ou sem assinatura, com ou sem workspace.
 */
let workspace: Record<string, unknown> | null = null;
let subscription: Record<string, unknown> | null = null;

vi.mock("@/lib/auth", () => ({
  requireUser: () => Promise.resolve({ id: "user-1", email: "a@b.com" }),
}));
vi.mock("@/app/(dashboard)/creditos/actions", () => ({
  createWorkspaceAction: vi.fn(),
  buyCreditsAction: vi.fn(),
  subscribePlanAction: vi.fn(),
  cancelSubscriptionAction: vi.fn(),
}));
vi.mock("@/components/domain/credit-slider-form", () => ({ CreditSliderForm: () => null }));
vi.mock("@/components/domain/subscribe-plan-form", () => ({ SubscribePlanForm: () => null }));
function chain(table: string) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "limit", "in", "order"]) q[m] = () => q;
  q.maybeSingle = () =>
    Promise.resolve({
      data: table === "workspaces" ? workspace : table === "subscriptions" ? subscription : null,
    });
  q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [] });
  return q;
}
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ from: chain }),
}));
vi.mock("@/lib/workspace/server", () => ({
  ensureWorkspace: () => Promise.resolve(workspace),
}));

import CreditsPage from "@/app/(dashboard)/creditos/page";

afterEach(cleanup);

async function renderPage() {
  render(await CreditsPage());
}

describe("/creditos — evento avulso para quem volta", () => {
  it("com assinatura ativa, ainda oferece evento avulso", async () => {
    workspace = { id: "ws-1", name: "Ateliê", plan_code: "atelier" };
    subscription = { plan_code: "atelier", status: "active", current_period_end: "2026-11-01" };
    await renderPage();
    expect(screen.getByRole("heading", { name: /compre avulso/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /criar evento avulso/i })).toBeInTheDocument();
    expect(screen.getByText(/Renovação automática ativa/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /cancelar renovação automática/i }),
    ).toBeInTheDocument();
  });

  it("sem assinatura, mostra planos e evento avulso", async () => {
    workspace = { id: "ws-1", name: "Ateliê", plan_code: null };
    subscription = null;
    await renderPage();
    expect(screen.getByRole("heading", { name: /compre avulso/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /assinatura mensal/i })).toBeInTheDocument();
  });

  it("sem workspace, também oferece evento avulso", async () => {
    workspace = null;
    subscription = null;
    await renderPage();
    expect(screen.getByRole("link", { name: /criar evento avulso/i })).toBeInTheDocument();
  });
});
