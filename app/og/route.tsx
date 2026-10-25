import { ImageResponse } from "next/og";

export const revalidate = 86400;

/** Imagem de compartilhamento 1200x630 (WhatsApp, Instagram, Facebook, X, LinkedIn). */
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
          background: "linear-gradient(135deg, #F6EEE6 0%, #EFD9CF 100%)",
          color: "#3B2420",
        }}
      >
        <div style={{ fontSize: 34, letterSpacing: 6, color: "#A3485A", fontWeight: 700 }}>EVENTEIA</div>
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, marginTop: 24, maxWidth: 980 }}>
          Orçamento de festa sem dor de cabeça.
        </div>
        <div style={{ fontSize: 34, marginTop: 28, maxWidth: 1000, color: "#5A3A34" }}>
          Cotamos fornecedores pelo WhatsApp e entregamos 3 opções: preço, custo-benefício e comodidade.
        </div>
        <div style={{ fontSize: 28, marginTop: 40, color: "#A3485A" }}>
          Vale do Paraíba · São Paulo
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
