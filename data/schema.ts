import { z } from "zod";

/**
 * The catalog's data model: what shape any catalog's content must have.
 * This file is catalog-agnostic — it knows nothing about Ariel, dresses,
 * or prices in soles. TypeScript types below are derived from the Zod
 * schemas (`z.infer`) so the runtime contract and the compile-time type
 * can never drift apart. Actual catalog content (data/catalogs/*.ts) is
 * validated against these schemas before it's ever rendered.
 */

// ---- Shared leaf shapes ----

/**
 * Inventario de UNA variante — o sea de un color concreto de un modelo,
 * no del modelo entero: es el color el que se agota, tiene su propio
 * precio y su propio SKU.
 *
 * Va colgado del swatch y es opcional en dos niveles a la vez: un
 * catálogo puede no llevar inventario (`CatalogInventorySchema.enabled`)
 * y, aun llevándolo, un color puede no tener números cargados todavía.
 * Nada de lo ya publicado necesita migrarse.
 *
 * `stock` acepta negativos a propósito. No es que tenga sentido tener
 * -1 unidades: es que el stock lo va a escribir una persona en una hoja
 * de Google, y si alguien tipea -1 el sistema tiene que poder LEER ese
 * dato para corregirlo y avisar. Rechazarlo en el schema haría fallar
 * la sincronización entera por una celda mal cargada. `stockStatus` lo
 * trata como agotado, que es la lectura segura.
 */
export const VariantInventorySchema = z.object({
  /** En la moneda del catálogo. Separado del `price` de texto de la página, que es libre ("S/ 229") y sigue existiendo. */
  price: z.number().nonnegative().optional(),
  stock: z.number().int(),
  /** Por debajo o igual de esto (y con stock > 0) la variante se considera "últimas unidades". */
  minStock: z.number().int().nonnegative(),
});
export type VariantInventory = z.infer<typeof VariantInventorySchema>;

/**
 * `soldOut` es opcional a propósito: todo el contenido ya publicado
 * (y las 10 plantillas de arranque) se validan igual sin tocarlo, y
 * "no dice nada" significa disponible. Vive tanto acá — un color
 * puntual agotado — como en `ProductVariantSchema` — el modelo entero
 * agotado; son dos estados distintos y reales.
 *
 * `inventory` es el mismo criterio llevado a los números: un color sin
 * inventario cargado no participa del control de stock, y un catálogo
 * con el control apagado se comporta exactamente como antes.
 */
export const SwatchItemSchema = z.discriminatedUnion("type", [
  z.object({
    label: z.string(),
    type: z.literal("image"),
    image: z.string(),
    soldOut: z.boolean().optional(),
    inventory: VariantInventorySchema.optional(),
  }),
  z.object({
    label: z.string(),
    type: z.literal("color"),
    color: z.string(),
    soldOut: z.boolean().optional(),
    inventory: VariantInventorySchema.optional(),
  }),
]);
export type SwatchItem = z.infer<typeof SwatchItemSchema>;

// ---- Inventario: estado derivado y SKU ----

export const STOCK_STATUSES = ["AVAILABLE", "LOW_STOCK", "OUT_OF_STOCK"] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

/**
 * El estado NO se guarda: se calcula acá cada vez que hace falta.
 *
 * Guardarlo junto al número sería tener dos fuentes de verdad para lo
 * mismo, y se desincronizarían la primera vez que alguien edite el stock
 * en la hoja de Google sin tocar la columna de estado. La hoja sí va a
 * tener una columna ESTADO, pero como salida de esta función, no como
 * dato de entrada.
 */
export function stockStatus(stock: number, minStock: number): StockStatus {
  if (stock <= 0) return "OUT_OF_STOCK";
  if (stock <= minStock) return "LOW_STOCK";
  return "AVAILABLE";
}

/**
 * Normaliza un texto para que pueda formar parte de un SKU: sin
 * acentos, sin espacios ni signos, en mayúsculas.
 *
 * Los acentos se sacan con el rango escapado `\u0300-\u036f` y no con
 * los caracteres combinantes tipeados directo: este proyecto ya cometió
 * exactamente ese error dos veces (ver el decision log), y son
 * caracteres invisibles en el editor.
 */
function skuToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Las coordenadas de una variante: siempre un color, y opcionalmente talla y corte. */
export type VariantCoords = {
  model: string;
  color: string;
  size?: string;
  cut?: string;
};

