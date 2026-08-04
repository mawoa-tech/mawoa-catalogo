"use client";

import { createContext, useContext, type ReactNode } from "react";

type InventoryContextValue = {
  /** El catálogo tiene el control de stock encendido (ver InventorySettings). */
  enabled: boolean;
  /**
   * SKU ya resuelto de una variante, con las colisiones del catálogo
   * entero ya desempatadas. Sin talla ni corte devuelve el de la
   * primera combinación de ese color, que es el SKU del color a secas
   * cuando el modelo no tiene dimensiones.
   */
  skuOf: (pageId: string, swatchIndex: number, size?: string, cut?: string) => string;
};

/**
 * Por qué un contexto y no props: el SKU y el "¿hay inventario?" los
 * necesita `SwatchesEditor`, que está tres niveles abajo
 * (BlockList → BlockForm → SwatchesEditor) y cuyos dos intermediarios no
 * tienen ningún otro motivo para saber que el inventario existe. Es el
 * mismo razonamiento —y el mismo patrón— que `AssetsContext` para la
 * biblioteca de imágenes.
 *
 * El SKU no se calcula en la hoja: se calcula UNA vez sobre el catálogo
 * completo (`catalogVariants`) y se reparte ya resuelto. Si cada campo
 * lo calculara por su cuenta no podría desempatar dos colores que
 * abrevian igual, porque no ve al resto.
 *
 * El valor por defecto (apagado) hace que los mismos formularios sigan
 * funcionando donde no hay proveedor — por ejemplo el asistente de
 * creación, que reutiliza BlockForm tal cual.
 */
const InventoryContext = createContext<InventoryContextValue>({
  enabled: false,
  skuOf: () => "",
});

export function InventoryProvider({
  value,
  children,
}: {
  value: InventoryContextValue;
  children: ReactNode;
}) {
  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory(): InventoryContextValue {
  return useContext(InventoryContext);
}
