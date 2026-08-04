"use client";

import type { StockStatus, SwatchItem, VariantInventory } from "@/data/schema";
import { stockStatus } from "@/data/schema";
import ImagePicker from "../ImagePicker";
import { useInventory } from "../InventoryContext";

type SwatchesEditorProps = {
  swatches: SwatchItem[];
  onChange: (swatches: SwatchItem[]) => void;
  /** Identificador de la página a la que pertenecen estos colores — con él se busca el SKU ya resuelto. */
  pageId?: string;
  /** El modelo entero está marcado como agotado: pisa el estado de cada uno de sus colores. */
  pageSoldOut?: boolean;
  /**
   * El modelo declara tallas y/o cortes. En ese caso el stock ya no es
   * del color sino de la combinación (se carga en la grilla de
   * VariantsEditor) y acá queda solo el precio, que sí sigue siendo del
   * color. Mostrar los dos lugares a la vez sería ofrecer dos campos
   * para el mismo número, y uno de ellos no se usaría.
   */
  dimensioned?: boolean;
};

const STATUS_LABEL: Record<StockStatus, string> = {
  AVAILABLE: "Disponible",
  LOW_STOCK: "Últimas unidades",
  OUT_OF_STOCK: "Agotado",
};

const STATUS_CLASS: Record<StockStatus, string> = {
  AVAILABLE: "ok",
  LOW_STOCK: "low",
  OUT_OF_STOCK: "out",
};