/**
 * SKU de una variante: `MODELO-COL[-TAL][-COR]` (ej. `MODELOA-NEG`,
 * `MODELOA-NEG-S-HIL`).
 *
 * Se DERIVA de las coordenadas en vez de guardarse, así nadie tiene que
 * escribirlo y no puede quedar viejo respecto al contenido. La
 * contrapartida, asumida: renombrar el modelo, el color, la talla o el
 * corte cambia el SKU. Nada más lo mueve — reordenar páginas, agregar
 * modelos o borrar otros colores lo dejan igual (por eso el número de
 * página no forma parte del código).
 *
 * Las partes opcionales se omiten cuando no existen, así un modelo sin
 * tallas ni cortes conserva EXACTAMENTE el mismo SKU que antes de que
 * estas dimensiones existieran — que es lo que evita que el contenido
 * ya publicado cambie de identidad al actualizar el sistema.
 *
 * `taken` son los SKU ya asignados en el mismo catálogo: si dos valores
 * distintos abrevian igual ("Negro" y "Negra" → NEG), el segundo recibe
 * un sufijo correlativo en vez de pisar al primero. Con el recorrido en
 * orden de documento (ver `catalogVariants`) el resultado es siempre el
 * mismo para el mismo contenido, que es lo que hace idempotente la
 * sincronización con la hoja.
 */
