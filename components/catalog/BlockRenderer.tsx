import { LAYOUTS } from "./layouts";
import { VariantProvider } from "./VariantContext";
import type { Block, CatalogInventory, LayoutId } from "@/data/schema";

type BlockRendererProps = {
  block: Block;
  /** Qué identidad visual usar — ver components/catalog/layouts. */
  layoutId: LayoutId;
  /** Solo lo usa el bloque "closing" — ver ClosingPage. */
  pdfHref?: string;
  /** Control de stock del catálogo. Ausente = el catálogo no lo usa y nada cambia. */
  inventory?: CatalogInventory;
  /** SKU de los colores de este bloque, si es una página de producto (ver CatalogRenderer). */
  skus?: string[];
};

/**
 * Dispatcher genérico: traduce un bloque de datos al componente que le
 * corresponde, dentro del set de componentes del layout activo. El switch
 * exhaustivo (con el chequeo `never`) hace que agregar un tipo de bloque
 * nuevo sin manejarlo acá sea un error de compilación, no un bug
 * silencioso en producción.
 */
export default function BlockRenderer({ block, layoutId, pdfHref, inventory, skus }: BlockRendererProps) {
  const L = LAYOUTS[layoutId];
  switch (block.type) {
    case "cover":
      return <L.CoverPage data={block.data} />;
    case "manifesto":
      return <L.ManifestoPage data={block.data} />;
    case "productHero":
      return <L.ProductHero data={block.data} />;
    case "chapterHero":
      return <L.ChapterHero data={block.data} />;
    case "productDetail":
      // El proveedor va acá y no dentro de cada plantilla: es el único
      // lugar por el que pasan las 10, así que ninguna necesita saber
      // que el inventario existe (ni las que se agreguen después).
      return (
        <VariantProvider variant={block.data} inventory={inventory} skus={skus}>
          <L.ProductDetailPage variant={block.data} />
        </VariantProvider>
      );
    case "closing":
      return <L.ClosingPage data={block.data} pdfHref={pdfHref} />;
    default: {
      const exhaustiveCheck: never = block;
      return exhaustiveCheck;
    }
  }
}
