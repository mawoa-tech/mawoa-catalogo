"use client";

import Image from "next/image";
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
 * La foto va como URL y no como archivo: un enlace `wa.me` solo
 * transporta texto — no existe forma de adjuntar una imagen. WhatsApp
 * muestra la vista previa del enlace, que es lo más cercano posible.
 * Se manda absoluta porque el mensaje se abre fuera del sitio, donde
 * una ruta como `/imagenes/x.webp` no significa nada.
 *
 * El texto se codifica entero: los saltos de línea y los acentos del
 * mensaje tienen que viajar como corresponde o WhatsApp lo recibe
 * cortado.
 */
function whatsappHref(
  phone: string,
  productName: string,
  color: string,
  size?: string,
  cut?: string,
  photo?: string,
  /**
   * Origen del sitio para volver absoluta una foto guardada como ruta
   * (`/imagenes/x.webp`). NO se lee de `window` durante el render: el
   * servidor no lo tiene, así que el HTML del servidor y el del cliente
   * saldrían distintos y React aborta la hidratación con un error
   * (pasó, y se vio recién al abrir la página en un navegador — ni el
   * compilador ni el lint lo detectan). Se pasa recién en el click, que
   * solo ocurre en el navegador.
   */
  origin?: string
): string {
  const lines = [`Producto: ${productName}`, `Color: ${color}`];
  if (size) lines.push(`Talla: ${size}`);
  if (cut) lines.push(`Corte: ${cut}`);

  let message = `Hola, quiero comprar:\n\n${lines.join("\n")}`;
  if (photo) {
    // Las fotos subidas desde el panel ya son absolutas (viven en Vercel
    // Blob); las del repo son rutas y necesitan el origen.
    const absolute = photo.startsWith("http") ? photo : origin ? `${origin}${photo}` : undefined;
    if (absolute) message += `\n\n${absolute}`;
  }

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

/**
 * Barra de compra al pie de una página de producto: qué combinación
 * está elegida, si hay o no, y el botón para escribir por WhatsApp.
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

  const status = selection.currentStatus;
  const soldOut = status === "OUT_OF_STOCK";
  const canBuy = !soldOut && Boolean(selection.whatsappPhone);

  return (
    <div className="buy-bar">
      {(selection.sizes.length > 0 || selection.cuts.length > 0) && (
        <div className="buy-bar-options">
          {selection.cuts.length > 0 && (
            <div className="buy-bar-cuts" role="group" aria-label="Corte">
              {selection.cuts.map((cut) => (
                <button
                  key={cut.label}
                  type="button"
                  className={`buy-bar-cut${cut.label === selection.selectedCut ? " selected" : ""}${
                    cut.status === "OUT_OF_STOCK" ? " is-out" : ""
                  }`}
                  onClick={() => selection.selectCut(cut.label)}
                  aria-pressed={cut.label === selection.selectedCut}
                  title={`${cut.label} — ${STATUS_LABEL[cut.status]}`}
                >
                  {cut.image && <Image src={cut.image} alt="" width={64} height={64} />}
                  <span>{cut.label}</span>
                </button>
              ))}
            </div>
          )}

          {selection.sizes.length > 0 && (
            <div className="buy-bar-sizes" role="group" aria-label="Talla">
              {selection.sizes.map((size) => (
                <button
                  key={size.label}
                  type="button"
                  className={`buy-bar-size${size.label === selection.selectedSize ? " selected" : ""}${
                    size.status === "OUT_OF_STOCK" ? " is-out" : ""
                  }`}
                  onClick={() => selection.selectSize(size.label)}
                  aria-pressed={size.label === selection.selectedSize}
                  title={`Talla ${size.label} — ${STATUS_LABEL[size.status]}`}
                >
                  {size.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="buy-bar-main">
        <div className="buy-bar-info">
          <span className="buy-bar-color">{current.label}</span>
          <span className={`buy-bar-status ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
        </div>

        {canBuy ? (
          <a
            className="buy-bar-action"
            href={whatsappHref(
              selection.whatsappPhone as string,
              selection.productName,
              current.label,
              selection.selectedSize,
              selection.selectedCut,
              selection.photo
            )}
            // El enlace se completa con la foto recién acá, con el origen
            // real del navegador (ver el comentario en whatsappHref).
            // Asignar `href` dentro del handler alcanza: la navegación
            // ocurre después de que el handler termina.
            onClick={(e) => {
              e.currentTarget.href = whatsappHref(
                selection.whatsappPhone as string,
                selection.productName,
                current.label,
                selection.selectedSize,
                selection.selectedCut,
                selection.photo,
                window.location.origin
              );
            }}
            target="_blank"
            rel="noreferrer"
          >
            Comprar por WhatsApp
          </a>
        ) : (
          // Un botón deshabilitado y no la ausencia del botón: si
          // desaparece, no se entiende por qué esta combinación no se
          // puede comprar y otras sí.
          <span className="buy-bar-action is-disabled" aria-disabled="true">
            {soldOut ? "Agotado" : "No disponible"}
          </span>
        )}
      </div>
    </div>
  );
}