export function variantSku(coords: VariantCoords, taken?: Iterable<string>): string {
  const model = skuToken(coords.model) || "MODELO";
  const parts = [model, skuToken(coords.color).slice(0, 3) || "COL"];
  if (coords.size !== undefined) parts.push(skuToken(coords.size).slice(0, 3) || "TAL");
  if (coords.cut !== undefined) parts.push(skuToken(coords.cut).slice(0, 3) || "COR");
  const base = parts.join("-");

  const used = new Set(taken ?? []);
  if (!used.has(base)) return base;

  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export const CollageLayoutSchema = z.enum(["four", "three", "two", "one"]);
export type CollageLayout = z.infer<typeof CollageLayoutSchema>;

/**
 * Cuántas fotos espera cada layout (fix, 2026-07-29) — `"four"` fija su
 * grilla mobile a 2 columnas (`app/globals.css`), pensada para 4 fotos
 * (2 filas de 2); cargar más de las esperadas no rompe nada en
 * desktop (simplemente agrega filas) pero en mobile duplica la altura
 * del collage y empuja el resto de la sección fuera de la pantalla —
 * ver `components/catalog/Collage.tsx`, que recorta a este número en
 * vez de confiar en que el contenido siempre venga bien contado.
 */
export const COLLAGE_LAYOUT_IMAGE_COUNT: Record<CollageLayout, number> = {
  four: 4,
  three: 3,
  two: 2,
  one: 1,
};

/**
 * `collageLayout` siempre tiene que calzar con la cantidad real de
 * `collageImages` (ver comentario arriba) — dejarlo como un campo
 * editable a mano, separado del propio listado de fotos, es lo que
 * permitió que se desincronizaran más de una vez en producción (ver
 * decision log en CLAUDE.md). El admin ya no lo edita directamente:
 * se deriva acá cada vez que cambia la lista de fotos.
 */
export function deriveCollageLayout(imageCount: number): CollageLayout {
  if (imageCount >= 4) return "four";
  if (imageCount === 3) return "three";
  if (imageCount === 2) return "two";
  return "one";
}

export const CollageImageSchema = z.object({
  src: z.string(),
  alt: z.string(),
});
export type CollageImage = z.infer<typeof CollageImageSchema>;

/**
 * Un corte del modelo (hilo, semihilo, tanga…). Lleva imagen porque es
 * una decisión visual: nadie elige "semihilo" leyendo la palabra, lo
 * elige viendo la forma.
 */
export const CutSchema = z.object({
  label: z.string().min(1),
  image: z.string(),
});
export type Cut = z.infer<typeof CutSchema>;

/**
 * Colores puestos a mano sobre un texto puntual de la página, desde la
 * vista previa del panel (se clickea el texto y se elige el color).
 *
 * La clave es qué se usa de clave: un selector CSS **relativo a la
 * `<section class="page">`** de esa página, no el nombre de un campo de
 * datos. Con 10 plantillas dibujando los mismos datos con componentes
 * distintos, atarlo al campo obligaría a que cada uno de los ~63
 * componentes de `components/catalog/layouts` supiera pintar cada uno
 * de sus textos; atarlo a la posición dentro de la sección lo resuelve
 * en un solo lugar (`CatalogRenderer`, que emite las reglas CSS) y
 * funciona igual en cualquier plantilla. Ver
 * `components/admin/textColorTarget.ts` para el costo de esa decisión.
 *
 * Los dos `regex` no son decorativos: estas dos cadenas terminan
 * literalmente dentro de un `<style>`, así que un valor libre sería una
 * vía de inyección de CSS. Se aceptan solo caracteres de selector y
 * colores `#rgb`/`#rrggbb`.
 */
export const TextColorsSchema = z
  .record(
    z.string().regex(/^[a-zA-Z0-9\s.:>()#_-]+$/),
    z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  )
  .optional();
export type TextColors = z.infer<typeof TextColorsSchema>;

// ---- Section data shapes ----

export const CoverDataSchema = z.object({
  title: z.string(),
  meta: z.array(z.string()),
  subtitle: z.string(),
  bottomLine1: z.string(),
  bottomLine2: z.string(),
  bgImage: z.string(),
  pageNumber: z.number(),
  textColors: TextColorsSchema,
});
export type CoverData = z.infer<typeof CoverDataSchema>;

export const ManifestoDataSchema = z.object({
  heading: z.string(),
  paragraph: z.string(),
  bgImage: z.string(),
  pageNumber: z.number(),
  textColors: TextColorsSchema,
});
export type ManifestoData = z.infer<typeof ManifestoDataSchema>;

export const ProductHeroDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  bgImage: z.string(),
  pageNumber: z.number(),
  textColors: TextColorsSchema,
});
export type ProductHeroData = z.infer<typeof ProductHeroDataSchema>;

export const ChapterHeroSchema = z.object({
  id: z.string(),
  pageNumber: z.number(),
  name: z.string(),
  label: z.string(),
  bgImage: z.string(),
  textColors: TextColorsSchema,
});
export type ChapterHero = z.infer<typeof ChapterHeroSchema>;

export const ProductVariantSchema = z.object({
  id: z.string(),
  pageNumber: z.number(),
  name: z.string(),
  type: z.string(),
  price: z.string(),
  description: z.array(z.string()),
  collageLayout: CollageLayoutSchema,
  collageImages: z.array(CollageImageSchema),
  swatches: z.array(SwatchItemSchema),
  /**
   * Tallas del modelo, si las tiene (`["XS","S","M","L"]`, o
   * `["Standard"]` cuando es talla única). Son del modelo y no del
   * color: en la práctica un mismo modelo se fabrica en las mismas
   * tallas para todos sus colores, y tenerlas por color multiplicaría
   * el trabajo de carga sin representar nada real.
   */
  sizes: z.array(z.string().min(1)).optional(),
  /**
   * Cortes del modelo, con su propia imagen (hilo, semihilo, tanga…).
   * A diferencia de la talla, el corte se ELIGE mirando: por eso lleva
   * imagen y no es solo una etiqueta.
   */
  cuts: z.array(CutSchema).optional(),
  /**
   * Unidades por combinación, indexadas por SKU. Un número suelto y no
   * un objeto: el precio es del color (vive en el swatch) y el mínimo
   * es del modelo (acá abajo), así que lo único que varía combinación
   * por combinación es la cantidad.
   *
   * Es el mapa que se sincroniza contra la hoja de Google, y por eso su
   * clave es el SKU y no la posición: reordenar tallas o colores no
   * tiene que mover ningún número.
   */
  stock: z.record(z.string(), z.number().int()).optional(),
  /**
   * "Últimas unidades" a partir de acá, para todas las combinaciones
   * del modelo. Uno por modelo y no uno por combinación: nadie va a
   * definir 36 mínimos distintos, y tenerlos repetidos solo agrega
   * lugares donde se puede desincronizar.
   */
  minStock: z.number().int().nonnegative().optional(),
  /** El modelo entero está agotado (ver `SwatchItemSchema`). */
  soldOut: z.boolean().optional(),
  textColors: TextColorsSchema,
});
export type ProductVariant = z.infer<typeof ProductVariantSchema>;

/** Un modelo usa el esquema nuevo (stock por combinación) en cuanto declara alguna dimensión. */
export function hasVariantDimensions(data: ProductVariant): boolean {
  return (data.sizes?.length ?? 0) > 0 || (data.cuts?.length ?? 0) > 0;
}

export const ClosingDataSchema = z.object({
  title: z.string(),
  line1: z.string(),
  line2: z.string(),
  bgImage: z.string(),
  pageNumber: z.number(),
  textColors: TextColorsSchema,
});
export type ClosingData = z.infer<typeof ClosingDataSchema>;

// ---- Block: the catalog's unit of composition ----

export const BlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cover"), data: CoverDataSchema }),
  z.object({ type: z.literal("manifesto"), data: ManifestoDataSchema }),
  z.object({ type: z.literal("productHero"), data: ProductHeroDataSchema }),
  z.object({ type: z.literal("chapterHero"), data: ChapterHeroSchema }),
  z.object({ type: z.literal("productDetail"), data: ProductVariantSchema }),
  z.object({ type: z.literal("closing"), data: ClosingDataSchema }),
]);
export type Block = z.infer<typeof BlockSchema>;

