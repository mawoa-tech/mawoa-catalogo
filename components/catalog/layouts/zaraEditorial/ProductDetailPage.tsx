import Image from "next/image";
import PageNumber from "../../PageNumber";
import SwatchGroup from "../../SwatchGroup";
import type { ProductVariant } from "@/data/schema";
import SoldOutBadge from "../../SoldOutBadge";
import BuyBar from "../../BuyBar";
import { isVariantSoldOut, soldOutClass } from "../../soldOut";
import "./zaraEditorial.css";

type ProductDetailPageProps = {
  variant: ProductVariant;
};

/**
 * Imagen izquierda 65% / contenido angosto a la derecha, con mucho
 * blanco y tracking amplio — no la grilla + ficha del layout original.
 */
export default function ProductDetailPage({ variant }: ProductDetailPageProps) {
  const [hero, secondary] = variant.collageImages;

  return (
    <section className={`page layout-zara-editorial za-detail${soldOutClass(variant)}`} id={variant.id}>
      {isVariantSoldOut(variant) && <SoldOutBadge />}
      <BuyBar />
      <div className="za-detail-image">
        {hero && <Image src={hero.src} alt={hero.alt} fill sizes="(max-width: 850px) 100vw, 65vw" style={{ objectFit: "cover" }} />}
      </div>

      <div className="za-detail-content">
        <h3>{variant.name}</h3>
        <p className="za-detail-type">{variant.type}</p>

        <div className="za-detail-desc">
          {variant.description.map((line, i) => (
            <p key={`${line}-${i}`}>{line}</p>
          ))}
        </div>

        <SwatchGroup swatches={variant.swatches} />

        {secondary && (
          <div className="za-detail-secondary">
            <Image src={secondary.src} alt={secondary.alt} fill sizes="220px" style={{ objectFit: "cover" }} />
          </div>
        )}

        <div className="za-detail-price">
          <span>Precio</span>
          {variant.price}
        </div>
      </div>

      <PageNumber n={variant.pageNumber} dark />
    </section>
  );
}
