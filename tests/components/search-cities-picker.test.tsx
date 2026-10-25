// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { afterEach, describe, expect, it, vi } from "vitest";

import { SearchCitiesPicker } from "@/components/domain/search-cities-picker";

afterEach(cleanup);

const taubate = { code: 3554102, name: "Taubaté", uf: "SP" };
const jacarei = { code: 3524402, name: "Jacareí", uf: "SP" };

describe("SearchCitiesPicker", () => {
  it("mostra a cidade do evento por padrão (não removível) e as extras", () => {
    render(<SearchCitiesPicker eventCity={taubate} value={[jacarei]} onChange={() => undefined} />);
    expect(screen.getByText(/Taubaté – SP \(cidade do evento\)/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Remover Taubaté")).toBeNull();
    expect(screen.getByLabelText("Remover Jacareí")).toBeInTheDocument();
  });
  it("remove uma cidade extra", () => {
    const onChange = vi.fn();
    render(<SearchCitiesPicker eventCity={taubate} value={[jacarei]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Remover Jacareí"));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
