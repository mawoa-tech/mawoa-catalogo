import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { catalogs, type CatalogId } from "@/data/catalogs";
import { listAssets, listUsedAssetPaths } from "@/lib/assets";
import { listDriveLinks } from "@/lib/driveLinks";
import { readInventory } from "@/lib/inventoryStore";
import { catalogVariants, type Block } from "@/data/schema";
import AdminEditor from "@/components/admin/AdminEditor";
import LogoutButton from "@/components/admin/LogoutButton";
import { AssetsProvider } from "@/components/admin/AssetsContext";

type AdminCatalogPageProps = {
  params: Promise<{ id: string }>;
};

/** Editor de un catálogo puntual — la misma pieza que antes vivía fija en /admin, ahora parametrizada por id. */
export default async function AdminCatalogPage({ params }: AdminCatalogPageProps) {
  await requireSession();
  const { id } = await params;

  if (!(id in catalogs)) {
    notFound();
  }

  const entry = catalogs[id as CatalogId];

  /**
   * El stock que se muestra en el panel sale del almacén vivo, no del
   * contenido: entre el último "Guardar y publicar" y ahora, el stock
   * pudo cambiar desde la hoja de Google. Sin esto el panel abriría con
   * números viejos y, al guardar, los volvería a escribir encima de los
   * nuevos — pisando ventas reales con datos de ayer.
   */
  const blocks = await withLiveStock(id, entry.blocks);

  const assets = await listAssets();
  const driveLinks = await listDriveLinks();
  const usedPaths = [...listUsedAssetPaths()];

  return (
    <AssetsProvider initialAssets={assets} initialDriveLinks={driveLinks} usedPaths={usedPaths} catalogId={id}>
      <AdminEditor
        catalogId={id}
        initialBlocks={blocks}
        initialTheme={entry.theme}
        layoutId={entry.layoutId}
        initialInventory={entry.inventory}
        topbarActions={
          <>
            <Link href="/admin" className="admin-btn">
              ← Catálogos
            </Link>
            <LogoutButton />
          </>
        }
      />
    </AssetsProvider>
  );
}

async function withLiveStock(catalogId: string, blocks: Block[]): Promise<Block[]> {
  const snapshot = await readInventory(catalogId);
  if (!snapshot) return blocks;

  // Se recorre con el mismo `catalogVariants` que arma los SKU para el
  // panel, la hoja y el catálogo público — así el número que se muestra
  // corresponde exactamente a la fila que se va a sincronizar.
  const skuBySlot = new Map<string, string>();
  for (const variant of catalogVariants(blocks)) {
    // La primera combinación del color (ver CatalogRenderer): con tallas
    // o cortes hay varias por color y este mapa es el del SKU base.
    const key = `${variant.pageId}\u0000${variant.swatchIndex}`;
    if (!skuBySlot.has(key)) skuBySlot.set(key, variant.sku);
  }

  return blocks.map((block) => {
    if (block.type !== "productDetail") return block;
    return {
      ...block,
      data: {
        ...block.data,
        swatches: block.data.swatches.map((swatch, i) => {
          if (!swatch.inventory) return swatch;
          const sku = skuBySlot.get(`${block.data.id}\u0000${i}`);
          const live = sku ? snapshot.items[sku] : undefined;
          return live ? { ...swatch, inventory: { ...swatch.inventory, ...live } } : swatch;
        }),
      },
    };
  });
}
