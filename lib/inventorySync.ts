import "server-only";
import { catalogVariants, stockStatus, type CatalogBlocks, type CatalogVariant } from "@/data/schema";
import { readInventory, writeInventory, type InventoryItem } from "@/lib/inventoryStore";
import {
  KARDEX_HEADER,
  PRODUCTS_HEADER,
  SHEET_CONFIG,
  SHEET_KARDEX,
  SHEET_PRODUCTS,
  appendRows,
  clearDataRows,
  describeSheetsError,
  ensureSheetStructure,
  readRange,
  writeRange,
  type KardexType,
} from "@/lib/googleSheets";

export type SyncResult =
  | { ok: true; rows: number; movements: number; updatedAt: string }
  | { ok: false; error: string };

/**
 * El stock efectivo de una variante: el del almacén vivo si existe (lo
 * que pudo cambiar desde la hoja), y si no el guardado en el contenido.
 * Es la misma regla que ya usa la ruta pública de disponibilidad, dicha
 * una vez más acá porque la sincronización razona por SKU.
 */
function effectiveStock(
  variant: CatalogVariant,
  live: Record<string, InventoryItem> | undefined
): InventoryItem | undefined {
  return live?.[variant.sku] ?? variant.inventory;
}

/**
 * Catálogo → hoja. Reescribe PRODUCTOS entero a partir del contenido
 * actual.
 *
 * Reescribir en vez de parchear fila por fila es deliberado: el listado
 * de variantes es corto (decenas de filas), se deriva por completo del
 * contenido, y así la operación es IDEMPOTENTE por construcción —
 * sincronizar dos veces seguidas deja exactamente lo mismo, sin
 * duplicados ni filas huérfanas de una variante que se renombró. El
 * KARDEX **no** se toca: es histórico y solo se le agregan filas.
 */
export async function syncToSheet(
  spreadsheetId: string,
  catalogId: string,
  catalogName: string,
  blocks: CatalogBlocks
): Promise<SyncResult> {
  try {
    await ensureSheetStructure(spreadsheetId, { catalogId, catalogName });

    const snapshot = await readInventory(catalogId);
    const variants = catalogVariants(blocks);

    const rows = variants.map((v) => {
      const inv = effectiveStock(v, snapshot?.items);
      const stock = inv?.stock ?? 0;
      const minStock = inv?.minStock ?? 0;
      return [
        v.sku,
        v.model,
        v.color,
        v.size ?? "",
        v.cut ?? "",
        inv?.price ?? "",
        stock,
        minStock,
        v.soldOut ? "OUT_OF_STOCK" : stockStatus(stock, minStock),
      ];
    });

    await clearDataRows(spreadsheetId, SHEET_PRODUCTS);
    await writeRange(spreadsheetId, `${SHEET_PRODUCTS}!A1`, [[...PRODUCTS_HEADER], ...rows]);

    const updatedAt = new Date().toISOString();
    await writeRange(spreadsheetId, `${SHEET_CONFIG}!A4`, [["ULTIMA_SINCRONIZACION", updatedAt]]);

    return { ok: true, rows: rows.length, movements: 0, updatedAt };
  } catch (err) {
    return { ok: false, error: describeSheetsError(err) };
  }
}

/**
 * Hoja → catálogo. Lee PRODUCTOS, detecta las diferencias de stock
 * contra lo que la aplicación tenía, guarda el nuevo estado y **agrega**
 * al KARDEX un movimiento por cada diferencia.
 *
 * Idempotencia, que es lo delicado acá: el movimiento se registra solo
 * cuando el número de la hoja difiere del que la aplicación tenía
 * guardado. Sincronizar dos veces seguidas sin tocar la hoja detecta
 * cero diferencias la segunda vez y no escribe nada — no hace falta
 * llevar un registro de "qué ya sincronicé", porque el propio estado
 * guardado cumple ese papel.
 */
