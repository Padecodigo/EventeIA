// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(dashboard)/eventos/[id]/actions", () => ({
  updateEventDetailsAction: vi.fn(async () => ({})),
}));

import { EventDetailsEditor } from "@/components/domain/event-details-editor";

afterEach(cleanup);

function renderEditor(capacity: number | null) {
  return render(
    <EventDetailsEditor
      eventId="11111111-1111-4111-8111-111111111111"
      guestCount={100}
      venueCapacity={capacity}
      venueType="chacara"
      eventStyle="rustico_chique"
    />,
  );
}

describe("EventDetailsEditor", () => {
  it("avisa quando a capacidade do local é menor que os convidados", () => {
    renderEditor(60);
    expect(screen.getByTestId("venue-capacity-warning")).toHaveTextContent(
      "O local comporta até 60 convidados; o evento tem 100.",
    );
  });

  it("some com o aviso quando a capacidade é suficiente ou vazia", () => {
    renderEditor(120);
    expect(screen.queryByTestId("venue-capacity-warning")).toBeNull();
    fireEvent.change(screen.getByLabelText("Capacidade do local"), {
      target: { value: "" },
    });
    expect(screen.queryByTestId("venue-capacity-warning")).toBeNull();
  });

  it("mostra convidados, local e estilo editáveis em pt-BR", () => {
    renderEditor(null);
    expect(screen.getByLabelText("Convidados")).toHaveValue(100);
    expect(screen.getByLabelText("Tipo de local")).toHaveValue("chacara");
    expect(screen.getByLabelText("Estilo")).toHaveValue("rustico_chique");
    expect(screen.getByRole("option", { name: "Rústico-chique" })).toBeInTheDocument();
  });
});
