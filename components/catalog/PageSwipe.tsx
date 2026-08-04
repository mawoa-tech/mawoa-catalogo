"use client";

import { useEffect, useRef } from "react";

/** Cuánto hay que deslizar para que cuente como gesto y no como un toque. */
const MIN_SWIPE_PX = 24;

/**
 * Scroll de página en página en pantalla táctil, decidido al soltar el
 * dedo.
 *
 * Por qué existe, si el anclaje de CSS ya hacía esto: porque no lo hacía
 * bien. Medido con gestos táctiles reales (no simulados a mano), con
 * `scroll-snap-type: y mandatory` un deslizamiento corto (150px) NO
 * avanzaba ninguna página — el navegador devolvía a la que estabas — y
 * uno largo y rápido (900px a 3000px/s) avanzaba una sola, igual que uno
 * mediano. Las dos cosas juntas son el "se traba" que se reportó tres
 * veces. Quitar `scroll-snap-stop: always` no cambió ninguna de las dos:
 * el límite lo pone el propio algoritmo de anclaje obligatorio de
 * Chromium.
 *
 * La alternativa desde CSS era `proximity`, pero deja páginas a medias,
 * que es justo lo que NO se quiere.
 *
 * Cómo funciona, y por qué es poco invasivo: **no** se intercepta el
 * gesto. El dedo arrastra la página con el scroll nativo de siempre; al
 * soltar, si el gesto superó los 24px se lleva la vista a la página
 * vecina. Nada de `preventDefault`, nada de reimplementar la inercia.
 * En cambio el anclaje nativo se apaga (solo en táctil, ver
 * app/globals.css), porque si no el navegador pelea contra este cálculo.
 *
 * Solo táctil: en escritorio la rueda y el teclado ya funcionan bien con
 * el anclaje de CSS, y ahí sí se conserva.
 */
export default function PageSwipe() {
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = anchor.current;
    if (!node) return;
    // El documento se toma del propio nodo y no de `document`: la vista
    // previa del panel dibuja este mismo árbol dentro de un <iframe> por
    // portal, donde `document`/`window` siguen siendo los de afuera.
    // Mismo motivo por el que ScrollReveal hace lo mismo.
    const doc = node.ownerDocument;
    const win = doc.defaultView;
    if (!win) return;
    if (!win.matchMedia("(pointer: coarse)").matches) return;

    /**
     * Altura de página congelada.
     *
     * `100dvh` es "dinámico" a propósito: crece y se achica cuando el
     * navegador del celular esconde o muestra su barra de direcciones.
     * Eso mueve TODAS las páginas de lugar en medio del gesto — medido:
     * al crecer el viewport 240px, la tercera página se corrió 720px.
     * Por eso el paso de página terminaba en cualquier lado.
     *
     * Se fija una vez el alto real y se actualiza SOLO cuando cambia de
     * verdad la ventana (rotar el teléfono, que cambia el ancho). Un
     * cambio de alto con el mismo ancho es la barra del navegador
     * apareciendo o yéndose, y ahí no se toca nada.
     */
    const root = doc.documentElement;
    let lastWidth = win.innerWidth;
    const freezeHeight = () => root.style.setProperty("--page-h", `${win.innerHeight}px`);
    freezeHeight();
    const onResize = () => {
      if (win.innerWidth === lastWidth) return;
      lastWidth = win.innerWidth;
      freezeHeight();
    };
    win.addEventListener("resize", onResize);
    win.addEventListener("orientationchange", freezeHeight);

    let startY = 0;
    let startIndex = 0;
    let tracking = false;

    /** Índice de la página cuyo borde superior está más cerca de la vista. */
    const pageAt = (pages: HTMLElement[], y: number) => {
      let best = Infinity;
      let index = 0;
      pages.forEach((page, i) => {
        const d = Math.abs(page.offsetTop - y);
        if (d < best) {
          best = d;
          index = i;
        }
      });
      return index;
    };

    // Solo el panel de compra: adentro scrollea él, no la página. La
    // barra NO va acá — se probó y fue un bug real: ocupa todo el ancho
    // abajo, que es justo donde se apoya el dedo para deslizar, así que
    // ignorarla hacía que muchos gestos no pasaran de página y encima
    // dejaran la vista a mitad de camino.
    const isInsideOverlay = (target: EventTarget | null) =>
      target instanceof Element && target.closest(".buy-sheet-backdrop") !== null;

    const onStart = (e: TouchEvent) => {
      tracking = e.touches.length === 1 && !isInsideOverlay(e.target);
      if (!tracking) return;
      startY = e.touches[0].clientY;
      // La referencia se toma ACÁ y no al soltar: al soltar, la inercia
      // nativa ya movió la vista, así que sumarle una página daba dos por
      // gesto (medido). Con la referencia del inicio, un gesto es siempre
      // una página, sin importar con cuánta fuerza se haga.
      startIndex = pageAt(Array.from(doc.querySelectorAll<HTMLElement>("section.page")), win.scrollY);
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const delta = startY - (e.changedTouches[0]?.clientY ?? startY);
      const pages = Array.from(doc.querySelectorAll<HTMLElement>("section.page"));
      if (pages.length === 0) return;

      // Un gesto por debajo del umbral no cambia de página, pero igual
      // hay que volver a calzar: como el anclaje nativo está apagado en
      // táctil, si no, la vista queda a mitad de dos páginas. Antes
      // pasaba justamente eso con cada toque o arrastre corto.
      const target =
        Math.abs(delta) < MIN_SWIPE_PX
          ? pageAt(pages, win.scrollY)
          : Math.min(Math.max(startIndex + (delta > 0 ? 1 : -1), 0), pages.length - 1);

      win.scrollTo({ top: pages[target].offsetTop, behavior: "smooth" });
    };

    doc.addEventListener("touchstart", onStart, { passive: true });
    doc.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      doc.removeEventListener("touchstart", onStart);
      doc.removeEventListener("touchend", onEnd);
      win.removeEventListener("resize", onResize);
      win.removeEventListener("orientationchange", freezeHeight);
      root.style.removeProperty("--page-h");
    };
  }, []);

  // Un ancla invisible, no un efecto suelto: es lo que da acceso al
  // documento correcto cuando esto vive dentro del iframe de la vista
  // previa del panel.
  return <span ref={anchor} hidden aria-hidden="true" />;
}
