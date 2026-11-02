import "server-only";

import { serverEnv } from "@/lib/env";
import { sendInstagramText, sendMessengerText } from "@/lib/meta/client";
import { instagramSendTarget, messengerAccessToken } from "@/lib/meta/page-token";

import type { ChatSendFn } from "./chat";

/** Envio real do relay: Instagram DM ou Messenger, somente dentro da janela (send-guard). */
export const sendChatToSupplier: ChatSendFn = async ({ channel, recipientId, text }) => {
  const env = serverEnv();
  const result =
    channel === "messenger"
      ? await sendMessengerText({
          accessToken: messengerAccessToken(env),
          pageId: env.META_PAGE_ID ?? "",
          recipientId,
          text,
        })
      : await sendInstagramText({
          ...instagramSendTarget(env),
          recipientId,
          text,
        });

  return result.ok ? { ok: true, messageId: result.messageId } : { ok: false, error: result.error };
};
