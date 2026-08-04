"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import CatalogRenderer from "@/components/catalog/CatalogRenderer";
import PreviewFrame from "./PreviewFrame";
import TextColorPopover from "./TextColorPopover";
import { findPaintableElement, resolveTextColorTarget, type TextColorTarget } from "./textColorTarget";
import type { Block, CatalogInventory, CatalogTheme, LayoutId } from "@/data/schema";

type AdminPanelProps = {
  blocks: Block[];
  theme: CatalogTheme;
  layoutId: LayoutId;
  /** Control de stock del catálogo: la vista previa tiene que mostrar la barra de compra igual que el sitio público. */
  inventory?: CatalogInventory;
  title: string;
  /**
   * Pinta (o despinta, con `color: null`) un texto puntual de una
   * página, elegido clickeándolo en la vista previa. Opcional: quien no
   * la pase — el asistente de creación — simplemente no habilita el
   * selector de color.
   */
  onTextColorChange?: (blockIndex: number, selector: string, color: string | null) => void;
  /** Acciones fijas que tienen que seguir alcanzables aunque el panel esté colapsado (volver al listado, cerrar sesión). */
  topbarActions?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Marco flotante del editor (Fase B de la optimización 2026-07-28):
 * el catálogo real (mismo CatalogRenderer que el sitio público, no una
 * vista previa aparte) queda siempre montado de fondo — reemplaza tanto
 * el <main> plano de /admin/[id] como el botón "Vista previa"
 * (PreviewOverlay, retirado): ya no hay que pedir una vista previa
 * porque el fondo siempre es la vista previa real, en vivo, mientras
 * se edita. El panel de edición en sí (`children`) es colapsable
 * (ESC o el botón ✕) para poder mirar el catálogo completo sin nada
 * encima; un botón flotante lo vuelve a abrir. El fondo se mantiene
 * montado tanto abierto como cerrado para no perder su posición de
 * scroll al alternar.
 */
export default function AdminPanel({
  blocks,
  theme,
  layoutId,
  inventory,
  title,
  onTextColorChange,
  topbarActions,
  open,
  onOpenChange,
  children,
}: AdminPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // A diferencia de PreviewOverlay (que solo se montaba después de un
  // clic, nunca en el SSR), este componente vive en el árbol desde el
  // primer render de AdminEditor — incluido el render en el servidor,
  // donde `document` no existe. Portal recién después de montar en el
  // cliente evita el `ReferenceError: document is not defined`.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- patrón estándar de "portal seguro para SSR": el flip pasa una sola vez, justo después de la hidratación, no en respuesta a un cambio externo que el linter esperaría acá.
  useEffect(() => setMounted(true), []);

  // Cómo se está mirando el catálogo de fondo: dentro de una ventana de
  // ordenador simulada (1440x900) o de un teléfono (iPhone 15). Las dos
  // pasan por PreviewFrame, que resuelve las media queries contra las
  // medidas reales del dispositivo. Es solo una preferencia de
  // visualización: no toca el contenido ni lo que se guarda.
  // Arranca en móvil: es como mira el catálogo la mayoría de quienes lo
  // reciben (llega por WhatsApp), así que es la vista que hay que
  // controlar primero. Escritorio queda a un toque.
  const [viewport, setViewport] = useState<"desktop" | "mobile">("mobile");

  // `onOpenChange` va por un ref, no directo en las deps del efecto de
  // abajo — bug real encontrado en el asistente de creación: ahí se le
  // pasa una función inline nueva en cada render (a diferencia del
  // editor normal, donde es `setPanelOpen`, siempre la misma función),
  // así que el efecto se volvía a disparar en cada tecla — incluido el
  // `panelRef.current?.focus()` — y le robaba el foco al input justo
  // después de cada letra. Con el ref, el efecto solo depende de
  // `open` y sigue llamando siempre a la versión más reciente.
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onOpenChangeRef.current(false);
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  // ---- clic en un texto de la vista previa → selector de color ----
  const [colorTarget, setColorTarget] = useState<TextColorTarget | null>(null);
  // El listener vive en el documento del iframe, que se recrea al
  // cambiar de vista; el ref evita tener que re-suscribirlo en cada
  // render solo porque cambió una función inline.
  const textColorEnabledRef = useRef(Boolean(onTextColorChange));
  useEffect(() => {
    textColorEnabledRef.current = Boolean(onTextColorChange);
  });

  const handlePreviewDocument = useCallback((doc: Document | null) => {
    if (!doc) return;

    // Qué se puede pintar tiene que verse ANTES de clickear: sin esto,
    // el puntero sobre el catálogo era el cursor de texto (I) — que
    // sugiere "seleccionar", no "clickear" — y no había forma de saber
    // qué textos responden al clic y cuáles no.
    const hoverStyle = doc.createElement("style");
    hoverStyle.textContent = `
      .catalog-root, .catalog-root * { -webkit-user-select: none; user-select: none; }
      .admin-paintable-hover {
        cursor: pointer !important;
        outline: 2px dashed rgba(59, 130, 246, 0.9) !important;
        outline-offset: 3px;
      }
    `;
    doc.head.appendChild(hoverStyle);

    /** Coordenadas del iframe → posición real en la ventana del panel (el dispositivo está escalado, ver PreviewFrame). */
    const frameGeometry = () => {
      const frame = doc.defaultView?.frameElement as HTMLIFrameElement | null;
      if (!frame) return null;
      const rect = frame.getBoundingClientRect();
      return { rect, scale: rect.width / (frame.offsetWidth || rect.width) };
    };

    let hovered: Element | null = null;
    const onMove = (e: MouseEvent) => {
      if (!textColorEnabledRef.current) return;
      const next = findPaintableElement(doc, e.clientX, e.clientY);
      if (next === hovered) return;
      hovered?.classList.remove("admin-paintable-hover");
      hovered = next;
      hovered?.classList.add("admin-paintable-hover");
    };

    const onClick = (e: MouseEvent) => {
      if (!textColorEnabledRef.current) return;
      const geometry = frameGeometry();
      if (!geometry) return;
      // No alcanza con `e.target`: el degradado `.page-overlay` está por
      // encima del texto y se lleva el clic (por eso el título de la
      // portada no se podía pintar). `findPaintableElement` atraviesa lo
      // decorativo hasta el texto real.
      const el = findPaintableElement(doc, e.clientX, e.clientY);
      // Un click sobre una foto o un fondo no abre nada — pero sí cierra
      // el cuadro que estuviera abierto: los eventos del iframe no
      // llegan al documento del panel, así que el "click afuera" que ya
      // escuchaba el cuadro nunca se enteraba de los clicks sobre la
      // vista previa, que es justo donde uno clickea para descartarlo.
      if (!el) {
        setColorTarget(null);
        return;
      }
      const resolved = resolveTextColorTarget(el, geometry.rect, geometry.scale, e.clientX, e.clientY);
      if (!resolved) return;
      // Solo se corta la navegación (el link del PDF en la página de
      // cierre) si de verdad se va a abrir el selector.
      e.preventDefault();
      setColorTarget(resolved);
    };

    doc.addEventListener("mousemove", onMove);
    doc.addEventListener("click", onClick, true);
  }, []);

  const currentOverride = colorTarget
    ? blocks[colorTarget.blockIndex]?.data.textColors?.[colorTarget.selector]
    : undefined;

  // Mismo cálculo que app/admin/actions.ts al guardar: el fondo en vivo
  // tiene que mostrar los números de página reales según el orden
  // actual, no los que hayan quedado de antes de reordenar/agregar.
  const withPageNumbers = blocks.map((block, i) => ({
    ...block,
    data: { ...block.data, pageNumber: i + 1 },
  })) as Block[];

  if (!mounted) return null;

  /**
   * El mismo control en dos lugares: la barra superior (escritorio) y el
   * encabezado del panel (celular). Hace falta porque en celular el
   * panel ocupa toda la pantalla y la barra superior se achica a cero
   * mientras está abierto — o sea, siempre —, así que el selector de
   * vista quedaba inalcanzable justo en el dispositivo que se quiere
   * previsualizar. Una sola definición, dos montajes; el CSS esconde el
   * que no corresponde a cada tamaño.
   */
  const renderViewportToggle = (className: string) => (
    <div className={className} role="group" aria-label="Tamaño de la vista previa">
      <button
        type="button"
        className={viewport === "mobile" ? "is-active" : ""}
        onClick={() => setViewport("mobile")}
        aria-pressed={viewport === "mobile"}
      >
        Móvil
      </button>
      <button
        type="button"
        className={viewport === "desktop" ? "is-active" : ""}
        onClick={() => setViewport("desktop")}
        aria-pressed={viewport === "desktop"}
      >
        Escritorio
      </button>
    </div>
  );

  return createPortal(
    <>
      <div
        className={[
          "admin-panel-live",
          "admin-panel-live--framed",
          // Con el panel abierto la vista previa se achica hasta el borde
          // izquierdo del panel en vez de seguir a sangre completa por
          // debajo: así el panel nunca tapa parte del catálogo.
          open ? "admin-panel-live--panel-open" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Las dos vistas pasan por el mismo componente de dispositivo
            simulado: cambia la carcasa (teléfono / ventana de ordenador)
            y las medidas lógicas del viewport, nada más. */}
        <PreviewFrame
          key={viewport}
          variant={viewport === "mobile" ? "phone" : "desktop"}
          // El dominio sale del navegador, no escrito a mano: el panel se
          // sirve desde el mismo sitio que va a ver el visitante, así que
          // la barra simulada muestra la dirección real (antes decía
          // siempre el dominio del primer despliegue de este proyecto,
          // que ya no es donde vive).
          url={`${typeof window === "undefined" ? "" : window.location.host}/catalog/${title}`}
          onDocumentReady={handlePreviewDocument}
        >
          <CatalogRenderer blocks={withPageNumbers} theme={theme} layoutId={layoutId} inventory={inventory} />
        </PreviewFrame>
      </div>

      {colorTarget && onTextColorChange && (
        <TextColorPopover
          key={`${colorTarget.blockIndex}:${colorTarget.selector}`}
          x={colorTarget.x}
          y={colorTarget.y}
          sample={colorTarget.sample}
          color={currentOverride ?? colorTarget.currentColor}
          hasOverride={Boolean(currentOverride)}
          presets={[theme.ink, theme.paper, theme.accent, theme.muted, theme.line]}
          onChange={(color) => onTextColorChange(colorTarget.blockIndex, colorTarget.selector, color)}
          onClear={() => {
            onTextColorChange(colorTarget.blockIndex, colorTarget.selector, null);
            setColorTarget(null);
          }}
          onClose={() => setColorTarget(null)}
        />
      )}

      <div className={`admin-panel-topbar${open ? " admin-panel-topbar--panel-open" : ""}`}>
        <p className="admin-panel-topbar-title">{title}</p>
        <div className="admin-panel-topbar-actions">
          {/* Cambiar de vista remonta el catálogo (en escritorio vive en
              la página, en móvil dentro del iframe), así que se pierde la
              posición de scroll. Es aceptable: es un cambio explícito de
              "cómo lo estoy mirando", no algo que pase solo. */}
          {renderViewportToggle("admin-viewport-toggle admin-viewport-toggle--topbar")}
          {topbarActions}
        </div>
      </div>

      {open ? (
        <>
          {/* Sin velo oscuro sobre el catálogo: ahora que el panel no se
              superpone, lo único que hacía era oscurecer y desenfocar
              justo lo que se está mirando mientras se edita. */}
          <div
            className="admin-panel"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            ref={panelRef}
            tabIndex={-1}
          >
            <div className="admin-panel-header">
              <p className="admin-panel-header-title">Editar contenido</p>
              {renderViewportToggle("admin-viewport-toggle admin-viewport-toggle--panel")}
              <button
                type="button"
                className="admin-panel-close"
                onClick={() => onOpenChange(false)}
                aria-label="Colapsar panel de edición (Esc)"
                title="Colapsar panel de edición (Esc)"
              >
                ✕
              </button>
            </div>
            <div className="admin-panel-body">{children}</div>
          </div>
        </>
      ) : (
        <button
          type="button"
          className="admin-panel-reopen"
          onClick={() => onOpenChange(true)}
          aria-label="Abrir panel de edición"
        >
          ✏️ Editar
        </button>
      )}
    </>,
    document.body
  );
}
