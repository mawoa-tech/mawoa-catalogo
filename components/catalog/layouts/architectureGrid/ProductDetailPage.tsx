import Image from "next/image";
import PageNumber from "../../PageNumber";
import SwatchGroup from "../../SwatchGroup";
import type { ProductVariant } from "@/data/schema";
import SoldOutBadge from "../../SoldOutBadge";
import BuyBar from "../../BuyBar";
import { isVariantSoldOut, soldOutClass } from "../../soldOut";
import "./architectureGrid.css";

type ProductDetailPageProps = {
  variant: ProductVariant;
};

/**
 * Grilla modular de celdas (como un portfolio de arquitectura): cada
 * foto en su celda con caption "FIG. 0N", columna de info separada por
 * líneas estructurales — no la foto grande + ficha del layout original.
 */
export default function ProductDetailPage({ variant }: ProductDetailPageProps) {
  const [p1, p2, p3, p4] = variant.collageImages;

  return (
    <section className={`page layout-architecture-grid ag-detail${soldOutClass(variant)}`} id={variant.id}>
      {isVariantSoldOut(variant) && <SoldOutBadge />}
      <BuyBar />
      <div className="ag-detail-grid">
        {p1 && (
          <div className="ag-cell ag-cell-photo1">
            <Image src={p1.src} alt={p1.alt} fill sizes="40vw" style={{ objectFit: "cover" }} />
            <span className="ag-fig">FIG. 01</span>
          </div>
        )}
        {p2 && (
          <div className="ag-cell ag-cell-photo2">
            <Image src={p2.src} alt={p2.alt} fill sizes="20vw" style={{ objectFit: "cover" }} />
            <span className="ag-fig">FIG. 02</span>
          </div>
        )}
        {p3 && (
          <div className="ag-cell ag-cell-photo3">
            <Image src={p3.src} alt={p3.alt} fill sizes="20vw" style={{ objectFit: "cover" }} />
            <span className="ag-fig">FIG. 03</span>
          </div>
        )}
        {p4 && (
          <div className="ag-cell ag-cell-photo4">
            <Image src={p4.src} alt={p4.alt} fill sizes="40vw" style={{ objectFit: "cover" }} />
            <span className="ag-fig">FIG. 04</span>
          </div>
        )}

        <div className="ag-cell ag-cell-info">
          <span className="ag-coord">ART—{String(variant.pageNumber).padStart(2, "0")}</span>
          <h3>{variant.name}</h3>
          <p className="ag-detail-type">{variant.type}</p>
          <div className="ag-rule" />
          <div className="ag-desc">
            {variant.description.map((line, i) => (
              <p key={`${line}-${i}`}>{line}</p>
            ))}
          </div>
          <SwatchGroup swatches={variant.swatches} />
          <div className="ag-rule" />
          <div className="ag-price">
            <span>PRICE</span>
            <b>{variant.price}</b>
          </div>
        </div>
      </div>

      <PageNumber n={variant.pageNumber} dark />
    </section>
  );
}
