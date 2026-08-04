"use client";

import type { Cut, ProductVariant, SwatchItem } from "@/data/schema";
import { stockStatus } from "@/data/schema";
import ImagePicker from "../ImagePicker";
import { useInventory } from "../InventoryContext";

type VariantsEditorProps = {
  data: ProductVariant;
  onChange: (patch: Partial<ProductVariant>) => void;
};

/**
 * Juegos de tallas frecuentes, para no tener que tipear una por una.
 * "Talla única" existe como opción propia porque es un caso real y no
 * una lista vacía: el modelo tiene una sola talla, no ninguna.
 */
const SIZE_PRESETS: { label: string; sizes: string[] }[] = [
  { label: "XS a XL", sizes: ["XS", "S", "M", "L", "XL"] },
  { label: "S a L", sizes: ["S", "M", "L"] },
  { label: "Talla única", sizes: ["Standard"] },
];

const PLACEHOLDER_IMAGE = "/imagenes/placeholder-20260802-4dbc0b18.webp";

/**
 * Tallas, cortes y el stock de cada combinación.
 *
 * Por qué una grilla y no una lista: el stock vive en la combinación
 * color × talla × corte, y un modelo con 3 colores, 4 tallas y 3 cortes
 * son 36 números. Una lista de 36 filas con su SKU es literal pero
 * imposible de completar sin perderse; una grilla por color, con las
 * tallas en filas y los cortes en columnas, deja ver de un vistazo qué
 * falta cargar y en qué fila va cada cosa.
 *
 * El precio no está acá: es del color y vive en el editor de colores.
 * El mínimo tampoco es por combinación: es uno por modelo.
 */