export default function SwatchesEditor({
  swatches,
  onChange,
  pageId = "",
  pageSoldOut = false,
  dimensioned = false,
}: SwatchesEditorProps) {
  const { enabled: inventoryEnabled, skuOf } = useInventory();

  const update = (i: number, next: SwatchItem) => {
    onChange(swatches.map((s, idx) => (idx === i ? next : s)));
  };
  const remove = (i: number) => onChange(swatches.filter((_, idx) => idx !== i));
  const add = () => onChange([...swatches, { label: "", type: "image", image: "/imagenes/placeholder-20260802-4dbc0b18.webp" }]);

  const setType = (i: number, type: "image" | "color") => {
    const current = swatches[i];
    // `soldOut` y `inventory` se conservan al cambiar de foto a color y
    // viceversa: son estados del color en sí, no de cómo se lo dibuja.
    if (type === "image") {
      update(i, {
        label: current.label,
        type: "image",
        image: current.type === "image" ? current.image : "/imagenes/placeholder-20260802-4dbc0b18.webp",
        soldOut: current.soldOut,
        inventory: current.inventory,
      });
    } else {
      update(i, {
        label: current.label,
        type: "color",
        color: current.type === "color" ? current.color : "#cccccc",
        soldOut: current.soldOut,
        inventory: current.inventory,
      });
    }
  };

  /** Empieza a controlar el stock de este color. Arranca en 0: no hay ninguna cantidad razonable que suponer por nadie. */
  const startInventory = (i: number) => update(i, { ...swatches[i], inventory: { stock: 0, minStock: 0 } });
  const stopInventory = (i: number) => update(i, { ...swatches[i], inventory: undefined });
  const setInventory = (i: number, patch: Partial<VariantInventory>) => {
    const current = swatches[i].inventory ?? { stock: 0, minStock: 0 };
    update(i, { ...swatches[i], inventory: { ...current, ...patch } });
  };

  /**
   * Lo que escribe la persona puede ser "" (borró el campo) o algo que
   * no es número. En los dos casos se toma 0 en vez de guardar `NaN`,
   * que rompería la validación al guardar con un mensaje incomprensible.
   */
  const toNumber = (raw: string): number => {
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  };

  const statusOf = (swatch: SwatchItem): StockStatus | null => {
    if (swatch.soldOut === true || pageSoldOut) return "OUT_OF_STOCK";
    if (!swatch.inventory) return null;
    return stockStatus(swatch.inventory.stock, swatch.inventory.minStock);
  };

  return (
    <div className="admin-field">
      {/* Sin <label> propio: el único lugar donde se usa este editor ya
          está dentro del grupo "Colores" de BlockForm, y repetir el
          título dos veces seguidas se lee como si fueran dos cosas. */}
      <div className="admin-list-editor">
        {swatches.map((swatch, i) => {
          const status = statusOf(swatch);
          return (
            <div className="admin-swatch-item" key={i}>
              <div className="admin-swatch-row">
                <input
                  type="text"
                  placeholder="Nombre (ej. Negro)"
                  value={swatch.label}
                  onChange={(e) => update(i, { ...swatch, label: e.target.value })}
                />
                <select value={swatch.type} onChange={(e) => setType(i, e.target.value as "image" | "color")}>
                  <option value="image">Foto</option>
                  <option value="color">Color</option>
                </select>
                {swatch.type === "image" ? (
                  <ImagePicker value={swatch.image} onChange={(v) => update(i, { ...swatch, image: v })} />
                ) : (
                  <input
                    type="color"
                    value={swatch.color}
                    onChange={(e) => update(i, { ...swatch, color: e.target.value })}
                  />
                )}
                <label className="admin-checkbox admin-checkbox-inline" title="Este color está agotado">
                  <input
                    type="checkbox"
                    checked={swatch.soldOut === true}
                    onChange={(e) => update(i, { ...swatch, soldOut: e.target.checked || undefined })}
                  />
                  <span>Agotado</span>
                </label>
                <button
                  type="button"
                  className="admin-btn admin-btn-icon admin-btn-danger"
                  onClick={() => remove(i)}
                  aria-label="Quitar color"
                >
                  ✕
                </button>
              </div>

              {inventoryEnabled && (
                <div className="admin-swatch-inventory">
                  {swatch.inventory ? (
                    <>
                      <span className="admin-sku" title="Se arma solo con el nombre del modelo y el del color">
                        {skuOf(pageId, i) || "—"}
                      </span>
                      <label className="admin-mini-field">
                        <span>Precio</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="ej. 249"
                          value={swatch.inventory.price ?? ""}
                          onChange={(e) =>
                            setInventory(i, {
                              price: e.target.value === "" ? undefined : Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      {dimensioned ? (
                        <span className="admin-field-hint">
                          El stock de este color se carga por talla y corte, abajo.
                        </span>
                      ) : (
                        <>
                          <label className="admin-mini-field">
                            <span>Stock</span>
                            <input
                              type="number"
                              step="1"
                              value={swatch.inventory.stock}
                              onChange={(e) => setInventory(i, { stock: toNumber(e.target.value) })}
                            />
                          </label>
                          <label className="admin-mini-field">
                            <span>Mínimo</span>
                            <input
                              type="number"
                              min={0}
                              step="1"
                              value={swatch.inventory.minStock}
                              onChange={(e) => setInventory(i, { minStock: Math.max(0, toNumber(e.target.value)) })}
                            />
                          </label>
                          {status && (
                            <span className={`admin-stock-pill ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
                          )}
                        </>
                      )}
                      <button
                        type="button"
                        className="admin-btn"
                        onClick={() => stopInventory(i)}
                        title={
                          dimensioned
                            ? "Quita el precio de este color (el stock vive en la grilla de abajo)"
                            : "Deja de controlar el stock de este color (no borra el color)"
                        }
                      >
                        {dimensioned ? "Quitar precio" : "Quitar stock"}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="admin-stock-pill none">
                        {dimensioned ? "Sin precio cargado" : "Sin stock cargado"}
                      </span>
                      <button type="button" className="admin-btn" onClick={() => startInventory(i)}>
                        {dimensioned ? "Cargar precio" : "Cargar stock"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <button type="button" className="admin-btn" onClick={add}>
          + Agregar color
        </button>
      </div>
      {inventoryEnabled && (
        <p className="admin-field-hint">
          El código (SKU) se arma solo con el nombre del modelo y el del color.{" "}
          {dimensioned
            ? "Como este modelo tiene tallas o cortes, acá va solo el precio: las unidades se cargan en la grilla de abajo."
            : "“Mínimo” es a partir de cuántas unidades avisar que quedan pocas."}
        </p>
      )}
    </div>
  );
}
