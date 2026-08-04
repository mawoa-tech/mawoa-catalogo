import type { CSSProperties } from "react";
import ScrollProgress from "./ScrollProgress";
import ScrollReveal from "./ScrollReveal";
import BlockRenderer from "./BlockRenderer";
import { LiveStockProvider } from "./LiveStockContext";
import { catalogVariants, type CatalogVariant } from "@/data/schema";
import type { CatalogBlocks, CatalogInventory, CatalogTheme, LayoutId } from "@/data/schema";

type CatalogRendererProps = {
  blocks: CatalogBlocks;
  /** Identidad visual del catálogo (colores + tipografías). Se aplica
   * como CSS custom properties inline, así que solo pisa el `:root` de
   * app/globals.css para este árbol — nunca a otros catálogos ni al
   * resto del sitio. */
  theme?: CatalogTheme;
  /** Qué set de componentes usar para dibujar cada bloque — ver
   * components/catalog/layouts. Por defecto "original" (Ariel). */
  layoutId?: LayoutId;
  /** Link de descarga del PDF del catálogo (Fase 7), si existe. */
  pdfHref?: string;
  /** Control de stock del catálogo. Ausente = no lo usa: el catálogo se dibuja exactamente como siempre. */
  inventory?: CatalogInventory;
  /**
   * Id del catálogo, solo para consultar la disponibilidad al día. Se
   * omite en la vista previa del panel: ahí la verdad es lo que el admin
   * está editando, no lo publicado.
   */
  catalogId?: string;
};

function themeStyle(theme?: CatalogTheme): CSSProperties | undefined {
  if (!theme) return undefined;
  return {
    "--ink": theme.ink,
    "--paper": theme.paper,
    "--line": theme.line,
    "--muted": theme.muted,
    "--accent": theme.accent,
    "--display-font": theme.displayFont,
    "--body-font": theme.bodyFont,
  } as CSSProperties;
}

/**
 * Convierte los `textColors` de cada bloque (ver `TextColorsSchema` en
 * data/schema.ts) en reglas CSS reales.
 *
 * Es el único lugar del render que sabe de esta función: los selectores
 * se resuelven contra la posición de la página (`section.page` n-ésima
 * dentro de `.catalog-root`), así que ningún componente de sección — ni
 * los 9 sets de plantilla — necesita enterarse. Cada bloque dibuja
 * exactamente una `<section class="page">` como hija directa de
 * `.catalog-root`, así que el índice del bloque y el `:nth-of-type` de
 * la sección son la misma cuenta.
 *
 * `!important` es necesario: el color que se está pisando viene de una
 * regla de clase en app/globals.css (o en el CSS de la plantilla), que
 * de otro modo gana o empata por especificidad.
 */
function textColorCss(blocks: CatalogBlocks): string {
  const rules: string[] = [];
  blocks.forEach((block, i) => {
    const colors = block.data.textColors;
    if (!colors) return;
    for (const [selector, color] of Object.entries(colors)) {
      rules.push(
        `.catalog-root > section.page:nth-of-type(${i + 1}) ${selector}{color:${color} !important}`
      );
    }
  });
  return rules.join("\n");
}

/**
 * Dibuja un catálogo completo a partir de su lista de bloques: la barra
 * de progreso más cada bloque en el orden en que aparece en los datos.
 * No sabe ni le importa de qué catálogo se trata — quien llama decide
 * qué `blocks`/`theme` pasarle (ver data/catalogs/index.ts).
 */
export default function CatalogRenderer({
  blocks,
  theme,
  layoutId = "original",
  pdfHref,
  inventory,
  catalogId,
}: CatalogRendererProps) {
  const customTextColors = textColorCss(blocks);

  /**
   * Los SKU se resuelven UNA vez sobre el catálogo completo y se reparten
   * por bloque: es la única forma de que dos colores que abrevian igual
   * queden desempatados igual acá, en el panel y en la hoja de Google. La
   * clave es el índice del bloque, que es la identidad real de la página.
   */
  const variantsByBlock = new Map<number, CatalogVariant[]>();
  if (inventory?.enabled) {
    const blockIndexById = new Map<string, number>();
    blocks.forEach((block, i) => {
      if (block.type === "productDetail" && !blockIndexById.has(block.data.id)) {
        blockIndexById.set(block.data.id, i);
      }
    });
    for (const variant of catalogVariants(blocks)) {
      const i = blockIndexById.get(variant.pageId);
      if (i === undefined) continue;
      const list = variantsByBlock.get(i) ?? [];
      list.push(variant);
      variantsByBlock.set(i, list);
    }
  }

  return (
    <main className="catalog-root" style={themeStyle(theme)}>
      {customTextColors && <style>{customTextColors}</style>}
      <ScrollProgress />
      <ScrollReveal />
      <LiveStockProvider catalogId={inventory?.enabled ? catalogId : undefined}>
      {blocks.map((block, i) => (
        <BlockRenderer
          // La key sale de la POSICIÓN, no de `pageNumber`: ese número
          // se recalcula al guardar, así que un catálogo puede tener
          // varios bloques con el mismo (lux tiene tres en 0) y React
          // avisaba de keys duplicadas — con riesgo real de omitir o
          // duplicar una página. El orden del array es la identidad.
          key={`${block.type}-${i}`}
          block={block}
          layoutId={layoutId}
          pdfHref={pdfHref}
          inventory={inventory}
          variants={variantsByBlock.get(i)}
        />
      ))}
      </LiveStockProvider>
    </main>
  );
}
