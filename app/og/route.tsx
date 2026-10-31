import { ImageResponse } from "next/og";

import { PALETTE } from "@/lib/design/palette";

export const revalidate = 86400;

/** Imagem de compartilhamento 1200x630 (Instagram, Facebook, X, LinkedIn). */
export function GET(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: `linear-gradient(135deg, ${PALETTE.champagneClaro} 0%, ${PALETTE.areiaSecundaria} 100%)`,
          color: PALETTE.ink,
        }}
      >
        <div style={{ fontSize: 34, letterSpacing: 6, color: PALETTE.coralEscuro, fontWeight: 700 }}>EVENTEIA</div>
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, marginTop: 24, maxWidth: 980 }}>
          Você conta como é seu evento.
        </div>
        <div style={{ fontSize: 34, marginTop: 28, maxWidth: 1000, color: PALETTE.ink }}>
          A gente encontra os fornecedores, compara os preços e entrega o orçamento pronto.
        </div>
        <div style={{ fontSize: 28, marginTop: 40, color: PALETTE.coralEscuro }}>
          Vale do Paraíba · São Paulo
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