export const CatalogBlocksSchema = z.array(BlockSchema);
export type CatalogBlocks = z.infer<typeof CatalogBlocksSchema>;

// ---- Theme: per-catalog visual identity ----
//
// Maps 1:1 onto the CSS custom properties already used sitewide
// (app/globals.css `:root`) plus the two font stacks used for the
// serif "hero moment" titles vs. everything else — free colors/fonts,
// not a fixed set of presets, applied by CatalogRenderer as inline
// CSS variables scoped to that catalog's render root.

export const CatalogThemeSchema = z.object({
  ink: z.string().min(1),
  paper: z.string().min(1),
  line: z.string().min(1),
  muted: z.string().min(1),
  accent: z.string().min(1),
  displayFont: z.string().min(1),
  bodyFont: z.string().min(1),
});
export type CatalogTheme = z.infer<typeof CatalogThemeSchema>;

// ---- Layout: which set of section components renders this catalog ----
//
// "original" is Ariel's exact, untouched design (components/catalog/*.tsx)
// — every other id maps to a fully distinct Cover/ProductDetail/Statement
// component set under components/catalog/layouts/<id>/. Fixed at catalog
// creation (via the template carousel), not editable afterward — swapping
// a layout on existing content risks a mismatch between the layout's
// visual assumptions (e.g. one photo vs four per colorway) and the data.
export const LayoutIdSchema = z.enum([
  "original",
  "editorial-lux",
  "apple-minimal",
  "ikea-grid",
  "nike-bold",
  "zara-editorial",
  "japanese-minimal",
  "streetwear-dark",
  "architecture-grid",
  "modern-premium",
]);
export type LayoutId = z.infer<typeof LayoutIdSchema>;

// ---- Inventario: configuración del catálogo ----

/**
 * Control de stock del catálogo. Todo el bloque es opcional: un
 * catálogo sin él (todos los publicados hoy) se comporta exactamente
 * como siempre — no muestra stock, no consulta nada, no depende de
 * Google para nada.
 *
 * Acá viven solo datos de CONFIGURACIÓN, que cambian muy de vez en
 * cuando y por eso pueden viajar con el contenido del catálogo (que se
 * publica por commit). Los números de stock NO viven acá: cambian
 * seguido y van a Vercel Blob, para no pagar un commit y un redeploy
 * por cada movimiento.
 *
 * `spreadsheetId` y no la URL: el id es la identidad estable del
 * documento y la URL se arma a partir de él cuando hace falta abrirlo.
 */
/**
 * Colores de la barra de compra, editables por catálogo.
 *
 * Van acá y no en `CatalogThemeSchema` porque la barra solo existe con
 * inventario encendido: sumarlos al tema obligaría a todos los catálogos
 * —incluidos los que no venden— a cargar cuatro colores que no usan.
 *
 * Todos opcionales: sin ellos la barra usa el tema del catálogo, que es
 * como se ve hoy. El `regex` no es decorativo — estos valores terminan
 * dentro de un atributo `style`, así que un valor libre sería una vía de
 * inyección (mismo criterio que `TextColorsSchema`).
 */
const HexColor = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);

export const BuyBarStyleSchema = z.object({
  background: HexColor.optional(),
  text: HexColor.optional(),
  buttonBackground: HexColor.optional(),
  buttonText: HexColor.optional(),
});
export type BuyBarStyle = z.infer<typeof BuyBarStyleSchema>;

export const CatalogInventorySchema = z.object({
  enabled: z.boolean(),
  /** Colores de la barra de compra. Ausente = usa el tema del catálogo. */
  buyBar: BuyBarStyleSchema.optional(),
  /** Id de la hoja de Google asociada, una sola por catálogo. Ausente = todavía no se creó. */
  spreadsheetId: z.string().optional(),
  /**
   * Teléfono al que va el botón "Comprar por WhatsApp", en formato
   * internacional sin signos (ej. `51987654321`). Es del catálogo, no
   * del código: cada catálogo puede tener el suyo.
   */
  whatsappPhone: z.string().regex(/^[0-9]{6,15}$/).optional(),
});
export type CatalogInventory = z.infer<typeof CatalogInventorySchema>;

