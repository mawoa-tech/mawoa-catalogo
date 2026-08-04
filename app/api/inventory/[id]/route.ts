import { NextResponse } from "next/server";
import { catalogs } from "@/data/catalogs";
import { catalogVariants, stockStatus, type StockStatus } from "@/data/schema";
import { readInventory } from "@/lib/inventoryStore";

/**
 * Disponibilidad pública de un catálogo: un solo pedido por página del
 * catálogo, no uno por producto ni por color.
 *
 * Devuelve **solo el estado** de cada SKU, nunca la cantidad. El
 * visitante necesita saber si puede comprar; cuántas unidades quedan es
 * información del negocio.
 *
 * Es público a propósito (no pide sesión): lo consume el catálogo, que
 * es público. Lo que sí está protegido es el número exacto, que nunca
 * sale de acá.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const entry = catalogs[id];
  if (!entry || entry.inventory?.enabled !== true) {
    // No es un error: un catálogo puede existir y no llevar inventario.
    // Se responde igual para no filtrar qué ids existen y cuáles no.
    return NextResponse.json({ enabled: false, statuses: {} }, { headers: cacheHeaders() });
  }

  const snapshot = await readInventory(id);
  const statuses: Record<string, StockStatus> = {};

  for (const variant of catalogVariants(entry.blocks)) {
    // El stock guardado en el contenido es el último que se escribió
    // desde el panel; el del snapshot es el que puede haber cambiado
    // después desde la hoja de Google. Cuando existen los dos, manda el
    // snapshot: es el más nuevo por definición.
    const live = snapshot?.items[variant.sku];
    const source = live ?? variant.inventory;

    statuses[variant.sku] = variant.soldOut
      ? "OUT_OF_STOCK"
      : source
        ? stockStatus(source.stock, source.minStock)
        : "OUT_OF_STOCK";
  }

  return NextResponse.json(
    { enabled: true, updatedAt: snapshot?.updatedAt ?? null, statuses },
    { headers: cacheHeaders() }
  );
}

/**
 * Caché corta en el CDN con `stale-while-revalidate`: el visitante
 * recibe una respuesta instantánea (posiblemente de hasta 30s atrás) y
 * el CDN la renueva por detrás. Sin esto, cada visita golpearía el
 * almacén de inventario, y con esto de más el stock quedaría viejo.
 */
function cacheHeaders(): HeadersInit {
  return { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300" };
}
