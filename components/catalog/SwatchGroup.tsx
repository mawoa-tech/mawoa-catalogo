"use client";

import Image from "next/image";
import type { SwatchItem } from "@/data/schema";
import { useVariantSelection } from "./VariantContext";

type SwatchGroupProps = {
  swatches: SwatchItem[];
};

export default function SwatchGroup({ swatches }: SwatchGroupProps) {
  const selection = useVariantSelection();

  return (
    <div className="swatches">
      {swatches.map((swatch, i) => {
        // Un color se muestra agotado por dos caminos distintos: la
        // casilla puesta a mano, o el stock en cero cuando el catálogo
        // lleva inventario. Se resuelve una vez acá para que el gris, la
        // diagonal y el cartel digan siempre lo mismo.
        const isSoldOut = swatch.soldOut === true || selection?.variants[i]?.status === "OUT_OF_STOCK";

        const chip = (
          <>
            {swatch.type === "image" ? (
              <Image src={swatch.image} alt={swatch.label} fill sizes="64px" />
            ) : (
              <div className="swatch-color" style={{ backgroundColor: swatch.color }} />
            )}
            {/* El color agotado necesita un cartel SIEMPRE visible: la
                etiqueta con el nombre (.swatch-label) solo aparece en
                hover/tap, así que no sirve para comunicar un estado. */}
            {isSoldOut ? (
              <div className="swatch-soldout-tag">SOLD OUT</div>
            ) : (
              <div className="swatch-label">{swatch.label}</div>
            )}
          </>
        );

        // Sin control de stock, exactamente el mismo <div> de siempre:
        // los swatches son decorativos y no hay nada que elegir.
        if (!selection) {
          return (
            <div
              className={`swatch${isSoldOut ? " swatch-sold-out" : ""}`}
              key={`${swatch.label}-${i}`}
              title={isSoldOut ? `${swatch.label} — sold out` : swatch.label}
            >
              {chip}
            </div>
          );
        }

        // Con control de stock el swatch pasa a ser un control real:
        // <button> y no un <div> con onClick, para que se pueda usar con
        // teclado y para que un lector de pantalla lo anuncie como algo
        // que se puede activar.
        const isSelected = selection.selectedIndex === i;
        return (
          <button
            type="button"
            className={[
              "swatch",
              "swatch-selectable",
              isSoldOut ? "swatch-sold-out" : "",
              isSelected ? "swatch-selected" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            key={`${swatch.label}-${i}`}
            title={swatch.label}
            aria-pressed={isSelected}
            onClick={() => selection.select(i)}
          >
            {chip}
          </button>
        );
      })}
    </div>
  );
}
