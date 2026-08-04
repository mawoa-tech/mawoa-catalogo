import Image from "next/image";
import PageNumber from "../../PageNumber";
import SwatchGroup from "../../SwatchGroup";
import type { ProductVariant } from "@/data/schema";
import SoldOutBadge from "../../SoldOutBadge";
import BuyBar from "../../BuyBar";
import { isVariantSoldOut, soldOutClass } from "../../soldOut";
import "./modernPremium.css";

type ProductDetailPageProps = {
  variant: ProductVariant;
};

/**
 * Imagen a la derecha / contenido a la izquierda dentro de un marco
 * con filete dorado — ficha "de lujo", no la grilla + info plana del
 * layout original.
 */
export default function ProductDetailPage({ variant }: ProductDetailPageProps) {
  return (
    <section className={`page layout-modern-premium mp-detail${soldOutClass(variant)}`} id={variant.id}>
      {isVariantSoldOut(variant) && <SoldOutBadge />}
      <BuyBar />
      <div className="mp-detail-content">
        <div className="mp-detail-frame">
          <span className="mp-eyebrow">Collection Piece</span>
          <h3>{variant.name}</h3>
          <p className="mp-detail-type">{variant.type}</p>
          <div className="mp-gold-rule" />
          <div className="mp-detail-desc">
            {variant.description.map((line, i) => (
              <p key={`${line}-${i}`}>{line}</p>
            ))}
          </div>
          <SwatchGroup swatches={variant.swatches} />
          <div className="mp-gold-rule" />
          <div className="mp-detail-price">
            <span>Price</span>
            {variant.price}
          </div>
        </div>
      </div>

      <div className="mp-detail-images">
        {variant.collageImages.map((img, i) => (
          <div className="mp-image-cell" key={`${img.src}-${i}`}>
            <Image src={img.src} alt={img.alt} fill sizes="16vw" style={{ objectFit: "cover" }} />
          </div>
        ))}
      </div>

      <PageNumber n={variant.pageNumber} dark />
    </section>
  );
}
