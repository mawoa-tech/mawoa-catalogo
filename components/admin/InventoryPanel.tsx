"use client";

import { useState, useTransition } from "react";
import type { Block, CatalogInventory, StockStatus } from "@/data/schema";
import { catalogVariants, variantStatus } from "@/data/schema";
import {
  readKardexAction,
  syncInventoryFromSheetAction,
  syncInventoryToSheetAction,
  type KardexResult,
} from "@/app/admin/actions";
import { useToast } from "./ToastContext";

type InventoryPanelProps = {
  catalogId: string;
  inventory: CatalogInventory | undefined;
  blocks: Block[];
};

const STATUS_LABEL: Record<StockStatus, string> = {
  AVAILABLE: "Disponibles",
  LOW_STOCK: "Stock bajo",
  OUT_OF_STOCK: "Agotadas",
};

/**
 * Resumen del inventario del catálogo, sincronización con la hoja y
 * consulta del Kardex.
 *
 * El resumen se calcula sobre el contenido que el admin tiene en
 * pantalla — no pide nada al servidor: los datos ya están acá y una
 * llamada extra solo agregaría espera y una forma más de fallar.
 *
 * La sincronización, en cambio, trabaja siempre contra lo **publicado**
 * (el servidor lee el catálogo del registro, no de lo que manda el
 * navegador). Por eso avisa cuando hay cambios sin guardar: sincronizar
 * antes de publicar mandaría a la hoja la versión vieja.
 */
export default function InventoryPanel({ catalogId, inventory, blocks }: InventoryPanelProps) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [kardex, setKardex] = useState<KardexResult | null>(null);
  const [filter, setFilter] = useState("");

  const spreadsheetId = inventory?.spreadsheetId;
  const variants = catalogVariants(blocks);

  const counts = variants.reduce<Record<StockStatus, number>>(
    (acc, v) => {
      const status = variantStatus(v);
      // Sin números cargados no se cuenta como agotada: es "todavía sin
      // cargar", y mezclarlas escondería cuánto falta por completar.
      if (status) acc[status] += 1;
      return acc;
    },
    { AVAILABLE: 0, LOW_STOCK: 0, OUT_OF_STOCK: 0 }
  );
  const uncounted = variants.filter((v) => variantStatus(v) === null).length;

  const run = (action: () => Promise<{ ok: boolean; error?: string; rows?: number; movements?: number; updatedAt?: string }>) => {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        showToast(result.error ?? "No se pudo sincronizar.", "error");
        return;
      }
      setLastSync(result.updatedAt ?? new Date().toISOString());
      const movs = result.movements ?? 0;
      showToast(
        `${result.rows ?? 0} variantes sincronizadas${movs > 0 ? `, ${movs} movimiento${movs === 1 ? "" : "s"} en el Kardex` : ""}.`
      );
    });
  };

  const loadKardex = () => {
    startTransition(async () => {
      setKardex(await readKardexAction(catalogId));
    });
  };

  if (inventory?.enabled !== true) return null;

  const rows = kardex?.ok
    ? kardex.rows.filter((r) => {
        if (!filter.trim()) return true;
        const q = filter.trim().toLowerCase();
        return [r.sku, r.model, r.color, r.size, r.cut, r.type].some((f) => f.toLowerCase().includes(q));
      })
    : [];

  return (
    <div className="admin-field-group">
      <h4>Inventario</h4>

      <div className="admin-inv-summary">
        <span className="admin-inv-count is-available">
          <strong>{counts.AVAILABLE}</strong> {STATUS_LABEL.AVAILABLE}
        </span>
        <span className="admin-inv-count is-low">
          <strong>{counts.LOW_STOCK}</strong> {STATUS_LABEL.LOW_STOCK}
        </span>
        <span className="admin-inv-count is-out">
          <strong>{counts.OUT_OF_STOCK}</strong> {STATUS_LABEL.OUT_OF_STOCK}
        </span>
        {uncounted > 0 && (
          <span className="admin-inv-count is-none">
            <strong>{uncounted}</strong> sin cargar
          </span>
        )}
      </div>

      {!spreadsheetId ? (
        <p className="admin-field-hint admin-field-hint-warn">
          Todavía no hay una hoja de Google asociada. Creá una hoja en tu Drive, compartila como Editor con
          la cuenta de servicio y pegá su identificador acá abajo.
        </p>
      ) : (
        <>
          <div className="admin-inv-actions">
            <button
              type="button"
              className="admin-btn"
              disabled={pending}
              onClick={() => run(() => syncInventoryToSheetAction(catalogId))}
              title="Escribe en la hoja las variantes del catálogo publicado"
            >
              Enviar a la hoja
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-primary"
              disabled={pending}
              onClick={() => run(() => syncInventoryFromSheetAction(catalogId))}
              title="Trae el stock de la hoja y registra los movimientos en el Kardex"
            >
              {pending ? "Sincronizando…" : "Traer de la hoja"}
            </button>
            <a
              className="admin-btn"
              href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`}
              target="_blank"
              rel="noreferrer"
            >
              Abrir Google Sheets
            </a>
          </div>

          <p className="admin-field-hint">
            La sincronización trabaja sobre el catálogo <strong>publicado</strong>: si hiciste cambios acá y
            no tocaste &ldquo;Guardar y publicar&rdquo;, todavía no van a estar en la hoja.
            {lastSync && <> Última sincronización: {new Date(lastSync).toLocaleString("es-PE")}.</>}
          </p>

          <div className="admin-inv-kardex">
            <div className="admin-inv-actions">
              <button type="button" className="admin-btn" disabled={pending} onClick={loadKardex}>
                {kardex ? "Actualizar Kardex" : "Ver Kardex"}
              </button>
              {kardex?.ok && kardex.rows.length > 0 && (
                <input
                  type="search"
                  placeholder="Filtrar por SKU, color, talla, tipo…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              )}
            </div>

            {kardex && !kardex.ok && <p className="admin-save-message error">{kardex.error}</p>}
            {kardex?.ok && kardex.rows.length === 0 && (
              <p className="admin-field-hint">Todavía no hay movimientos registrados.</p>
            )}
            {kardex?.ok && kardex.rows.length > 0 && (
              <div className="admin-inv-kardex-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>SKU</th>
                      <th>Color</th>
                      <th>Talla</th>
                      <th>Corte</th>
                      <th>Tipo</th>
                      <th>Cant.</th>
                      <th>Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 100).map((r, i) => (
                      <tr key={`${r.date}-${r.sku}-${i}`}>
                        <td>{r.date ? new Date(r.date).toLocaleDateString("es-PE") : ""}</td>
                        <td className="admin-sku">{r.sku}</td>
                        <td>{r.color}</td>
                        <td>{r.size}</td>
                        <td>{r.cut}</td>
                        <td>{r.type}</td>
                        <td>{r.quantity}</td>
                        <td>{r.balance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 100 && (
                  <p className="admin-field-hint">
                    Mostrando los 100 movimientos más recientes de {rows.length}.
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
