import Image from "next/image";

/**
 * Colagem do hero — fotos lado a lado em colunas (masonry), cada uma na sua
 * proporção natural, sem cortes, sem sobreposição e sem zoom no hover.
 * Festa infantil em destaque (maior público), mas todos os tipos de evento presentes.
 * Créditos das fotos novas em public/img/eventos/CREDITOS.md.
 */
export const MOSAIC = [
  {
    src: "/img/eventos/festa-infantil-velas.jpg",
    alt: "Crianças sorrindo enquanto apagam as velinhas de um bolo de aniversário",
    label: "Festa infantil",
    w: 834,
    h: 1250,
  },
  {
    src: "/img/eventos/casamento.jpg",
    alt: "Noivos rindo juntos na pista de dança, cercados pelos convidados",
    label: "Casamento",
    w: 1000,
    h: 667,
  },
  {
    src: "/img/eventos/15-anos.jpg",
    alt: "Debutante com vestido bordado segurando um buquê",
    label: "15 anos",
    w: 1000,
    h: 1250,
  },
  {
    src: "/img/eventos/festa-formatura-baile.jpg",
    alt: "Formandos de beca e capelo dançando e rindo sob uma chuva de confete dourado",
    label: "Formatura",
    w: 1000,
    h: 667,
  },
  {
    src: "/festa-infantil.jpg",
    alt: "Mesa de festa decorada com arco de balões, bolo e doces",
    label: "Aniversário",
    w: 1280,
    h: 1075,
  },
  {
    src: "/img/eventos/corporativo.webp",
    alt: "Plateia lotada em um auditório durante um evento corporativo",
    label: "Corporativo",
    w: 800,
    h: 1000,
  },
] as const;

/**
 * Colunas empilhadas sem posicionamento absoluto: nenhuma foto cobre outra e
 * cada imagem mantém a proporção do arquivo original (largura/altura reais).
 */
export function HeroMosaic() {
  return (
    <div className="columns-2 gap-3 sm:columns-3 sm:gap-4" aria-label="Momentos de festa">
      {MOSAIC.map((photo, index) => (
        <figure
          key={photo.src}
          className="mb-3 break-inside-avoid rounded-2xl bg-white p-2 shadow-[0_14px_36px_-18px_rgba(42,26,29,0.4)] ring-1 ring-black/5 sm:mb-4"
        >
          <Image
            src={photo.src}
            alt={photo.alt}
            width={photo.w}
            height={photo.h}
            priority={index === 0}
            quality={70}
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 250px"
            className="h-auto w-full rounded-xl object-contain"
          />
          <figcaption className="pt-2 text-center font-display text-sm italic font-medium leading-6 text-vinho/80">
            {photo.label}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