export default function VariantsEditor({ data, onChange }: VariantsEditorProps) {
  const { enabled, skuOf } = useInventory();
  const sizes = data.sizes ?? [];
  const cuts = data.cuts ?? [];
  const stock = data.stock ?? {};

  // Filas y columnas de la grilla. Cuando una dimensión no existe se usa
  // una sola fila/columna sin etiqueta, para que la grilla siga siendo
  // la misma tabla en vez de tres diseños distintos según qué haya
  // cargado (es también como razona catalogVariants en data/schema.ts).
  const rows: (string | undefined)[] = sizes.length ? sizes : [undefined];
  const cols: (string | undefined)[] = cuts.length ? cuts.map((c) => c.label) : [undefined];
  const hasDimensions = sizes.length > 0 || cuts.length > 0;

  const setStock = (sku: string, raw: string) => {
    const next = { ...stock };
    if (raw.trim() === "") {
      // Vaciar la celda NO es "cero unidades": es "todavía no cargué
      // esto". Se quita la clave para que el sistema lo distinga.
      delete next[sku];
    } else {
      const n = Number.parseInt(raw, 10);
      next[sku] = Number.isFinite(n) ? n : 0;
    }
    onChange({ stock: Object.keys(next).length ? next : undefined });
  };

  // ---- tallas ----
  const setSizes = (next: string[]) => onChange({ sizes: next.length ? next : undefined });
  const addSize = () => setSizes([...sizes, ""]);
  const updateSize = (i: number, value: string) => setSizes(sizes.map((s, idx) => (idx === i ? value : s)));
  const removeSize = (i: number) => setSizes(sizes.filter((_, idx) => idx !== i));

  // ---- cortes ----
  const setCuts = (next: Cut[]) => onChange({ cuts: next.length ? next : undefined });
  const addCut = () => setCuts([...cuts, { label: "", image: PLACEHOLDER_IMAGE }]);
  const updateCut = (i: number, patch: Partial<Cut>) =>
    setCuts(cuts.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const removeCut = (i: number) => setCuts(cuts.filter((_, idx) => idx !== i));

  if (!enabled) {
    return (
      <p className="admin-field-hint">
        Las tallas y los cortes se cargan con el control de inventario encendido (pestaña Inventario).
      </p>
    );
  }

  return (
    <div className="admin-variants">
      {/* ---------- Tallas ---------- */}
      <div className="admin-field">
        <label>Tallas</label>
        {sizes.length === 0 ? (
          <div className="admin-variant-presets">
            <span className="admin-field-hint">Este modelo no maneja tallas.</span>
            {SIZE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="admin-btn"
                onClick={() => setSizes(preset.sizes)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="admin-chips">
            {sizes.map((size, i) => (
              <span className="admin-chip" key={i}>
                <input
                  type="text"
                  value={size}
                  placeholder="ej. M"
                  onChange={(e) => updateSize(i, e.target.value)}
                  aria-label={`Talla ${i + 1}`}
                />
                <button type="button" onClick={() => removeSize(i)} aria-label={`Quitar talla ${size || i + 1}`}>
                  ✕
                </button>
              </span>
            ))}
            <button type="button" className="admin-btn" onClick={addSize}>
              + Talla
            </button>
          </div>
        )}
      </div>

      {/* ---------- Cortes ---------- */}
      <div className="admin-field">
        <label>Cortes</label>
        {cuts.length === 0 ? (
          <div className="admin-variant-presets">
            <span className="admin-field-hint">Este modelo no maneja cortes (hilo, semihilo, tanga…).</span>
            <button type="button" className="admin-btn" onClick={addCut}>
              + Agregar corte
            </button>
          </div>
        ) : (
          <div className="admin-list-editor">
            {cuts.map((cut, i) => (
              <div className="admin-cut-row" key={i}>
                <input
                  type="text"
                  placeholder="Nombre (ej. Hilo)"
                  value={cut.label}
                  onChange={(e) => updateCut(i, { label: e.target.value })}
                />
                <ImagePicker value={cut.image} onChange={(v) => updateCut(i, { image: v })} />
                <button
                  type="button"
                  className="admin-btn admin-btn-icon admin-btn-danger"
                  onClick={() => removeCut(i)}
                  aria-label="Quitar corte"
                >
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className="admin-btn" onClick={addCut}>
              + Agregar corte
            </button>
          </div>
        )}
        {cuts.length > 0 && (
          <p className="admin-field-hint">
            La foto del corte se muestra al visitante para que elija mirando, no leyendo.
          </p>
        )}
      </div>

      {/* ---------- Mínimo del modelo ---------- */}
      {hasDimensions && (
        <div className="admin-field">
          <label>Avisar “últimas unidades” desde</label>
          <input
            type="number"
            min={0}
            step="1"
            value={data.minStock ?? 0}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              onChange({ minStock: Number.isFinite(n) && n > 0 ? n : undefined });
            }}
          />
          <p className="admin-field-hint">
            Vale para todas las combinaciones de este modelo. Con 2, una combinación con 2 o menos unidades
            aparece como “últimas unidades”.
          </p>
        </div>
      )}

      {/* ---------- Grilla de stock ---------- */}
      {hasDimensions && (
        <div className="admin-field">
          <label>Stock por combinación</label>
          {data.swatches.length === 0 ? (
            <p className="admin-field-hint">Agregá al menos un color para poder cargar stock.</p>
          ) : (
            data.swatches.map((swatch, swatchIndex) => (
              <StockGrid
                key={swatchIndex}
                swatch={swatch}
                rows={rows}
                cols={cols}
                minStock={data.minStock ?? 0}
                stock={stock}
                skuFor={(size, cut) => skuOf(data.id, swatchIndex, size, cut)}
                onSet={setStock}
              />
            ))
          )}
          <p className="admin-field-hint">
            Una celda vacía significa “todavía no cargado”, y el catálogo la muestra como agotada hasta que
            pongas un número. El código (SKU) de cada combinación se arma solo.
          </p>
        </div>
      )}
    </div>
  );
}

function StockGrid({
  swatch,
  rows,
  cols,
  minStock,
  stock,
  skuFor,
  onSet,
}: {
  swatch: SwatchItem;
  rows: (string | undefined)[];
  cols: (string | undefined)[];
  minStock: number;
  stock: Record<string, number>;
  skuFor: (size?: string, cut?: string) => string;
  onSet: (sku: string, raw: string) => void;
}) {
  return (
    <div className="admin-stock-grid">
      <p className="admin-stock-grid-title">
        {swatch.type === "color" && <span className="admin-stock-grid-chip" style={{ background: swatch.color }} />}
        {swatch.label || "(color sin nombre)"}
      </p>
      <div className="admin-stock-grid-scroll">
        <table>
          <thead>
            <tr>
              <th />
              {cols.map((cut, i) => (
                <th key={i}>{cut ?? "Stock"}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((size, r) => (
              <tr key={r}>
                <th scope="row">{size ?? "—"}</th>
                {cols.map((cut, c) => {
                  const sku = skuFor(size, cut);
                  const value = stock[sku];
                  // El estado se pinta por celda: es lo que convierte la
                  // grilla en algo que se lee de un vistazo ("¿qué me
                  // falta reponer?") y no en 36 casilleros iguales.
                  const status = value === undefined ? null : stockStatus(value, minStock);
                  return (
                    <td key={c}>
                      <input
                        type="number"
                        step="1"
                        placeholder="—"
                        className={status ? `is-${status.toLowerCase()}` : undefined}
                        value={value ?? ""}
                        title={sku}
                        aria-label={`Stock ${swatch.label} ${size ?? ""} ${cut ?? ""}`.trim()}
                        onChange={(e) => onSet(sku, e.target.value)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
