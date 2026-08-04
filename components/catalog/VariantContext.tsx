"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { CatalogInventory, ProductVariant, StockStatus } from "@/data/schema";
import { stockStatus } from "@/data/schema";
import { useLiveStock } from "./LiveStockContext";

export type SelectableVariant = {
  index: number;
  label: string;
  status: StockStatus;
  price?: number;
};

type VariantContextValue = {
  /** El catálogo controla stock y esta página tiene colores con datos cargados. */
  active: boolean;
  variants: SelectableVariant[];
  selectedIndex: number;
  select: (index: number) => void;
  productName: string;
  whatsappPhone?: string;
};

const VariantContext = createContext<VariantContextValue | null>(null);

/**
 * Estado compartido de "qué color está elegido" en una página de
 * producto.
 *
 * Existe porque los dos que lo necesitan están en ramas distintas del
 * árbol: los swatches (donde se elige) y la barra de compra (donde se
 * ve la disponibilidad y se compra). Pasarlo por props obligaría a que
 * las 10 plantillas —que no tienen ningún motivo para saber que existe
 * el inventario— lo cablearan una por una; el proveedor lo pone
 * BlockRenderer, en un solo lugar, para cualquier plantilla presente o
 * futura.
 *
 * Cuando el catálogo no controla stock, `active` es false y todo lo que
 * lee este contexto se comporta exactamente como antes de que
 * existiera.
 */
export function VariantProvider({
  variant,
  inventory,
  skus,
  children,
}: {
  variant: ProductVariant;
  inventory?: CatalogInventory;
  /** SKU de cada color de esta página, ya resueltos sobre el catálogo entero (ver catalogVariants). */
  skus?: string[];
  children: ReactNode;
}) {
  const live = useLiveStock();

  const variants = useMemo<SelectableVariant[]>(() => {
    if (inventory?.enabled !== true) return [];
    return variant.swatches.map((swatch, index) => {
      // Lo que dice el almacén de stock manda sobre lo guardado en el
      // contenido: el contenido es del último "Guardar y publicar", el
      // almacén puede haberse actualizado después desde la hoja.
      const liveStatus = skus?.[index] ? live?.[skus[index]] : undefined;
      return {
      index,
      label: swatch.label,
      price: swatch.inventory?.price,
      // Sin números cargados no se puede afirmar que haya stock. Se toma
      // como agotado, que es el lado seguro: es peor prometer algo que
      // no hay que perder una venta de algo que nadie contó.
      status:
        swatch.soldOut === true || variant.soldOut === true
          ? "OUT_OF_STOCK"
          : (liveStatus ??
            (swatch.inventory
              ? stockStatus(swatch.inventory.stock, swatch.inventory.minStock)
              : "OUT_OF_STOCK")),
      };
    });
  }, [variant, inventory?.enabled, skus, live]);

  // Arranca en el primer color que se pueda comprar, no en el primero de
  // la lista: si el primero está agotado, abrir la página mostrando
  // "Agotado" cuando hay otros disponibles cuenta la historia al revés.
  const firstBuyable = variants.findIndex((v) => v.status !== "OUT_OF_STOCK");
  const [selectedIndex, setSelectedIndex] = useState(firstBuyable >= 0 ? firstBuyable : 0);

  const value = useMemo<VariantContextValue>(
    () => ({
      active: variants.length > 0,
      variants,
      selectedIndex: Math.min(selectedIndex, Math.max(variants.length - 1, 0)),
      select: setSelectedIndex,
      productName: variant.name,
      whatsappPhone: inventory?.whatsappPhone,
    }),
    [variants, selectedIndex, variant.name, inventory?.whatsappPhone]
  );

  return <VariantContext.Provider value={value}>{children}</VariantContext.Provider>;
}

/** `null` fuera de una página de producto, o cuando el catálogo no controla stock. */
export function useVariantSelection(): VariantContextValue | null {
  const value = useContext(VariantContext);
  return value?.active ? value : null;
}
