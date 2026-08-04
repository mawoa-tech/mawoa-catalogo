import Image from "next/image";
import PageNumber from "../../PageNumber";
import SwatchGroup from "../../SwatchGroup";
import type { ProductVariant } from "@/data/schema";
import SoldOutBadge from "../../SoldOutBadge";
import BuyBar from "../../BuyBar";
import { isVariantSoldOut, soldOutClass } from "../../soldOut";
import "./appleMinimal.css";

type ProductDetailPageProps = {
  variant: ProductVariant;
};

/**
 * Una sola foto enorme, texto centrado debajo, sin filetes ni marcos —
 * "imagen primero", sin la grilla + ficha del layout original.
 */
export default function ProductDetailPage({ variant }: ProductDetailPageProps) {
  const [hero] = variant.collageImages;

  return (
    <section className={`page layout-apple-minimal am-detail${soldOutClass(variant)}`} id={variant.id}>
      {isVariantSoldOut(variant) && <SoldOutBadge />}
      <BuyBar />
      <div className="am-detail-image">
        {hero && <Image src={hero.src} alt={hero.alt} fill sizes="100vw" style={{ objectFit: "cover" }} />}
      </div>

      <div className="am-detail-text">
        <h3>{variant.name}</h3>
        <p className="am-detail-type">{variant.type}</p>
        <p className="am-detail-desc">{variant.description.join(" · ")}</p>
        <div className="am-detail-price">{variant.price}</div>
        <SwatchGroup swatches={variant.swatches} />
      </div>

      <PageNumber n={variant.pageNumber} dark />
    </section>
  );
}
