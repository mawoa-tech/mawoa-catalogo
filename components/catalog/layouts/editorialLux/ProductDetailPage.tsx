import Image from "next/image";
import PageNumber from "../../PageNumber";
import SwatchGroup from "../../SwatchGroup";
import type { ProductVariant } from "@/data/schema";
import SoldOutBadge from "../../SoldOutBadge";
import BuyBar from "../../BuyBar";
import { isVariantSoldOut, soldOutClass } from "../../soldOut";
import "./editorialLux.css";

type ProductDetailPageProps = {
  variant: ProductVariant;
};

/**
 * Foto editorial a sangre + columna de "caption" angosta al costado
 * (nombre/precio/detalle en versalitas, como el pie de foto de un
 * shooting de revista) — no la grilla de fotos + ficha del layout
 * original.
 */
export default function ProductDetailPage({ variant }: ProductDetailPageProps) {
  const [hero, detail] = variant.collageImages;

  return (
    <section className={`page layout-editorial-lux ed-detail${soldOutClass(variant)}`} id={variant.id}>
      {isVariantSoldOut(variant) && <SoldOutBadge />}
      <BuyBar />
      <div className="ed-detail-image">
        {hero && (
          <Image
            src={hero.src}
            alt={hero.alt}
            fill
            sizes="(max-width: 850px) 100vw, 68vw"
            style={{ objectFit: "cover", objectPosition: "top center" }}
          />
        )}
      </div>

      <div className="ed-detail-caption">
        <span className="ed-detail-kicker">LOOK {String(variant.pageNumber).padStart(2, "0")}</span>
        <h3>{variant.name}</h3>
        <div className="ed-detail-type">{variant.type}</div>

        <SwatchGroup swatches={variant.swatches} />

        <div className="ed-detail-rule" />

        <div className="ed-detail-desc">
          {variant.description.map((line, i) => (
            <p key={`${line}-${i}`}>{line}</p>
          ))}
        </div>

        {detail && (
          <div className="ed-detail-inset">
            <Image src={detail.src} alt={detail.alt} fill sizes="220px" style={{ objectFit: "cover" }} />
          </div>
        )}

        <div className="ed-detail-price">
          <span>PRICE</span>
          <b>{variant.price}</b>
        </div>
      </div>

      <PageNumber n={variant.pageNumber} dark />
    </section>
  );
}
