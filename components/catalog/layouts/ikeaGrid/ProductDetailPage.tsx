import Image from "next/image";
import PageNumber from "../../PageNumber";
import SwatchGroup from "../../SwatchGroup";
import type { ProductVariant } from "@/data/schema";
import SoldOutBadge from "../../SoldOutBadge";
import BuyBar from "../../BuyBar";
import { isVariantSoldOut, soldOutClass } from "../../soldOut";
import "./ikeaGrid.css";

type ProductDetailPageProps = {
  variant: ProductVariant;
};

/**
 * Tarjeta modular tipo ficha de catálogo práctico: grilla 2×2 de fotos,
 * tag de precio amarillo superpuesto, specs numeradas, franjas azules
 * — no la foto grande + ficha lateral del layout original.
 */
export default function ProductDetailPage({ variant }: ProductDetailPageProps) {
  return (
    <section className={`page layout-ikea-grid ik-detail${soldOutClass(variant)}`} id={variant.id}>
      {isVariantSoldOut(variant) && <SoldOutBadge />}
      <BuyBar />
      <div className="ik-detail-photos">
        {variant.collageImages.map((img, i) => (
          <div className="ik-photo-cell" key={`${img.src}-${i}`}>
            <Image src={img.src} alt={img.alt} fill sizes="25vw" style={{ objectFit: "cover" }} />
          </div>
        ))}
        <div className="ik-price-tag">
          <span>PRICE</span>
          <b>{variant.price}</b>
        </div>
      </div>

      <div className="ik-detail-info">
        <span className="ik-article-no">ART. {String(variant.pageNumber).padStart(3, "0")}</span>
        <h3>{variant.name}</h3>
        <p className="ik-detail-type">{variant.type}</p>

        <div className="ik-rule" />

        <ol className="ik-specs">
          {variant.description.map((line, i) => (
            <li key={`${line}-${i}`}>
              <span>{i + 1}</span>
              {line}
            </li>
          ))}
        </ol>

        <div className="ik-rule" />

        <div className="ik-swatches-row">
          <span className="ik-label">COLOURS</span>
          <SwatchGroup swatches={variant.swatches} />
        </div>
      </div>

      <PageNumber n={variant.pageNumber} dark />
    </section>
  );
}
