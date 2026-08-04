import "server-only";
import { put, get as getBlob } from "@vercel/blob";
import { z } from "zod";

/**
 * Dónde vive el stock de verdad.
 *
 * NO en el repositorio, a diferencia del resto del contenido. El texto
 * de un catálogo cambia cada tanto y publicar por commit está bien; el
 * stock cambia todo el tiempo, y un commit + redespliegue por cada
 * movimiento llenaría el historial de ruido y tardaría 1-2 minutos en
 * verse. Vercel Blob ya está en el proyecto por exactamente el mismo
 * motivo (las fotos se mudaron ahí desde GitHub por lentitud), escribe
 * al instante y no dispara ningún build.
 *
 * Va en un store **aparte del de las fotos**, con acceso privado. No es
 * un capricho de orden: el acceso (público o privado) se define al crear
 * el store y vale para todo lo que tenga adentro, y el store de fotos
 * TIENE que ser público para poder servirlas. Intentar guardar un blob
 * privado ahí lo rechaza Vercel de plano ("Cannot use private access on
 * a public store").
 *
 * Privado importa acá: los nombres de archivo son predecibles, así que
 * en un store público las cantidades exactas quedarían al alcance de
 * cualquiera que armara la URL. Lo que sale al catálogo público es el
 * estado (disponible / últimas unidades / agotado), nunca el número.
 */

const INVENTORY_PREFIX = "inventario";

/**
 * Token propio, distinto de `BLOB_READ_WRITE_TOKEN` (el de las fotos):
 * cada store de Vercel Blob tiene el suyo y no son intercambiables.
 */
function inventoryToken(): string | undefined {
  return process.env.INVENTARIO_READ_WRITE_TOKEN;
}

export const InventoryItemSchema = z.object({
  stock: z.number().int(),
  minStock: z.number().int().nonnegative(),
  price: z.number().nonnegative().optional(),
});
export type InventoryItem = z.infer<typeof InventoryItemSchema>;

export const InventorySnapshotSchema = z.object({
  catalogId: z.string(),
  updatedAt: z.string(),
  /** Por SKU: es la identidad de la variante hacia afuera (hoja de Google incluida). */
  items: z.record(z.string(), InventoryItemSchema),
});
export type InventorySnapshot = z.infer<typeof InventorySnapshotSchema>;

function pathFor(catalogId: string): string {
  // El id ya viene normalizado por slugify() en todo camino que escribe
  // un catálogo, pero acá se vuelve a acotar: termina siendo una ruta
  // dentro del store, y confiar en que "alguien más ya lo limpió" es
  // justo el descuido que produjo el path traversal del upload
  // (auditoría 2026-07-30, S2).
  const safe = catalogId.replace(/[^a-z0-9-]/gi, "").toLowerCase();
  return `${INVENTORY_PREFIX}/${safe}.json`;
}

export function isInventoryStoreConfigured(): boolean {
  return Boolean(inventoryToken());
}

/**
 * Lee el stock vivo de un catálogo. Devuelve `null` si todavía no se
 * guardó ninguno — que es el estado normal de un catálogo que recién
 * encendió el inventario, no un error.
 *
 * `useCache: false` a propósito: el punto de tener el stock afuera del
 * repo es que un cambio se vea enseguida. La caché la pone después la
 * ruta pública que lo sirve, con su propio tiempo de vida controlado.
 */
export async function readInventory(catalogId: string): Promise<InventorySnapshot | null> {
  if (!isInventoryStoreConfigured()) return null;
  try {
    const result = await getBlob(pathFor(catalogId), {
      access: "private",
      useCache: false,
      token: inventoryToken(),
    });
    if (!result) return null;
    const text = await new Response(result.stream).text();
    const parsed = InventorySnapshotSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    // Un snapshot ilegible (borrado a mano, JSON cortado a la mitad) no
    // puede tumbar el catálogo público: se cae al stock que quedó
    // guardado en el contenido, que es viejo pero coherente.
    return null;
  }
}

export type WriteInventoryResult = { ok: true; updatedAt: string } | { ok: false; error: string };

/**
 * Guarda el stock vivo de un catálogo, pisando el anterior. Es un
 * snapshot completo y no un parche: el estado de un catálogo es corto
 * (una línea por variante) y reescribirlo entero evita cualquier
 * mezcla rara entre lo que había y lo que llega.
 */
export async function writeInventory(
  catalogId: string,
  items: Record<string, InventoryItem>
): Promise<WriteInventoryResult> {
  if (!isInventoryStoreConfigured()) {
    return {
      ok: false,
      error: "Falta configurar el almacenamiento de inventario (INVENTARIO_READ_WRITE_TOKEN).",
    };
  }

  const snapshot: InventorySnapshot = {
    catalogId,
    updatedAt: new Date().toISOString(),
    items,
  };

  const parsed = InventorySnapshotSchema.safeParse(snapshot);
  if (!parsed.success) {
    return { ok: false, error: "Los datos de inventario no tienen el formato esperado." };
  }

  try {
    await put(pathFor(catalogId), JSON.stringify(parsed.data), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      token: inventoryToken(),
    });
    return { ok: true, updatedAt: snapshot.updatedAt };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error desconocido al guardar el inventario.",
    };
  }
}
