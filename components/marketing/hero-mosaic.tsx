import Image from "next/image";

/**
 * Colagem do hero — fotos sobrepostas estilo polaroid (pessoas, emoção, festa bonita).
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
    pos: "left-[26%] top-[1%] w-[40%] -rotate-2 z-[45]",
    ratio: "aspect-[4/5]",
  },
  {
    src: "/img/eventos/casamento.jpg",
    alt: "Noivos rindo juntos na pista de dança, cercados pelos convidados",
    label: "Casamento",
    w: 1000,
    h: 667,
    pos: "right-0 top-[3%] w-[35%] rotate-[5deg] z-20",
    ratio: "aspect-[4/3]",
  },
  {
    src: "/img/eventos/15-anos.jpg",
    alt: "Debutante com vestido bordado segurando um buquê",
    label: "15 anos",
    w: 1000,
    h: 1250,
    pos: "left-0 top-[6%] w-[27%] -rotate-[7deg] z-20",
    ratio: "aspect-[3/4]",
  },
  {
    src: "/img/eventos/festa-formatura-baile.jpg",
    alt: "Formandos de beca e capelo dançando e rindo sob uma chuva de confete dourado",
    label: "Formatura",
    w: 1000,
    h: 667,
    pos: "right-0 bottom-[1%] w-[37%] rotate-[3deg] z-30",
    ratio: "aspect-[4/3]",
  },
  {
    src: "/festa-infantil.jpg",
    alt: "Mesa de festa decorada com arco de balões, bolo e doces",
    label: "Aniversário",
    w: 1280,
    h: 1075,
    pos: "left-0 bottom-0 w-[34%] -rotate-[4deg] z-30",
    ratio: "aspect-[6/5]",
  },
  {
    src: "/img/eventos/corporativo.webp",
    alt: "Plateia lotada em um auditório durante um evento corporativo",
    label: "Corporativo",
    w: 800,
    h: 1000,
    pos: "left-[37%] bottom-[3%] w-[24%] rotate-[2deg] z-40",
    ratio: "aspect-[4/5]",
  },
] as const;

/**
 * Fileira de baixo: Aniversário (0–34%), Corporativo (37–61%) e Formatura (63–100%)
 * apenas se tocam nas bordas/rotação — nenhuma foto cobre o assunto de outra.
 */
export function HeroMosaic() {
  return (
      <div className="relative mx-auto aspect-[10/9] w-full max-w-[640px] lg:aspect-auto lg:h-[540px]" aria-label="Momentos de festa">
        {MOSAIC.map((photo, index) => (
          <figure
            key={photo.src}
            className={`ev-photo group absolute ${photo.pos} rounded-[18px] bg-white p-1.5 pb-6 shadow-[0_18px_40px_-14px_rgba(59,36,32,0.45)] ring-1 ring-black/5 transition-[transform,box-shadow] duration-500 ease-out hover:z-50 hover:-translate-y-2 hover:rotate-0 hover:scale-[1.06] hover:shadow-[0_34px_70px_-20px_rgba(59,36,32,0.6)] sm:p-2.5 sm:pb-9`}
          >
            <div className={`relative overflow-hidden rounded-[12px] ${photo.ratio}`}>
              <Image
                src={photo.src}
                alt={photo.alt}
                fill
                priority={index === 0}
                quality={70}
                sizes={index === 0 ? "(max-width: 640px) 42vw, 270px" : "(max-width: 640px) 38vw, 245px"}
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
              />
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-primaria/25 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            </div>
            <figcaption className="absolute inset-x-0 bottom-0.5 text-center font-display text-sm italic font-medium leading-6 text-vinho/80 transition-[transform,color] duration-500 group-hover:-translate-y-0.5 group-hover:text-coral-escuro sm:bottom-1.5 sm:text-2xl sm:leading-7">
              {photo.label}
            </figcaption>
          </figure>
        ))}
      </div>
  );
}
