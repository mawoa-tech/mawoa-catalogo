import Image from "next/image";
import PageNumber from "../../PageNumber";
import SwatchGroup from "../../SwatchGroup";
import type { ProductVariant } from "@/data/schema";
import SoldOutBadge from "../../SoldOutBadge";
import BuyBar from "../../BuyBar";
import { isVariantSoldOut, soldOutClass } from "../../soldOut";
import "./japaneseMinimal.css";

type ProductDetailPageProps = {
  variant: ProductVariant;
};

/**
 * Texto primero, imagen modesta y descentrada — el texto lidera la
 * página en vez de la foto, con un filete rojo finito como único
 * elemento decorativo.
 */
export default function ProductDetailPage({ variant }: ProductDetailPageProps) {
  const [hero] = variant.collageImages;

  return (
    <section className={`page layout-japanese-minimal jp-detail${soldOutClass(variant)}`} id={variant.id}>
      {isVariantSoldOut(variant) && <SoldOutBadge />}
      <BuyBar />
      <span className="jp-mark" aria-hidden="true" />
      <div className="jp-detail-text">
        <h3>{variant.name}</h3>
        <p className="jp-detail-type">{variant.type}</p>
        <div className="jp-detail-rule" />
        <div className="jp-detail-desc">
          {variant.description.map((line, i) => (
            <p key={`${line}-${i}`}>{line}</p>
          ))}
        </div>
        <SwatchGroup swatches={variant.swatches} />
        <div className="jp-detail-price">{variant.price}</div>
      </div>

      <div className="jp-detail-image">
        {hero && <Image src={hero.src} alt={hero.alt} fill sizes="34vw" style={{ objectFit: "cover" }} />}
      </div>

      <PageNumber n={variant.pageNumber} dark />
    </section>
  );
}
