"use server";

import { requireSession } from "@/lib/session";
import {
  saveCatalog,
  createCatalog,
  deleteCatalog,
  type SaveCatalogResult,
  type CreateCatalogResult,
  type DeleteCatalogResult,
} from "@/lib/catalogStore";
import { upsertDriveLink, type UpsertDriveLinkResult, type DriveLink } from "@/lib/driveLinks";
import { deleteAsset, type DeleteAssetResult } from "@/lib/assets";
import { catalogVariants } from "@/data/schema";
import { writeInventory, type InventoryItem } from "@/lib/inventoryStore";
import type { Block, CatalogInventory, CatalogTheme, LayoutId } from "@/data/schema";

/**
 * Segunda verificación de sesión acá adentro (además del proxy) —
 * ninguna mutación real debe depender únicamente del redirect del
 * proxy para estar protegida.
 */
export async function saveCatalogAction(
  catalogId: string,
  theme: CatalogTheme,
  blocks: Block[],
  layoutId: LayoutId,
  /** Ausente = el catálogo no usa control de stock; se guarda tal cual, sin inventar un bloque vacío. */
  inventory?: CatalogInventory
): Promise<SaveCatalogResult> {
  await requireSession();

  // pageNumber se deriva de la posición en el arreglo, nunca se edita a
  // mano: evita huecos o duplicados si el admin reordenó o agregó
  // bloques antes de guardar.
  const withPageNumbers = blocks.map((block, i) => ({
    ...block,
    data: { ...block.data, pageNumber: i + 1 },
  })) as Block[];

  // layoutId no se edita desde el admin (se fija al crear el catálogo,
  // ver lib/newCatalog.ts) — acá solo se re-persiste tal cual llegó.
  const result = await saveCatalog(catalogId, { layoutId, theme, blocks: withPageNumbers, inventory });

  /**
   * El stock también se escribe en su propio almacén (Vercel Blob), no
   * solo dentro del contenido. Los dos guardan lo mismo en este momento,
   * pero cumplen funciones distintas: el contenido viaja con el commit y
   * tarda 1-2 minutos en publicarse, mientras que el almacén se lee al
   * instante y es el que después va a actualizar la hoja de Google sin
   * pasar por un commit.
   *
   * Va DESPUÉS del guardado y sin poder revertirlo: si el commit salió
   * bien pero esto falla, el catálogo igual quedó publicado y correcto —
   * simplemente el stock vivo sigue siendo el anterior hasta el próximo
   * guardado o sincronización. Al revés (escribir el stock de algo que
   * no se llegó a publicar) sí sería incoherente.
   */
  if (result.ok && inventory?.enabled) {
    const items: Record<string, InventoryItem> = {};
    for (const variant of catalogVariants(withPageNumbers)) {
      if (variant.inventory) items[variant.sku] = { ...variant.inventory };
    }
    await writeInventory(catalogId, items);
  }

  return result;
}

export async function createCatalogAction(id: string, candidateEntry: unknown): Promise<CreateCatalogResult> {
  await requireSession();
  return createCatalog(id, candidateEntry);
}

export async function deleteCatalogAction(id: string): Promise<DeleteCatalogResult> {
  await requireSession();
  return deleteCatalog(id);
}

export async function deleteAssetAction(assetPath: string): Promise<DeleteAssetResult> {
  await requireSession();
  return deleteAsset(assetPath);
}

export async function recordDriveLinkAction(
  path: string,
  provider: DriveLink["provider"],
  fileId: string,
  fileName: string
): Promise<UpsertDriveLinkResult> {
  await requireSession();
  return upsertDriveLink({ path, provider, fileId, fileName, lastSyncedAt: new Date().toISOString() });
}
