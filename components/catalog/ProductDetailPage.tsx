import PageNumber from "./PageNumber";
import Collage from "./Collage";
import SwatchGroup from "./SwatchGroup";
import type { ProductVariant } from "@/data/schema";
import SoldOutBadge from "./SoldOutBadge";
import BuyBar from "./BuyBar";
import { isVariantSoldOut, soldOutClass } from "./soldOut";

type ProductDetailPageProps = {
  variant: ProductVariant;
};

/**
 * Página de detalle de un colorway: collage de fotos + ficha (nombre, swatches,
 * descripción, precio). Un solo componente para las 4 variantes del producto,
 * alimentado por datos en vez de repetir markup.
 */
export default function ProductDetailPage({ variant }: ProductDetailPageProps) {
  return (
    <section className={`page detail${soldOutClass(variant)}`} id={variant.id}>
      {isVariantSoldOut(variant) && <SoldOutBadge />}
      <BuyBar />
      <Collage images={variant.collageImages} layout={variant.collageLayout} />
      <div className="info">
        <div className="info-head">
          <div>
            <h3>{variant.name}</h3>
            <div className="type">{variant.type}</div>
          </div>
          <SwatchGroup swatches={variant.swatches} />
        </div>
        <div className="rule" />
        <div className="info-grid">
          <div className="left">
            {variant.description.map((line, i) => (
              <span key={`${line}-${i}`}>
                {line}
                {i < variant.description.length - 1 && <br />}
              </span>
            ))}
          </div>
          <div className="right">
            PRICE
            <br />
            <b>{variant.price}</b>
          </div>
        </div>
        <PageNumber n={variant.pageNumber} dark />
      </div>
    </section>
  );
}
