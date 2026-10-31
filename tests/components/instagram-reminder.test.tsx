// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { InstagramReminderBanner } from "@/components/domain/instagram-reminder";

const DISMISS_KEY = "ev_instagram_reminder_dismissed";

beforeEach(() => {
  localStorage.clear();
});

afterEach(cleanup);

describe("InstagramReminderBanner (painel)", () => {
  it("é dispensável: some e grava a flag no localStorage", () => {
    render(<InstagramReminderBanner />);

    expect(screen.getByText("Fale com a gente no Instagram")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dispensar lembrete do Instagram" }));

    expect(screen.queryByText("Fale com a gente no Instagram")).toBeNull();
    expect(localStorage.getItem(DISMISS_KEY)).toBe("1");
  });

  it("não reaparece quando já foi dispensado", () => {
    localStorage.setItem(DISMISS_KEY, "1");
    render(<InstagramReminderBanner />);

    expect(screen.queryByText("Fale com a gente no Instagram")).toBeNull();
  });
});
