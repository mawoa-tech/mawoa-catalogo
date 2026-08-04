"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import type { Block, CatalogInventory, CatalogTheme, LayoutId } from "@/data/schema";
import { catalogVariants } from "@/data/schema";
import BlockList, { type EditableBlock } from "./BlockList";
import BlockForm from "./BlockForm";
import AddPageChooser from "./AddPageChooser";
import AdminPanel from "./AdminPanel";
import AssetGallery from "./AssetGallery";
import Glossary from "./Glossary";
import InventorySettings from "./InventorySettings";
import InventoryPanel from "./InventoryPanel";
import { InventoryProvider } from "./InventoryContext";
import ThemeEditor from "./fields/ThemeEditor";
import { useToast } from "./ToastContext";
import { saveCatalogAction } from "@/app/admin/actions";
import { CATALOG_TEMPLATES } from "@/lib/newCatalog";
import { defaultBlockFor } from "./defaultBlock";
import { scrollPreviewToPage } from "./previewScroll";

const LAYOUT_LABELS: Partial<Record<LayoutId, string>> = Object.fromEntries(
  CATALOG_TEMPLATES.map((t) => [t.layoutId, t.label])
);

const TYPE_LABELS: Record<Block["type"], string> = {
  cover: "Portada",
  manifesto: "Manifiesto",
  productHero: "Hero de producto",
  chapterHero: "Capítulo (transición de colorway)",
  productDetail: "Detalle de producto (colorway)",
  closing: "Cierre",
};

function makeKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

type Tab = "portada" | "paginas" | "imagenes" | "colores" | "inventario" | "ayuda";

const TABS: { id: Tab; label: string }[] = [
  { id: "portada", label: "Portada" },
  { id: "paginas", label: "Páginas" },
  { id: "imagenes", label: "Imágenes" },
  { id: "colores", label: "Colores" },
  { id: "inventario", label: "Inventario" },
  { id: "ayuda", label: "Ayuda" },
];

type AdminEditorProps = {
  catalogId: string;
  initialBlocks: Block[];
  initialTheme: CatalogTheme;
  /** Fijo al crear el catálogo (ver lib/newCatalog.ts) — no hay campo para editarlo acá a propósito: cambiarlo después podría dejar contenido que no calza con los supuestos visuales del layout nuevo. */
  layoutId: LayoutId;
  /** Ausente = este catálogo no usa control de stock (el caso de todo lo publicado hasta ahora). */
  initialInventory?: CatalogInventory;
  /** Acciones que tienen que seguir alcanzables aunque el panel esté colapsado (volver al listado, cerrar sesión) — vienen de app/admin/[id]/page.tsx, que sí sabe de <Link>/LogoutButton. */
  topbarActions?: ReactNode;
};

type SaveResult = Awaited<ReturnType<typeof saveCatalogAction>>;

