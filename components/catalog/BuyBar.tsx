"use client";

import type { StockStatus } from "@/data/schema";
import { useVariantSelection } from "./VariantContext";

const STATUS_LABEL: Record<StockStatus, string> = {
  AVAILABLE: "Disponible",
  LOW_STOCK: "Últimas unidades",
  OUT_OF_STOCK: "Agotado",
};

const STATUS_CLASS: Record<StockStatus, string> = {
  AVAILABLE: "is-available",
  LOW_STOCK: "is-low",
  OUT_OF_STOCK: "is-out",
};

/**
 * Arma el enlace de WhatsApp. `wa.me` funciona igual en el celular
 * (abre la app) y en la computadora (abre WhatsApp Web), así que no
 * hace falta detectar el dispositivo ni ofrecer dos enlaces distintos.
 *
 * El texto se codifica entero: los saltos de línea y los acentos del
 * mensaje tienen que viajar como corresponde o WhatsApp lo recibe
 * cortado.
 */
function whatsappHref(phone: string, productName: string, color: string): string {
  const message = `Hola, quiero comprar:\n\nProducto: ${productName}\nColor: ${color}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

/**
 * Barra de compra al pie de una página de producto: qué color está
 * elegido, si hay o no, y el botón para escribir por WhatsApp.
 *
 * Va `position: absolute` contra la `<section class="page">` (que ya es
 * `position: relative`) y no en el flujo normal, por un motivo concreto
 * y no estético: cada página del catálogo tiene que entrar en una
 * pantalla — es lo que sostiene el scroll de página en página — y
 * agregar contenido en el flujo empujaría el resto fuera de la
 * pantalla, que es un bug que este proyecto ya tuvo que arreglar dos
 * veces en celulares. Es el mismo mecanismo que usa SoldOutBadge.
 *
 * No muestra la cantidad exacta: al visitante le alcanza con saber si
 * puede comprar.
 */
export default function BuyBar() {
  const selection = useVariantSelection();
  if (!selection) return null;

  const current = selection.variants[selection.selectedIndex];
  if (!current) return null;

  const soldOut = current.status === "OUT_OF_STOCK";
  const canBuy = !soldOut && Boolean(selection.whatsappPhone);

  return (
    <div className="buy-bar">
      <div className="buy-bar-info">
        <span className="buy-bar-color">{current.label}</span>
        <span className={`buy-bar-status ${STATUS_CLASS[current.status]}`}>
          {STATUS_LABEL[current.status]}
        </span>
      </div>

      {canBuy ? (
        <a
          className="buy-bar-action"
          href={whatsappHref(selection.whatsappPhone as string, selection.productName, current.label)}
          target="_blank"
          rel="noreferrer"
        >
          Comprar por WhatsApp
        </a>
      ) : (
        // Un botón deshabilitado y no la ausencia del botón: si
        // desaparece, no se entiende por qué este color no se puede
        // comprar y los demás sí.
        <span className="buy-bar-action is-disabled" aria-disabled="true">
          {soldOut ? "Agotado" : "No disponible"}
        </span>
      )}
    </div>
  );
}
