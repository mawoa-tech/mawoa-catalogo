import Image from "next/image";
import PageNumber from "../../PageNumber";
import SwatchGroup from "../../SwatchGroup";
import type { ProductVariant } from "@/data/schema";
import SoldOutBadge from "../../SoldOutBadge";
import BuyBar from "../../BuyBar";
import { isVariantSoldOut, soldOutClass } from "../../soldOut";
import "./nikeBold.css";

type ProductDetailPageProps = {
  variant: ProductVariant;
};

/**
 * Foto grande + un callout de color superpuesto con el precio en
 * tipografía gigante, y una segunda foto chica de contraste de escala
 * — no la grilla pareja + ficha del layout original.
 */
export default function ProductDetailPage({ variant }: ProductDetailPageProps) {
  const [hero, inset] = variant.collageImages;

  return (
    <section className={`page layout-nike-bold nk-detail${soldOutClass(variant)}`} id={variant.id}>
      {isVariantSoldOut(variant) && <SoldOutBadge />}
      <BuyBar />
      <div className="nk-detail-hero">
        {hero && <Image src={hero.src} alt={hero.alt} fill sizes="100vw" style={{ objectFit: "cover" }} />}
      </div>

      {inset && (
        <div className="nk-detail-inset">
          <Image src={inset.src} alt={inset.alt} fill sizes="220px" style={{ objectFit: "cover" }} />
        </div>
      )}

      <div className="nk-detail-callout">
        <span className="nk-detail-name">{variant.name}</span>
        <span className="nk-detail-type">{variant.type}</span>
        <div className="nk-detail-price">{variant.price}</div>
      </div>

      <div className="nk-detail-info">
        <div className="nk-detail-desc">
          {variant.description.map((line, i) => (
            <span key={`${line}-${i}`}>{line}</span>
          ))}
        </div>
        <SwatchGroup swatches={variant.swatches} />
      </div>

      <PageNumber n={variant.pageNumber} />
    </section>
  );
}
