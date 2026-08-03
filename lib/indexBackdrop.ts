import type { Block, CatalogEntry } from "@/data/schema";
import { CATALOG_TEMPLATES } from "./newCatalog";

/**
 * Fotos para el mural animado del índice ("/", ver components/index/CatalogWall.tsx).
 *
 * La fuente son las fotos que los catálogos publicados ya usan — no hay
 * un segundo lugar donde mantener imágenes de fondo al día, y el mural
 * crece solo a medida que se publican catálogos, igual que la grilla de
 * tarjetas.
 *
 * Cuando todavía no hay catálogos (estado real de un sitio recién
 * puesto en línea) o hay muy pocas fotos para llenar las columnas, se
 * completa con las fotos de las plantillas de creación
 * (lib/newCatalog.ts) — son fotos reales del repo, mantenidas junto a
 * las plantillas, así que no hay una tercera lista que se pueda
 * desactualizar sola.
 */

const COLUMNS = 5;
const TILES_PER_COLUMN = 4;
const MIN_IMAGES = COLUMNS * TILES_PER_COLUMN;

function imagesOfBlock(block: Block): string[] {
  switch (block.type) {
    case "cover":
    case "manifesto":
    case "productHero":
    case "chapterHero":
    case "closing":
      return [block.data.bgImage];
    case "productDetail":
      return block.data.collageImages.map((image) => image.src);
    default: {
      const exhaustive: never = block;
      return exhaustive;
    }
  }
}

/**
 * Hash determinista (FNV-1a). El orden del mural no puede salir de
 * Math.random: la página se renderiza en el servidor y el HTML tiene
 * que ser idéntico al que el cliente hidrata.
 */
function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function unique(paths: string[]): string[] {
  return [...new Set(paths.filter(Boolean))];
}

function templateImages(): string[] {
  return unique(
    CATALOG_TEMPLATES.flatMap((template) =>
      template.build(template.label, template.id, "2026").flatMap(imagesOfBlock)
    )
  );
}

/**
 * Devuelve una columna por cada franja del mural, ya repartidas y
 * completadas. Cada columna se repite en el DOM para el loop sin corte
 * (ver CatalogWall), así que acá van solo las fotos únicas de esa
 * columna.
 */
export function getBackdropColumns(catalogs: Record<string, CatalogEntry>): string[][] {
  const fromCatalogs = unique(
    Object.values(catalogs).flatMap((entry) => entry.blocks.flatMap(imagesOfBlock))
  );

  const pool = [...fromCatalogs];
  if (pool.length < MIN_IMAGES) {
    for (const path of templateImages()) {
      if (pool.length >= MIN_IMAGES) break;
      if (!pool.includes(path)) pool.push(path);
    }
  }

  if (pool.length === 0) return [];

  // Mezclado determinista: si no, columnas contiguas mostrarían las
  // fotos de un mismo catálogo en el orden en que están en el JSON.
  const shuffled = [...pool].sort((a, b) => hash(a) - hash(b));

  return Array.from({ length: COLUMNS }, (_, column) =>
    Array.from(
      { length: TILES_PER_COLUMN },
      (_, tile) => shuffled[(column * TILES_PER_COLUMN + tile) % shuffled.length]
    )
  );
}
