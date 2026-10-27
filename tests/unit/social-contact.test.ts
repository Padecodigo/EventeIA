import { describe, expect, it } from "vitest";

import { socialContactUrl } from "@/lib/social/contact";

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
