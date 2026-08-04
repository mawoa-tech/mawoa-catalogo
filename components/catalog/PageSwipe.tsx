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

    // El anclaje nativo se apaga SOLO si este componente está vivo: con
    // la clase puesta desde acá, un visitante cuyo JavaScript no cargue
    // conserva el anclaje de CSS de siempre en vez de quedarse sin
    // ningún calce.
    const root = doc.documentElement;
    root.classList.add("js-paging");

    let startY = 0;
    let startIndex = 0;
    let tracking = false;
    /** En qué página se dejó la vista. Se recuerda en vez de recalcularla
     *  al cambiar el viewport: si la barra del navegador se va estando en
     *  la página 5, la posición vieja queda más cerca de la 4 y volver a
     *  calzar por cercanía te movía una página para atrás sola. */
    let currentIndex = -1;

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

    /**
     * Lleva la vista al comienzo de una página y la vuelve a acomodar
     * cuando termina de moverse.
     *
     * La segunda parte no es paranoia: en celular la barra del navegador
     * aparece y desaparece durante el propio gesto, y eso cambia el alto
     * del viewport — o sea que `offsetTop` de la página destino se mueve
     * MIENTRAS dura la animación (medido: al crecer el viewport 240px,
     * la tercera página se corrió 720px). Por eso se vuelve a leer la
     * posición ya asentada y se corrige si quedó desfasada. Se intenta
     * como mucho tres veces para no quedar en un ida y vuelta infinito.
     */
    const goTo = (page: HTMLElement, index: number) => {
      currentIndex = index;
      win.scrollTo({ top: page.offsetTop, behavior: "smooth" });
      let intentos = 0;
      const acomodar = () => {
        intentos += 1;
        const desfase = Math.abs(win.scrollY - page.offsetTop);
        if (desfase <= 2 || intentos > 3) return;
        // El primer reintento sigue siendo suave; los siguientes son
        // secos, porque a esa altura ya se notó que algo se movió y
        // encadenar animaciones se ve peor que corregir de una.
        win.scrollTo({ top: page.offsetTop, behavior: intentos === 1 ? "smooth" : "auto" });
        win.setTimeout(acomodar, 260);
      };
      win.setTimeout(acomodar, 480);
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

      goTo(pages[target], target);
    };

    /**
     * Cuando la barra del navegador aparece o se va, el viewport cambia
     * de alto y todas las páginas se agrandan o achican: la vista queda
     * entre dos. Se vuelve a calzar en la más cercana, salvo que el
     * dedo esté apoyado en ese momento — ahí manda el gesto, no esto.
     */
    let reajuste = 0;
    const onResize = () => {
      win.clearTimeout(reajuste);
      reajuste = win.setTimeout(() => {
        if (tracking) return;
        const pages = Array.from(doc.querySelectorAll<HTMLElement>("section.page"));
        if (pages.length === 0) return;
        const index = currentIndex >= 0 && currentIndex < pages.length ? currentIndex : pageAt(pages, win.scrollY);
        const page = pages[index];
        if (Math.abs(win.scrollY - page.offsetTop) > 2) {
          currentIndex = index;
          win.scrollTo({ top: page.offsetTop, behavior: "smooth" });
        }
      }, 220);
    };

    doc.addEventListener("touchstart", onStart, { passive: true });
    doc.addEventListener("touchend", onEnd, { passive: true });
    win.addEventListener("resize", onResize);
    return () => {
      doc.removeEventListener("touchstart", onStart);
      doc.removeEventListener("touchend", onEnd);
      win.removeEventListener("resize", onResize);
      win.clearTimeout(reajuste);
      root.classList.remove("js-paging");
    };
  }, []);

  // Un ancla invisible, no un efecto suelto: es lo que da acceso al
  // documento correcto cuando esto vive dentro del iframe de la vista
  // previa del panel.
  return <span ref={anchor} hidden aria-hidden="true" />;
}
