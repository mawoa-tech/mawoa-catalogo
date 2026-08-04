"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { StockStatus } from "@/data/schema";

type LiveStock = Record<string, StockStatus>;

const LiveStockContext = createContext<LiveStock | null>(null);

/**
 * Trae la disponibilidad al día desde `/api/inventory/<id>` — **una sola
 * vez por catálogo**, no una por producto ni por color: ese pedido único
 * es justamente lo que evita que la página termine haciendo decenas de
 * llamadas.
 *
 * El HTML del catálogo sigue siendo estático y se pinta enseguida con lo
 * último que se guardó desde el panel; esto solo lo corrige si mientras
 * tanto cambió el stock (por ejemplo desde la hoja de Google). Si el
 * pedido falla —sin internet, el almacén caído— no pasa nada: se queda
 * lo que ya estaba, que es viejo pero coherente. Nunca deja al visitante
 * sin poder ver la página.
 *
 * `catalogId` ausente = no se consulta nada. Es lo que usa la vista
 * previa del panel, donde la verdad es lo que el admin está editando en
 * ese momento y no lo que hay publicado.
 */
export function LiveStockProvider({
  catalogId,
  children,
}: {
  catalogId?: string;
  children: ReactNode;
}) {
  const [live, setLive] = useState<LiveStock | null>(null);

  useEffect(() => {
    if (!catalogId) return;
    const controller = new AbortController();
    fetch(`/api/inventory/${encodeURIComponent(catalogId)}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.enabled && data.statuses) setLive(data.statuses as LiveStock);
      })
      .catch(() => {
        // Silencio a propósito: es una mejora sobre lo ya mostrado, no
        // un requisito para que el catálogo funcione.
      });
    return () => controller.abort();
  }, [catalogId]);

  return <LiveStockContext.Provider value={live}>{children}</LiveStockContext.Provider>;
}

export function useLiveStock(): LiveStock | null {
  return useContext(LiveStockContext);
}
