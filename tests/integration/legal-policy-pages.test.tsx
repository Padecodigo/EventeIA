// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import RefundPage, { metadata as refundMeta } from "@/app/(marketing)/estorno/page";
import PrivacyPage from "@/app/(marketing)/privacidade/page";
import RetentionPage, { metadata as retentionMeta } from "@/app/(marketing)/retencao-de-dados/page";
import DataDeletionPage, { metadata as deletionMeta } from "@/app/(marketing)/exclusao-de-dados/page";
import TermsPage from "@/app/(marketing)/termos/page";
import { SiteFooter } from "@/components/site-footer";

afterEach(cleanup);

describe("páginas legais renderizadas", () => {
  it("/estorno renderiza título e seção de disputas", () => {
    render(<RefundPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Política de Estorno e Disputa de Pagamento" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Disputas de pagamento/)).toBeInTheDocument();
    expect(refundMeta.alternates?.canonical).toContain("/estorno");
  });

  it("/retencao-de-dados renderiza título e prazos", () => {
    render(<RetentionPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Política de Retenção de Dados" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/90 dias após a data do evento/)).toBeInTheDocument();
    expect(retentionMeta.alternates?.canonical).toContain("/retencao-de-dados");
  });

  it("/exclusao-de-dados explica como pedir exclusão (Meta App Review)", () => {
    render(<DataDeletionPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Instruções de Exclusão de Dados" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/EXCLUIR MEUS DADOS/)).toBeInTheDocument();
    expect(screen.getByText(/Apps e sites > EventeIA > Remover/)).toBeInTheDocument();
    expect(deletionMeta.alternates?.canonical).toContain("/exclusao-de-dados");
  });

  it("Termos e Privacidade fazem referência cruzada", () => {
    render(<TermsPage />);
    expect(screen.getByText(/\/estorno/)).toBeInTheDocument();
    cleanup();
    render(<PrivacyPage />);
    expect(screen.getByText(/\/retencao-de-dados/)).toBeInTheDocument();
  });

  it("rodapé tem os 5 links legais", () => {
    render(<SiteFooter />);
    const links: [string, string][] = [
      ["Termos de Uso", "/termos"],
      ["Privacidade e LGPD", "/privacidade"],
      ["Política de Estorno", "/estorno"],
      ["Retenção de Dados", "/retencao-de-dados"],
      ["Exclusão de Dados", "/exclusao-de-dados"],
    ];
    for (const [name, href] of links) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });
});
