import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  uploadTiktokDraft: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/tiktok/draft", () => ({ uploadTiktokDraft: mocks.uploadTiktokDraft }));

import { uploadTiktokDraftAction } from "@/app/admin/tiktok/actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ id: "admin-1", email: "admin@eventeia.com" });
  mocks.uploadTiktokDraft.mockResolvedValue({ ok: true, publishId: "publish-1" });
});

describe("uploadTiktokDraftAction", () => {
  it("exige admin antes de processar o arquivo", async () => {
    const form = new FormData();
    form.set("video", new File(["video"], "draft.mp4", { type: "video/mp4" }));

    const result = await uploadTiktokDraftAction(null, form);

    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true, publishId: "publish-1" });
  });

  it("extrai somente o File do campo video", async () => {
    const video = new File(["video"], "draft.mp4", { type: "video/mp4" });
    const form = new FormData();
    form.set("video", video);

    await uploadTiktokDraftAction(null, form);

    expect(mocks.uploadTiktokDraft).toHaveBeenCalledWith(video);
  });

  it("passa null quando o campo não é um arquivo", async () => {
    const form = new FormData();
    form.set("video", "não é arquivo");

    await uploadTiktokDraftAction(null, form);

    expect(mocks.uploadTiktokDraft).toHaveBeenCalledWith(null);
  });
});
