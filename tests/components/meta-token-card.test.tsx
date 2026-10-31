// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MetaTokenCard } from "@/components/admin/meta-token-card";

afterEach(cleanup);

describe("cartão Token Meta (painel de custos)", () => {
  it("sem verificação registrada mostra placeholder", () => {
    render(<MetaTokenCard status={null} />);
    expect(screen.getByText("Token Meta")).toBeInTheDocument();
    expect(screen.getByText(/Nenhuma verificação registrada/)).toBeInTheDocument();
  });

  it("token válido: mostra status, 'nunca expira' e escopos", () => {
    render(<MetaTokenCard status={{ is_valid: true, expires_at: null, scopes: ["instagram_basic", "instagram_content_publish"], missing_scopes: [], optional_missing: [], checked_at: "2026-10-25T11:00:00Z" }} />);
    expect(screen.getByTestId("meta-token-valid")).toHaveTextContent("válido");
    expect(screen.getByText("nunca expira")).toBeInTheDocument();
    expect(screen.getByTestId("meta-token-scopes")).toHaveTextContent("instagram_basic, instagram_content_publish");
  });

  it("token inválido com escopos obrigatórios faltando (vermelho)", () => {
    render(<MetaTokenCard status={{ is_valid: false, expires_at: "2026-11-01T00:00:00Z", scopes: [], missing_scopes: ["instagram_manage_messages"], optional_missing: [], checked_at: "2026-10-25T11:00:00Z" }} />);
    expect(screen.getByTestId("meta-token-invalid")).toHaveTextContent("inválido");
    expect(screen.getByTestId("meta-token-missing")).toHaveTextContent("instagram_manage_messages");
    expect(screen.queryByTestId("meta-token-optional")).toBeNull();
  });

  it("escopos opcionais faltando aparecem em âmbar com nota do pages_manage_posts", () => {
    render(<MetaTokenCard status={{ is_valid: true, expires_at: null, scopes: [], missing_scopes: [], optional_missing: ["pages_manage_posts"], checked_at: "2026-10-25T11:00:00Z" }} />);
    expect(screen.getByTestId("meta-token-optional")).toHaveTextContent("pages_manage_posts (publicação na Página do Facebook falhará sem ele)");
  });
});
