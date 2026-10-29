import { describe, expect, it } from "vitest";

import {
  INSTAGRAM_HANDLE,
  instagramDmUrl,
  instagramProfileUrl,
  socialContactUrl,
  SOCIAL_FIRST_CONTACT,
} from "@/lib/social/contact";

describe("contato por redes sociais", () => {
  it("Instagram vira deep link de DM", () => {
    expect(socialContactUrl("https://www.instagram.com/buffet_da_ana/")).toEqual({
      platform: "instagram",
      label: "Instagram DM",
      url: "https://ig.me/m/buffet_da_ana",
    });
  });

  it("Facebook devolve o próprio perfil", () => {
    expect(socialContactUrl("https://www.facebook.com/BuffetDaAna")).toEqual({
      platform: "facebook",
      label: "Facebook",
      url: "https://www.facebook.com/BuffetDaAna",
    });
  });

  it("TikTok normaliza o @handle", () => {
    expect(socialContactUrl("https://www.tiktok.com/@buffet_da_ana")).toEqual({
      platform: "tiktok",
      label: "TikTok",
      url: "https://www.tiktok.com/@buffet_da_ana",
    });
  });

  it("rejeita URL que não é perfil social", () => {
    expect(socialContactUrl("https://eventeia.com.br")).toBeNull();
    expect(socialContactUrl("")).toBeNull();
    expect(socialContactUrl("https://www.instagram.com/p/123/")).toBeNull();
  });
});

describe("mensagem pré-preenchida no Instagram", () => {
  it("inclui ?text= quando há mensagem", () => {
    const c = socialContactUrl("https://www.instagram.com/buffet_da_ana/", "Olá!");
    expect(c?.url).toBe("https://ig.me/m/buffet_da_ana?text=Ol%C3%A1!");
  });

  it("não inclui query quando a mensagem é vazia", () => {
    expect(socialContactUrl("https://www.instagram.com/buffet_da_ana/", "")?.url).toBe(
      "https://ig.me/m/buffet_da_ana",
    );
  });

  it("documenta a copy padrão de primeiro contato", () => {
    expect(SOCIAL_FIRST_CONTACT).toContain("EventeIA");
  });
});

describe("perfil oficial da EventeIA (cadastro)", () => {
  it("gera o link de seguir e o deep link de DM", () => {
    expect(instagramProfileUrl()).toBe("https://www.instagram.com/eventeia");
    expect(instagramDmUrl()).toBe("https://ig.me/m/eventeia");
    expect(instagramDmUrl("eventeia", "Olá!")).toBe("https://ig.me/m/eventeia?text=Ol%C3%A1!");
  });

  it("normaliza handle com @", () => {
    expect(instagramProfileUrl("@eventeia")).toBe("https://www.instagram.com/eventeia");
    expect(instagramDmUrl("@eventeia")).toBe("https://ig.me/m/eventeia");
  });

  it("expõe o handle usado no passo de cadastro", () => {
    expect(INSTAGRAM_HANDLE).toBe("eventeia");
  });
});