export default function AdminEditor({
  catalogId,
  initialBlocks,
  initialTheme,
  layoutId,
  initialInventory,
  topbarActions,
}: AdminEditorProps) {
  const [items, setItems] = useState<EditableBlock[]>(() =>
    initialBlocks.map((block) => ({ key: makeKey(), block }))
  );
  const [theme, setTheme] = useState<CatalogTheme>(initialTheme);
  const [inventory, setInventory] = useState<CatalogInventory | undefined>(initialInventory);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<SaveResult | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [tab, setTab] = useState<Tab>("portada");
  const { showToast } = useToast();

  // La portada se edita directo en su propia pestaña, no como una
  // tarjeta más de la lista — se asume en índice 0 (así la arma tanto
  // el wizard como cada plantilla en lib/newCatalog.ts) para no tener
  // que reordenarla de vuelta a mano cada vez que cambia la pestaña
  // "Páginas".
  const coverIndex = items.findIndex((item) => item.block.type === "cover");
  const coverItem = coverIndex >= 0 ? items[coverIndex] : undefined;
  const pageItems = items.filter((_, i) => i !== coverIndex);

  const updateCover = (block: Block) => {
    if (coverIndex < 0) return;
    setItems(items.map((item, i) => (i === coverIndex ? { ...item, block } : item)));
  };

  const setPageItems = (next: EditableBlock[]) => {
    setItems(coverItem ? [coverItem, ...next] : next);
  };

  // Hace scroll del fondo en vivo (el catálogo real, siempre montado
  // detrás del panel — ver AdminPanel) hasta la página que se acaba de
  // abrir para editar o de mover, en vez de dejarlo donde haya quedado.
  // `pageItemsIndex` es el índice dentro de `pageItems` (lo que ve
  // BlockList); se le suma 1 si hay portada porque esta vive aparte, en
  // el índice 0 de `items` — que es el array real que ve AdminPanel. El
  // rAF espera a que React termine de aplicar el reorden/cambio de
  // estado antes de medir posiciones en el DOM; sin él se mide el orden
  // viejo, todavía no pintado.
  /**
   * Lleva el fondo en vivo a la página número `itemsIndex` (índice
   * dentro de `items`, el array real que se renderiza). Separado de
   * `focusLivePreview` porque la portada no vive en `pageItems` — se
   * edita en su propia pestaña — así que su índice no se puede expresar
   * como "índice de pageItems + 1".
   */
  const scrollLivePreviewTo = (itemsIndex: number) => scrollPreviewToPage(itemsIndex);

  /** Índice dentro de `items` de la página nº `pageItemsIndex` de la pestaña "Páginas". */
  const focusLivePreview = (pageItemsIndex: number) => {
    scrollLivePreviewTo(coverItem ? pageItemsIndex + 1 : pageItemsIndex);
  };

  /**
   * Cambiar de pestaña también mueve la vista previa cuando esa pestaña
   * corresponde a una página concreta. Antes solo lo hacía el listado de
   * "Páginas": al ir a "Portada" se editaba la portada mientras el fondo
   * seguía mostrando la página anterior — el mismo problema que el
   * colorway, en otro lugar. "Imágenes" y "Colores" no apuntan a ninguna
   * página en particular, así que no tocan el scroll.
   */
  const selectTab = (next: Tab) => {
    setTab(next);
    if (next === "portada" && coverIndex >= 0) {
      scrollLivePreviewTo(coverIndex);
      return;
    }
    // Los colores del tema (tinta, papel, líneas, texto secundario) se
    // ven casi todos en la página de detalle de producto: el resto de
    // las páginas son foto a pantalla completa con texto blanco fijo.
    // Quedarse en la portada al abrir "Colores" era exactamente el
    // motivo del reclamo "cambio los colores y no veo ningún cambio".
    if (next === "colores") {
      const detailIndex = items.findIndex((item) => item.block.type === "productDetail");
      if (detailIndex >= 0) scrollLivePreviewTo(detailIndex);
    }
  };

  /**
   * Pinta un texto puntual de una página, elegido clickeándolo en la
   * vista previa (ver AdminPanel + textColorTarget.ts). `color: null`
   * lo devuelve al color que le corresponde por diseño; cuando la
   * página se queda sin ningún color a mano, se borra la clave entera
   * en vez de guardar un objeto vacío.
   */
  const setTextColor = (blockIndex: number, selector: string, color: string | null) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== blockIndex) return item;
        const next = { ...(item.block.data.textColors ?? {}) };
        if (color === null) delete next[selector];
        else next[selector] = color;
        const textColors = Object.keys(next).length > 0 ? next : undefined;
        return {
          ...item,
          block: { ...item.block, data: { ...item.block.data, textColors } } as Block,
        };
      })
    );
  };

  const addSingle = (type: Exclude<Block["type"], "cover">) => {
    setPageItems([...pageItems, { key: makeKey(), block: defaultBlockFor(type) }]);
    showToast(`${TYPE_LABELS[type]} agregado`);
  };

  const addColorway = (blocks: [Block, Block]) => {
    setPageItems([...pageItems, ...blocks.map((block) => ({ key: makeKey(), block }))]);
  };

  // Precompletar el template de colorway con el nombre/tipo del producto
  // ya existente en el catálogo, en vez de arrancar en blanco.
  const heroBlock = items.find((item) => item.block.type === "productHero")?.block;
  const defaultProductName = heroBlock?.type === "productHero" ? heroBlock.data.name : "";
  const defaultProductType = heroBlock?.type === "productHero" ? heroBlock.data.type : "";

  /**
   * Los SKU se resuelven UNA vez sobre el catálogo completo y se
   * reparten ya listos: es la única forma de desempatar dos colores que
   * abrevian igual (cada campo por separado no ve al resto). Se
   * recalcula al tipear, que es exactamente lo que hace falta para que
   * el código mostrado siga al nombre mientras se edita.
   */
  const inventoryContext = useMemo(() => {
    const enabled = inventory?.enabled === true;
    const bySlot = new Map<string, string>();
    if (enabled) {
      for (const variant of catalogVariants(items.map((item) => item.block))) {
        // Dos claves por variante: la completa (color+talla+corte), que
        // es la que usa la grilla de stock, y la del color a secas, que
        // es la que pide el editor de colores. La del color se queda
        // con la PRIMERA combinación, no la última.
        const full = `${variant.pageId}\u0000${variant.swatchIndex}\u0000${variant.size ?? ""}\u0000${variant.cut ?? ""}`;
        bySlot.set(full, variant.sku);
        const base = `${variant.pageId}\u0000${variant.swatchIndex}\u0000\u0000`;
        if (!bySlot.has(base)) bySlot.set(base, variant.sku);
      }
    }
    return {
      enabled,
      skuOf: (pageId: string, swatchIndex: number, size?: string, cut?: string) =>
        bySlot.get(`${pageId}\u0000${swatchIndex}\u0000${size ?? ""}\u0000${cut ?? ""}`) ?? "",
    };
  }, [inventory?.enabled, items]);

  const handleSave = () => {
    setResult(null);
    startTransition(async () => {
      const res = await saveCatalogAction(
        catalogId,
        theme,
        items.map((item) => item.block),
        layoutId,
        inventory
      );
      setResult(res);
      if (res.ok) showToast("Guardado ✓");
    });
  };

  return (
    <AdminPanel
      blocks={items.map((item) => item.block)}
      theme={theme}
      layoutId={layoutId}
      inventory={inventory}
      title={catalogId}
      onTextColorChange={setTextColor}
      topbarActions={topbarActions}
      open={panelOpen}
      onOpenChange={setPanelOpen}
    >
      <InventoryProvider value={inventoryContext}>
      <div className="admin-idstrip">
        <p className="admin-idstrip-name">{catalogId}</p>
        <p className="admin-idstrip-meta">
          Plantilla: {LAYOUT_LABELS[layoutId] ?? layoutId} (fija al crear)
        </p>
      </div>

      <div className="admin-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`admin-tab${tab === t.id ? " active" : ""}`}
            onClick={() => selectTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="admin-tab-content">
        {tab === "portada" &&
          (coverItem ? (
            <BlockForm block={coverItem.block} onChange={updateCover} />
          ) : (
            <p>Este catálogo no tiene portada.</p>
          ))}

        {tab === "paginas" && (
          <BlockList
            items={pageItems}
            onChange={setPageItems}
            onFocusIndex={focusLivePreview}
            footer={
              <AddPageChooser
                defaultProductName={defaultProductName}
                defaultProductType={defaultProductType}
                onAddColorway={addColorway}
                onAddSingle={addSingle}
              />
            }
          />
        )}

        {tab === "imagenes" && <AssetGallery />}

        {tab === "colores" && <ThemeEditor theme={theme} onChange={setTheme} />}

        {tab === "inventario" && (
          <>
            <InventorySettings inventory={inventory} onChange={setInventory} />
            <InventoryPanel
              catalogId={catalogId}
              inventory={inventory}
              blocks={items.map((item) => item.block)}
            />
          </>
        )}

        {tab === "ayuda" && <Glossary />}
      </div>

      <div className="admin-save-bar">
        <button
          type="button"
          className="admin-btn admin-btn-primary"
          onClick={handleSave}
          disabled={isPending}
        >
          {isPending ? "Guardando…" : "Guardar y publicar"}
        </button>

        {result &&
          (result.ok ? (
            <p className="admin-save-message ok">
              Guardado.{" "}
              <a href={result.commitUrl} target="_blank" rel="noreferrer">
                Ver commit
              </a>
            </p>
          ) : (
            <div>
              <p className="admin-save-message error">{result.error}</p>
              {result.issues && (
                <ul className="admin-save-issues">
                  {result.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
      </div>
      </InventoryProvider>
    </AdminPanel>
  );
}
