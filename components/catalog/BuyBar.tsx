"use client";

import { useEffect, useState } from "react";
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
 * Talla y corte NO se eligen en la barra: se eligen en un panel que se
 * abre encima (`position: fixed`, fuera del flujo de la página). La
 * primera versión los ponía adentro y la barra pasaba de 68px a 184px,
 * comiéndose las fotos del producto — que es justamente lo que la
 * página tiene para mostrar. Además, así el corte se puede ver en
 * grande: se elige mirando la forma, y en una miniatura de 44px no se
 * distingue una de otra.
 *
 * No muestra la cantidad exacta: al visitante le alcanza con saber si
 * puede comprar.
 */
export default function BuyBar() {
  const [sheetOpen, setSheetOpen] = useState(false);

  /**
   * Con el panel abierto, el catálogo de atrás no se mueve. Sin esto,
   * deslizar sobre el panel scrolleaba la página de fondo (medido: se
   * corría 198px), que es el comportamiento clásico de un modal mal
   * hecho. Se toca el documento del propio panel y no `document` a
   * secas por el iframe de la vista previa del admin.
   */
  useEffect(() => {
    if (!sheetOpen) return;
    const el = document.documentElement;
    const previo = el.style.overflow;
    el.style.overflow = "hidden";
    return () => {
      el.style.overflow = previo;
    };
  }, [sheetOpen]);

  const selection = useVariantSelection();
  if (!selection) return null;

  const current = selection.variants[selection.selectedIndex];
  if (!current) return null;

  const status = selection.currentStatus;
  const soldOut = status === "OUT_OF_STOCK";
  const canBuy = !soldOut && Boolean(selection.whatsappPhone);
  const hasOptions = selection.sizes.length > 0 || selection.cuts.length > 0;

  const chosenParts = [selection.selectedCut, selection.selectedSize].filter(Boolean) as string[];

  const buildHref = (origin?: string) =>
    whatsappHref(
      selection.whatsappPhone ?? "",
      selection.productName,
      current.label,
      selection.selectedSize,
      selection.selectedCut,
      selection.photo,
      origin
    );

  return (
    <>
      <div className="buy-bar">
        <div className="buy-bar-info">
          {/* Lo elegido en una sola línea que se recorta si no entra. La
              versión anterior tenía además un control aparte para elegir
              talla/corte, y en celular se montaba encima de la etiqueta
              de estado. Ahora la barra tiene UN control. */}
          <span className="buy-bar-color">{[current.label, ...chosenParts].join(" · ")}</span>
          <span className={`buy-bar-status ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
        </div>

        {hasOptions ? (
          // Con tallas o cortes el botón abre el panel: elegir y comprar
          // en dos pasos claros es más simple que tres controles
          // apretados en una barra de 68px.
          <button
            type="button"
            className={`buy-bar-action${canBuy ? "" : " is-muted"}`}
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
          >
            Elegir y comprar
          </button>
        ) : canBuy ? (
          <a
            className="buy-bar-action"
            href={buildHref()}
            // El enlace se completa con la foto recién acá, con el
            // origen real del navegador (ver whatsappHref). Asignar
            // `href` dentro del handler alcanza: la navegación ocurre
            // después de que el handler termina.
            onClick={(e) => {
              e.currentTarget.href = buildHref(window.location.origin);
            }}
            target="_blank"
            rel="noreferrer"
          >
            Comprar
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

      {sheetOpen && hasOptions && (
        <div className="buy-sheet-backdrop" onClick={() => setSheetOpen(false)}>
          <div
            className="buy-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Elegir corte y talla"
          >
            <div className="buy-sheet-head">
              <p>{selection.productName}</p>
              <button type="button" onClick={() => setSheetOpen(false)} aria-label="Cerrar">
                ✕
              </button>
            </div>

            <div className="buy-sheet-body">
              {selection.cuts.length > 0 && (
                <section>
                  <h3>Corte</h3>
                  <div className="buy-sheet-cuts">
                    {selection.cuts.map((cut) => (
                      <button
                        key={cut.label}
                        type="button"
                        className={`buy-sheet-cut${cut.label === selection.selectedCut ? " selected" : ""}${
                          cut.status === "OUT_OF_STOCK" ? " is-out" : ""
                        }`}
                        onClick={() => selection.selectCut(cut.label)}
                        aria-pressed={cut.label === selection.selectedCut}
                      >
                        {cut.image && (
                          <Image src={cut.image} alt="" width={320} height={400} sizes="(max-width: 640px) 45vw, 220px" />
                        )}
                        <span className="buy-sheet-cut-name">{cut.label}</span>
                        {cut.status === "OUT_OF_STOCK" && <span className="buy-sheet-out">Agotado</span>}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {selection.sizes.length > 0 && (
                <section>
                  <h3>Talla</h3>
                  <div className="buy-sheet-sizes">
                    {selection.sizes.map((size) => (
                      <button
                        key={size.label}
                        type="button"
                        className={`buy-sheet-size${size.label === selection.selectedSize ? " selected" : ""}${
                          size.status === "OUT_OF_STOCK" ? " is-out" : ""
                        }`}
                        onClick={() => selection.selectSize(size.label)}
                        aria-pressed={size.label === selection.selectedSize}
                        title={STATUS_LABEL[size.status]}
                      >
                        {size.label}
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>

            {canBuy ? (
              <a
                className="buy-sheet-done"
                href={buildHref()}
                onClick={(e) => {
                  e.currentTarget.href = buildHref(window.location.origin);
                  setSheetOpen(false);
                }}
                target="_blank"
                rel="noreferrer"
              >
                Comprar por WhatsApp
              </a>
            ) : (
              <span className="buy-sheet-done is-disabled" aria-disabled="true">
                {soldOut ? "Esta combinación está agotada" : "No disponible"}
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