export const CatalogEntrySchema = z.object({
  layoutId: LayoutIdSchema.default("original"),
  theme: CatalogThemeSchema,
  blocks: CatalogBlocksSchema,
  inventory: CatalogInventorySchema.optional(),
});
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;

// ---- Inventario: las variantes que tiene un catálogo ----

/**
 * Una variante concreta del catálogo, ya resuelta: el modelo, el color,
 * su SKU y sus números si los tiene.
 *
 * `pageId` + `swatchIndex` son las coordenadas dentro del contenido (qué
 * página y cuál de sus colores), y sirven para volver a escribir sobre
 * la variante correcta al editar. El SKU es la identidad hacia afuera:
 * es lo que viaja a la hoja de Google y al Kardex.
 */
export type CatalogVariant = {
  pageId: string;
  swatchIndex: number;
  model: string;
  color: string;
  /** Presentes solo si el modelo declara esa dimensión. */
  size?: string;
  cut?: string;
  sku: string;
  inventory?: VariantInventory;
  /** Marcado a mano como agotado, independientemente del stock (ver `soldOut` en el swatch). */
  soldOut: boolean;
};

/**
 * Todas las variantes de un catálogo, en orden de documento.
 *
 * Es EL lugar donde se recorre el contenido para armar inventario, y
 * existe por dos motivos concretos: que la resolución de SKU repetidos
 * ocurra una sola vez (y no una copia distinta en cada consumidor), y
 * que el orden sea siempre el mismo para el mismo contenido — de ahí
 * sale que sincronizar dos veces seguidas produzca exactamente el mismo
 * resultado, que es lo que pide la hoja de Google.
 */
export function catalogVariants(blocks: CatalogBlocks): CatalogVariant[] {
  const variants: CatalogVariant[] = [];
  const taken = new Set<string>();

  for (const block of blocks) {
    if (block.type !== "productDetail") continue;
    const data = block.data;
    const dimensioned = hasVariantDimensions(data);

    // `[undefined]` y no `[]` cuando la dimensión no existe: así el
    // producto cartesiano da una sola vuelta por esa dimensión en vez
    // de ninguna, y un modelo sin tallas ni cortes produce exactamente
    // una variante por color — el comportamiento que ya tenía.
    const sizes: (string | undefined)[] = data.sizes?.length ? data.sizes : [undefined];
    const cuts: (string | undefined)[] = data.cuts?.length ? data.cuts.map((c) => c.label) : [undefined];

    data.swatches.forEach((swatch, swatchIndex) => {
      for (const size of sizes) {
        for (const cut of cuts) {
          const sku = variantSku({ model: data.name, color: swatch.label, size, cut }, taken);
          taken.add(sku);

          // De dónde sale el inventario según el esquema que use el
          // modelo. Con dimensiones: la cantidad del mapa por SKU, el
          // mínimo del modelo y el precio del color. Sin dimensiones:
          // el bloque que ya vivía colgado del color, intacto — es lo
          // que hace que el contenido publicado siga leyéndose igual
          // sin migrar nada.
          let inventory: VariantInventory | undefined;
          if (dimensioned) {
            const units = data.stock?.[sku];
            if (units !== undefined) {
              inventory = {
                stock: units,
                minStock: data.minStock ?? 0,
                price: swatch.inventory?.price,
              };
            }
          } else {
            inventory = swatch.inventory;
          }

          variants.push({
            pageId: data.id,
            swatchIndex,
            model: data.name,
            color: swatch.label,
            size,
            cut,
            sku,
            inventory,
            // El modelo entero agotado también agota cada uno de sus
            // colores — es la misma regla que ya aplica
            // components/catalog/soldOut.ts para pintar la página,
            // dicha una vez más acá porque el inventario razona por
            // variante, no por página.
            soldOut: swatch.soldOut === true || data.soldOut === true,
          });
        }
      }
    });
  }

  return variants;
}

/**
 * Estado de una variante para mostrar: junta el stock con el "agotado"
 * puesto a mano, que sigue mandando aunque haya unidades cargadas.
 * Devuelve `null` si la variante no tiene inventario cargado, para que
 * quien la muestre sepa distinguir "no controlo esto" de "hay cero".
 */
export function variantStatus(variant: CatalogVariant): StockStatus | null {
  if (variant.soldOut) return "OUT_OF_STOCK";
  if (!variant.inventory) return null;
  return stockStatus(variant.inventory.stock, variant.inventory.minStock);
}