export async function syncFromSheet(
  spreadsheetId: string,
  catalogId: string,
  catalogName: string,
  blocks: CatalogBlocks
): Promise<SyncResult> {
  try {
    await ensureSheetStructure(spreadsheetId, { catalogId, catalogName });

    const values = await readRange(spreadsheetId, `${SHEET_PRODUCTS}!A2:I100000`);
    const variants = new Map(catalogVariants(blocks).map((v) => [v.sku, v]));
    const snapshot = await readInventory(catalogId);
    const previous = snapshot?.items ?? {};

    const items: Record<string, InventoryItem> = {};
    const movements: (string | number)[][] = [];
    const now = new Date().toISOString();

    for (const row of values) {
      const sku = (row[0] ?? "").trim();
      if (!sku) continue;

      // Una fila cuyo SKU ya no existe en el catálogo se ignora: pudo
      // renombrarse el color o borrarse la variante. No se borra del
      // Kardex ni de la hoja — el historial es histórico.
      const variant = variants.get(sku);
      if (!variant) continue;

      const stock = parseIntSafe(row[6]);
      if (stock === null) continue; // celda vacía o texto: no es un dato, no un cero

      const minStock = parseIntSafe(row[7]) ?? variant.inventory?.minStock ?? 0;
      const price = parseFloatSafe(row[5]) ?? variant.inventory?.price;

      items[sku] = { stock, minStock, ...(price !== undefined ? { price } : {}) };

      const before = previous[sku]?.stock ?? variant.inventory?.stock ?? 0;
      if (before !== stock) {
        const delta = stock - before;
        movements.push([
          now,
          sku,
          variant.model,
          variant.color,
          variant.size ?? "",
          variant.cut ?? "",
          kardexTypeFor(delta),
          Math.abs(delta),
          stock,
          "Sincronización desde Google Sheets",
          `Anterior: ${before}`,
        ]);
      }
    }

    // Las variantes que la hoja no trajo conservan lo que ya tenían: una
    // fila borrada a mano de la hoja no puede significar "poné todo en
    // cero" — sería destruir stock real por un descuido de edición.
    for (const [sku, item] of Object.entries(previous)) {
      if (!(sku in items)) items[sku] = item;
    }

    const written = await writeInventory(catalogId, items);
    if (!written.ok) return { ok: false, error: written.error };

    if (movements.length > 0) {
      await appendRows(spreadsheetId, `${SHEET_KARDEX}!A1`, movements);
    }
    await writeRange(spreadsheetId, `${SHEET_CONFIG}!A4`, [["ULTIMA_SINCRONIZACION", written.updatedAt]]);

    return {
      ok: true,
      rows: Object.keys(items).length,
      movements: movements.length,
      updatedAt: written.updatedAt,
    };
  } catch (err) {
    return { ok: false, error: describeSheetsError(err) };
  }
}

/**
 * Qué clase de movimiento representa una diferencia. Subir es ENTRADA y
 * bajar es SALIDA porque es lo que ocurre el 99% de las veces (reposición
 * y venta); AJUSTE y DEVOLUCION existen en el Kardex para cargarse a
 * mano, ya que desde una diferencia de números no hay forma de
 * distinguirlos — inventar la intención sería peor que no saberla.
 */
function kardexTypeFor(delta: number): KardexType {
  return delta > 0 ? "ENTRADA" : "SALIDA";
}

function parseIntSafe(raw: string | undefined): number | null {
  if (raw === undefined || String(raw).trim() === "") return null;
  const n = Number.parseInt(String(raw).replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function parseFloatSafe(raw: string | undefined): number | undefined {
  if (raw === undefined || String(raw).trim() === "") return undefined;
  const n = Number.parseFloat(String(raw).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Movimientos del Kardex, para mostrarlos en el panel (Fase 7). */
export type KardexRow = {
  date: string;
  sku: string;
  model: string;
  color: string;
  size: string;
  cut: string;
  type: string;
  quantity: number;
  balance: number;
  reason: string;
  note: string;
};

export async function readKardex(spreadsheetId: string): Promise<KardexRow[]> {
  const values = await readRange(spreadsheetId, `${SHEET_KARDEX}!A2:K100000`);
  return values
    .filter((row) => (row[1] ?? "").trim() !== "")
    .map((row) => ({
      date: row[0] ?? "",
      sku: row[1] ?? "",
      model: row[2] ?? "",
      color: row[3] ?? "",
      size: row[4] ?? "",
      cut: row[5] ?? "",
      type: row[6] ?? "",
      quantity: parseIntSafe(row[7]) ?? 0,
      balance: parseIntSafe(row[8]) ?? 0,
      reason: row[9] ?? "",
      note: row[10] ?? "",
    }))
    .reverse(); // el más reciente primero: es lo que se quiere ver al abrir
}

export { KARDEX_HEADER };
