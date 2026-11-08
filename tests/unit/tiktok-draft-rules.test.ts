import { describe, expect, it } from "vitest";

import { TIKTOK_DRAFT_MAX_BYTES, validateTiktokDraftFile } from "@/lib/tiktok/draft-rules";

describe("validateTiktokDraftFile", () => {
  it.each(["video/mp4", "video/quicktime", "video/webm", "video/mp4; codecs=avc1"])(
    "aceita %s dentro do limite",
    (type) => {
      expect(validateTiktokDraftFile({ size: 1024, type })).toEqual({
        ok: true,
        contentType: type.split(";")[0],
      });
    },
  );

  it("aceita exatamente o limite de 50 MB", () => {
    expect(validateTiktokDraftFile({ size: TIKTOK_DRAFT_MAX_BYTES, type: "video/mp4" })).toEqual({
      ok: true,
      contentType: "video/mp4",
    });
  });

  it.each([
    [null, "Selecione um vídeo."],
    [{ size: 0, type: "video/mp4" }, "Selecione um vídeo."],
    [{ size: TIKTOK_DRAFT_MAX_BYTES + 1, type: "video/mp4" }, "Vídeo acima de 50 MB."],
    [{ size: 1024, type: "image/png" }, "Envie um vídeo MP4, MOV ou WebM."],
    [{ size: 1024, type: "" }, "Envie um vídeo MP4, MOV ou WebM."],
  ])("rejeita arquivo inválido (%s)", (file, error) => {
    expect(validateTiktokDraftFile(file)).toEqual({ ok: false, error });
  });
});
