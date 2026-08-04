import Image from "next/image";
import PageNumber from "../../PageNumber";
import SwatchGroup from "../../SwatchGroup";
import type { ProductVariant } from "@/data/schema";
import SoldOutBadge from "../../SoldOutBadge";
import BuyBar from "../../BuyBar";
import { isVariantSoldOut, soldOutClass } from "../../soldOut";
import "./streetwearDark.css";

type ProductDetailPageProps = {
  variant: ProductVariant;
};

/**
 * Fondo oscuro, fotos dispersas tipo polaroid con leve rotación, tags
 * estilo sticker, texto monoespaciado — nada de grilla pareja ni ficha
 * en blanco.
 */
export default function ProductDetailPage({ variant }: ProductDetailPageProps) {
  return (
    <section className={`page layout-streetwear-dark sw-detail${soldOutClass(variant)}`} id={variant.id}>
      {isVariantSoldOut(variant) && <SoldOutBadge />}
      <BuyBar />
      <div className="sw-detail-photos">
        {variant.collageImages.map((img, i) => (
          <div className={`sw-photo sw-photo-${i}`} key={`${img.src}-${i}`}>
            <Image src={img.src} alt={img.alt} fill sizes="30vw" style={{ objectFit: "cover" }} />
          </div>
        ))}
      </div>

      <div className="sw-detail-info">
        <span className="sw-sticker sw-sticker-name">{variant.name}</span>
        <p className="sw-detail-type">{variant.type}</p>
        <div className="sw-detail-desc">
          {variant.description.map((line, i) => (
            <span key={`${line}-${i}`}>&gt; {line}</span>
          ))}
        </div>
        <SwatchGroup swatches={variant.swatches} />
        <span className="sw-price-tag">{variant.price}</span>
      </div>

      <PageNumber n={variant.pageNumber} />
    </section>
  );
}
