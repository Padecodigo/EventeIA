import { describe, expect, it } from "vitest";

import { parseAnswers, partyHours, resolveRequirements } from "@/lib/catalog/rules";
import { addHours, durationHours, formatSchedule } from "@/lib/catalog/time";

describe("horário da festa", () => {
  it("calcula duração no mesmo dia e na virada", () => {
    expect(durationHours("18:00", "23:00")).toBe(5);
    expect(durationHours("22:00", "03:00")).toBe(5);
    expect(durationHours("23:30", "00:15")).toBe(0.75);
    expect(durationHours("20:00", "20:00")).toBeNull();
    expect(durationHours("24:00", "02:00")).toBeNull();
  });

  it("formata para resumo", () => {
    expect(formatSchedule("14:00", "18:00")).toBe("das 14:00 às 18:00 (4h)");
    expect(formatSchedule("22:00", "03:30")).toBe("das 22:00 às 03:30 (5,5h, termina no dia seguinte)");
    expect(addHours("20:00", 6)).toBe("02:00");
  });

  it("deriva duracao_horas (arredonda p/ cima) e rejeita fim = início", () => {
    const ok = parseAnswers("casamento", { horario_inicio: "21:00", horario_fim: "02:30" });
    expect(ok.success && ok.data.duracao_horas).toBe(6);
    expect(parseAnswers("casamento", { horario_inicio: "21:00", horario_fim: "21:00" }).success).toBe(false);
    expect(parseAnswers("casamento", { horario_inicio: "08:00", horario_fim: "07:00" }).success).toBe(false);
  });

  it("itens por hora usam início/fim (inclui virada)", () => {
    const a = parseAnswers("casamento", { horario_inicio: "22:00", horario_fim: "04:00", foto: "foto" });
    if (!a.success) throw new Error(a.error);
    const foto = resolveRequirements("casamento", 100, a.data).find((r) => r.itemCode === "fotografia");
    expect(foto?.quantity).toBe(6);
  });

  it("regressão: evento antigo só com duracao_horas mantém a duração", () => {
    const a = parseAnswers("casamento", { duracao_horas: 7, foto: "foto" });
    if (!a.success) throw new Error(a.error);
    expect(a.data.horario_inicio).toBe("18:00");
    expect(a.data.horario_fim).toBe("01:00");
    expect(a.data.duracao_horas).toBe(7);
    expect(partyHours({ duracao_horas: 4 })).toBe(4);
  });
});
