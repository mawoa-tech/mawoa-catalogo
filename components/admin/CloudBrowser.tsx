"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CloudItem, CloudPickedFile, CloudSource } from "@/lib/cloudSources";

type CloudBrowserProps = {
  source: CloudSource;
  /** Se llama con los archivos ya descargados; quien lo use se encarga de subirlos. */
  onPicked: (files: CloudPickedFile[]) => void | Promise<void>;
  onClose: () => void;
};

type Crumb = { id: string | null; name: string };

/**
 * Explorador del proveedor en la nube dibujado por el panel, no por el
 * widget del proveedor. Reemplaza al Picker de Google (2026-08-03): esa
 * ventana vive dentro de un iframe y no admite ningún estilo — se veía
 * como una pieza ajena, con una interfaz que Google no actualiza —, y
 * además obligaba a mantener dos credenciales extra (API Key y número
 * de proyecto) que la API de Drive no necesita.
 *
 * Es genérico a propósito: habla contra `source.browse`, así que un
 * Dropbox/OneDrive futuro reusa esta misma pantalla implementando la
 * interfaz `CloudBrowser`, sin tocar este componente.
 */
export default function CloudBrowser({ source, onPicked, onClose }: CloudBrowserProps) {
  const [tab, setTab] = useState<"mine" | "shared">("mine");
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: null, name: "Mi unidad" }]);
  const [items, setItems] = useState<CloudItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  /** El texto realmente buscado — se separa del input para no disparar una consulta por tecla. */
  const [activeSearch, setActiveSearch] = useState("");
  const [status, setStatus] = useState<"connecting" | "loading" | "ready" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const connectedRef = useRef(false);

  const currentFolder = crumbs[crumbs.length - 1];

  /**
   * Cada listado se numera: si el usuario entra a una carpeta y enseguida
   * a otra, la respuesta de la primera puede llegar después y pisar a la
   * segunda. Solo el pedido más reciente puede escribir estado.
   */
  const requestIdRef = useRef(0);

  const load = useCallback(
    async (pageToken?: string) => {
      const requestId = ++requestIdRef.current;
      const isCurrent = () => requestIdRef.current === requestId;

      setError(null);
      setStatus(pageToken ? "ready" : "loading");
      try {
        if (!connectedRef.current) {
          setStatus("connecting");
          await source.browse.connect();
          connectedRef.current = true;
          if (!isCurrent()) return;
          setStatus("loading");
        }
        const result = await source.browse.list({
          folderId: currentFolder.id,
          search: activeSearch || undefined,
          shared: tab === "shared",
          pageToken,
        });
        if (!isCurrent()) return;
        setItems((prev) => (pageToken ? [...prev, ...result.items] : result.items));
        setNextPageToken(result.nextPageToken);
        setStatus("ready");
      } catch (err) {
        if (!isCurrent()) return;
        setError(err instanceof Error ? err.message : `No se pudo abrir ${source.label}.`);
        setStatus("error");
      }
    },
    [source, currentFolder.id, activeSearch, tab]
  );

  // El listado arranca en un microtask, no en el cuerpo del efecto: así
  // ningún setState corre sincrónicamente durante el render (regla
  // react-hooks/set-state-in-effect), que es justamente lo que provoca
  // renders en cascada. El contador de arriba se encarga de que una
  // respuesta vieja no escriba nada.
  useEffect(() => {
    Promise.resolve().then(() => load());
  }, [load]);

  // Escape cierra solo este explorador. Hace falta la fase de captura +
  // stopPropagation porque AdminPanel escucha Escape a nivel documento
  // para colapsar el panel entero: sin esto, salir de acá se llevaba
  // puesto el editor completo.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const openFolder = (item: CloudItem) => {
    setSearch("");
    setActiveSearch("");
    setCrumbs((prev) => [...prev, { id: item.id, name: item.name }]);
  };

  const goToCrumb = (index: number) => {
    setSearch("");
    setActiveSearch("");
    setCrumbs((prev) => prev.slice(0, index + 1));
  };

  const switchTab = (next: "mine" | "shared") => {
    setTab(next);
    setSearch("");
    setActiveSearch("");
    setSelected([]);
    setCrumbs([{ id: null, name: next === "mine" ? "Mi unidad" : "Compartidos conmigo" }]);
  };

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleImport = async () => {
    if (selected.length === 0) return;
    setError(null);
    setImporting(`0 de ${selected.length}`);
    try {
      const files = await source.browse.download(selected);
      setImporting("subiendo…");
      await onPicked(files);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron traer las fotos.");
      setImporting(null);
    }
  };

  /*
   * Va montado en <body>, no donde se lo invoca: AdminPanel es un panel
   * lateral que crea su propio contexto de posicionamiento, así que un
   * overlay `position: fixed` renderizado adentro se recorta contra los
   * ~440px del panel en vez de ocupar la ventana — el explorador quedaba
   * tan angosto como el formulario. No necesita guarda de montaje (el
   * patrón SSR-safe que sí necesita AdminPanel) porque este componente
   * solo existe después de que el usuario toca un botón, nunca durante
   * el render del servidor.
   */
  return createPortal(
    <div className="admin-gallery-overlay admin-cloud-overlay" onClick={onClose}>
      <div className="admin-cloud-browser" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="admin-gallery-header">
          <p>Importar desde {source.label}</p>
          <button type="button" className="admin-btn admin-btn-icon" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="admin-cloud-tabs">
          <button
            type="button"
            className={`admin-cloud-tab${tab === "mine" ? " active" : ""}`}
            onClick={() => switchTab("mine")}
          >
            Mi unidad
          </button>
          <button
            type="button"
            className={`admin-cloud-tab${tab === "shared" ? " active" : ""}`}
            onClick={() => switchTab("shared")}
          >
            Compartidos conmigo
          </button>
          <form
            className="admin-cloud-search"
            onSubmit={(e) => {
              e.preventDefault();
              setActiveSearch(search.trim());
            }}
          >
            <input
              type="search"
              value={search}
              placeholder="Buscar una foto por nombre…"
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit" className="admin-btn">
              Buscar
            </button>
          </form>
        </div>

        {activeSearch ? (
          <p className="admin-cloud-crumbs">
            Resultados para “{activeSearch}”{" "}
            <button
              type="button"
              className="admin-cloud-crumb"
              onClick={() => {
                setSearch("");
                setActiveSearch("");
              }}
            >
              limpiar
            </button>
          </p>
        ) : (
          <p className="admin-cloud-crumbs">
            {crumbs.map((crumb, i) => (
              <span key={`${crumb.id ?? "root"}-${i}`}>
                {i > 0 && <span aria-hidden="true"> / </span>}
                {i === crumbs.length - 1 ? (
                  <strong>{crumb.name}</strong>
                ) : (
                  <button type="button" className="admin-cloud-crumb" onClick={() => goToCrumb(i)}>
                    {crumb.name}
                  </button>
                )}
              </span>
            ))}
          </p>
        )}

        <div className="admin-cloud-scroll">
          {status === "connecting" && <p>Conectando con {source.label}… autorizá en la ventana de Google.</p>}
          {status === "loading" && <p>Cargando…</p>}
          {status === "ready" && items.length === 0 && (
            <p>{activeSearch ? "Ninguna foto con ese nombre." : "Esta carpeta no tiene fotos ni subcarpetas."}</p>
          )}

          {items.length > 0 && (
            <div className="admin-cloud-grid">
              {items.map((item) =>
                item.kind === "folder" ? (
                  <button
                    key={item.id}
                    type="button"
                    className="admin-cloud-item admin-cloud-folder"
                    onClick={() => openFolder(item)}
                    title={item.name}
                  >
                    <span className="admin-cloud-folder-icon" aria-hidden="true">
                      📁
                    </span>
                    <span className="admin-cloud-item-name">{item.name}</span>
                  </button>
                ) : (
                  <button
                    key={item.id}
                    type="button"
                    className={`admin-cloud-item${selected.includes(item.id) ? " selected" : ""}`}
                    onClick={() => toggle(item.id)}
                    title={item.name}
                    aria-pressed={selected.includes(item.id)}
                  >
                    {item.thumbnailUrl ? (
                      /* Miniatura firmada de Google servida desde otro
                         host: va como <img> directo (no pasa por el
                         optimizador de Next, que solo acepta hosts
                         declarados) y con referrerPolicy no-referrer,
                         que es lo que evita que googleusercontent
                         rechace el pedido por el Referer del panel. */
                      // eslint-disable-next-line @next/next/no-img-element -- host externo firmado, fuera del optimizador
                      <img src={item.thumbnailUrl} alt={item.name} referrerPolicy="no-referrer" loading="lazy" />
                    ) : (
                      <span className="admin-cloud-item-name">{item.name}</span>
                    )}
                    {selected.includes(item.id) && (
                      <span className="admin-cloud-check" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </button>
                )
              )}
            </div>
          )}

          {nextPageToken && status === "ready" && (
            <button type="button" className="admin-btn admin-cloud-more" onClick={() => load(nextPageToken)}>
              Ver más
            </button>
          )}
        </div>

        {error && <p className="admin-save-message error">{error}</p>}

        <div className="admin-cloud-footer">
          <span>
            {selected.length === 0
              ? "Tocá las fotos que quieras traer."
              : `${selected.length} foto${selected.length === 1 ? "" : "s"} elegida${selected.length === 1 ? "" : "s"}`}
          </span>
          <div className="admin-cloud-footer-actions">
            <button type="button" className="admin-btn" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-primary"
              onClick={handleImport}
              disabled={selected.length === 0 || importing !== null}
            >
              {importing ? `Importando ${importing}` : "Importar"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
