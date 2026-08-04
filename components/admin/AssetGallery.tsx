"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useAssets, type ClientAsset } from "./AssetsContext";
import { recordDriveLinkAction, deleteAssetAction } from "@/app/admin/actions";
import { uploadFile, replaceFile } from "@/lib/uploadClient";
import { CLOUD_SOURCES, type CloudSource, type CloudPickedFile } from "@/lib/cloudSources";
import CloudBrowser from "./CloudBrowser";
import type { DriveLink } from "@/lib/driveLinks";
import { useToast } from "./ToastContext";
import { useConfirm } from "./ConfirmDialogContext";

type AssetGalleryProps = {
  /** Ruta actualmente elegida (si esta grilla vive dentro de un campo puntual) — resalta esa miniatura. */
  selectedPath?: string;
  /** Se llama al hacer click en una imagen ya subida. */
  onPick?: (path: string) => void;
  /** Se llama después de subir/importar una imagen nueva (dispara el aviso de "recién subida" en quien la use). `hadFailures` avisa si alguna de la tanda falló, para que quien la use no cierre la ventana y tape el mensaje de error. */
  onUploaded?: (path: string, hadFailures?: boolean) => void;
  /** Se llama justo al arrancar un intento de subida/importación, antes de saber si va a andar — para que quien la use pueda limpiar un aviso de "recién subida" de una subida anterior. */
  onUploadStart?: () => void;
};

/**
 * Grilla de imágenes + fila de subida/importación, extraída de
 * ImagePicker (antes vivía inline en su modal) para poder reusarla
 * también como pestaña de biblioteca completa en el panel rediseñado,
 * sin duplicar la lógica de subida/importación/re-sync desde Drive.
 * ImagePicker sigue siendo dueño de su propio modal (abrir/cerrar) y
 * del aviso "recién subida" — acá solo vive lo que la grilla en sí
 * necesita.
 */
export default function AssetGallery({ selectedPath, onPick, onUploaded, onUploadStart }: AssetGalleryProps) {
  const { assets, addAsset, removeAsset, usedPaths, catalogId } = useAssets();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [uploading, setUploading] = useState(false);
  /** "2 de 5" mientras se sube una tanda — sin esto, subir varias fotos grandes parecía colgado. */
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [syncingPath, setSyncingPath] = useState<string | null>(null);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [cloudLoadingId, setCloudLoadingId] = useState<string | null>(null);
  /** Proveedor cuyo explorador está abierto (null = ninguno). */
  const [browsingSource, setBrowsingSource] = useState<CloudSource | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Sube una o varias imágenes de una — arrastradas, pegadas, o elegidas de a varias en el picker de archivos. Selecciona la primera que suba bien, igual que la importación desde Drive ya hacía. */
  const handleFilesSelected = async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    setUploading(true);
    setUploadError(null);
    onUploadStart?.();
    let firstPath: string | null = null;
    // Cada foto se sube en su propio intento: antes, un solo fallo
    // cortaba la tanda entera desde el primer error y las que faltaban
    // ni se intentaban — el motivo real de "solo se puede una por una".
    // Ahora se suben todas las que se puedan y el aviso dice cuáles no
    // y por qué.
    const failures: string[] = [];
    try {
      for (const [i, file] of imageFiles.entries()) {
        setUploadProgress(imageFiles.length > 1 ? `${i + 1} de ${imageFiles.length}` : null);
        try {
          const result = await uploadFile(file, catalogId);
          if (result.ok) {
            addAsset({ path: result.path, filename: result.path.split("/").pop() ?? file.name, previewUrl: URL.createObjectURL(file) });
            firstPath = firstPath ?? result.path;
          } else {
            failures.push(result.error);
          }
        } catch (err) {
          failures.push(`"${file.name}": ${err instanceof Error ? err.message : "error desconocido"}`);
        }
      }
      if (firstPath) onUploaded?.(firstPath, failures.length > 0);
      if (failures.length > 0) {
        const subidas = imageFiles.length - failures.length;
        setUploadError(
          `${subidas} de ${imageFiles.length} subidas. No se pudieron subir: ${failures.join(" · ")}`
        );
      }
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Pegar con Ctrl+V funciona en cualquier parte mientras esta grilla
  // está en pantalla, no solo con el foco puesto en un campo puntual —
  // mismo patrón que StepImages.tsx (Paso 2 del wizard de creación).
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter((item) => item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((f): f is File => f !== null);
      if (files.length > 0) {
        e.preventDefault();
        handleFilesSelected(files);
      }
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Importar desde un CloudSource (Google Drive) — antes solo existía en
   * el wizard de creación (StepImages.tsx); misma lógica reusada acá
   * para poder traer una foto nueva de Drive desde cualquier lugar que
   * use esta grilla. Selecciona la primera imagen importada, igual que
   * subir un archivo local.
   */
  const importFromCloud = async (source: CloudSource, picked: CloudPickedFile[]) => {
    setUploadError(null);
    setCloudLoadingId(source.id);
    try {
      if (picked.length === 0) return; // cerró sin elegir nada, no es un error
      let firstPath: string | null = null;
      for (const file of picked) {
        const res = await uploadFile(new File([file.blob], file.name, { type: file.blob.type }), catalogId);
        if (!res.ok) {
          setUploadError(res.error);
          continue;
        }
        let driveLink: DriveLink | undefined;
        if (source.resyncFile) {
          const linkResult = await recordDriveLinkAction(
            res.path,
            source.id as DriveLink["provider"],
            file.sourceFileId,
            file.name
          );
          if (linkResult.ok) {
            driveLink = {
              path: res.path,
              provider: source.id as DriveLink["provider"],
              fileId: file.sourceFileId,
              fileName: file.name,
              lastSyncedAt: new Date().toISOString(),
            };
          }
        }
        addAsset({ path: res.path, filename: res.path.split("/").pop() ?? file.name, previewUrl: file.previewUrl, driveLink });
        firstPath = firstPath ?? res.path;
      }
      if (firstPath) onUploaded?.(firstPath);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : `No se pudo importar desde ${source.label}.`);
    } finally {
      setCloudLoadingId(null);
    }
  };

  /**
   * Re-sync manual (Fase F): re-descarga el archivo por el fileId
   * guardado en el vínculo, comitea el reemplazo a la misma ruta, y
   * actualiza el vínculo (lastSyncedAt). El consentimiento OAuth se
   * vuelve a pedir cada vez (mismo diseño que la importación original,
   * ver lib/cloudSources/googleDrive.ts) — no se persiste ningún
   * refresh token.
   */
  const handleResync = async (asset: ClientAsset) => {
    const link = asset.driveLink;
    if (!link) return;
    const source = CLOUD_SOURCES.find((s) => s.id === link.provider);
    if (!source?.resyncFile) return;

    setSyncingPath(asset.path);
    try {
      const { blob, previewUrl } = await source.resyncFile(link.fileId);
      const uploadResult = await replaceFile(asset.path, blob, link.fileName);
      if (!uploadResult.ok) {
        showToast(uploadResult.error, "error");
        return;
      }
      const linkResult = await recordDriveLinkAction(asset.path, link.provider, link.fileId, link.fileName);
      if (!linkResult.ok) {
        showToast(linkResult.error, "error");
        return;
      }
      addAsset({ ...asset, previewUrl, driveLink: { ...link, lastSyncedAt: new Date().toISOString() } });
      showToast(`"${asset.filename}" actualizada desde ${source.label}.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "No se pudo actualizar la imagen desde Drive.", "error");
    } finally {
      setSyncingPath(null);
    }
  };

  /**
   * Solo se ofrece sobre imágenes que ningún catálogo usa (el botón ni
   * siquiera se dibuja en las demás), pero igual se pide confirmación:
   * borrar una foto de Blob no se puede deshacer, y la lista que ve el
   * panel puede estar más vieja que el último deploy.
   */
  const handleDelete = async (asset: ClientAsset) => {
    const confirmed = await confirm({
      title: "Eliminar imagen",
      message: `"${asset.filename}" se va a borrar definitivamente. No se puede deshacer.`,
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!confirmed) return;

    setDeletingPath(asset.path);
    try {
      const result = await deleteAssetAction(asset.path);
      if (!result.ok) {
        showToast(result.error, "error");
        return;
      }
      removeAsset(asset.path);
      showToast(`"${asset.filename}" eliminada.`);
    } catch {
      showToast("No se pudo eliminar la imagen.", "error");
    } finally {
      setDeletingPath(null);
    }
  };

  /**
   * La biblioteca se muestra en dos grupos — en uso y sin usar — en vez
   * de una grilla sola con una etiquetita "sin usar" en las que no lo
   * están: con decenas de fotos, encontrar cuáles quedaron colgadas de
   * una prueba (o cuáles se pueden borrar sin romper nada) obligaba a
   * recorrerlas una por una. El dato de "en uso" ya existía
   * (`usedPaths`, calculado en el servidor sobre todos los catálogos
   * publicados); esto solo lo usa para agrupar además de para etiquetar.
   */
  const usedAssets = assets.filter((asset) => usedPaths.has(asset.path));
  const unusedAssets = assets.filter((asset) => !usedPaths.has(asset.path));

  const renderAsset = (asset: ClientAsset) => (
          <div className="admin-gallery-item-wrap" key={asset.path}>
            <button
              type="button"
              className={`admin-gallery-item${asset.path === selectedPath ? " selected" : ""}`}
              onClick={() => onPick?.(asset.path)}
              title={asset.filename}
            >
              {/* Miniaturas por el optimizador de Next, no la foto
                  original: una foto subida desde el panel puede pesar
                  varios MB y la galería dibuja decenas a la vez — eso
                  era lo que hacía que abrir "Elegir imagen" se
                  arrastrara. Con `width/height` chicos, Next sirve una
                  versión de ~100px. La excepción es una subida de esta
                  misma sesión: su vista previa es un `blob:` URL local,
                  que el optimizador no puede tomar. */}
              {asset.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- blob: URL local, next/image no lo acepta
                <img src={asset.previewUrl} alt={asset.filename} />
              ) : (
                <Image src={asset.path} alt={asset.filename} width={240} height={240} />
              )}
            </button>
            {asset.driveLink && (
              <>
                <span className="admin-gallery-item-badge" title={`Importada desde ${asset.driveLink.fileName}`}>
                  Drive
                </span>
                <button
                  type="button"
                  className="admin-gallery-item-sync"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResync(asset);
                  }}
                  disabled={syncingPath === asset.path}
                  title="Revisar actualización en Drive"
                  aria-label="Revisar actualización en Drive"
                >
                  {syncingPath === asset.path ? "…" : "↻"}
                </button>
              </>
            )}
            {!usedPaths.has(asset.path) && (
              <>
                <span className="admin-gallery-item-unused" title="Ningún catálogo publicado usa esta imagen">
                  sin usar
                </span>
                <button
                  type="button"
                  className="admin-gallery-item-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(asset);
                  }}
                  disabled={deletingPath === asset.path}
                  title="Eliminar imagen"
                  aria-label={`Eliminar ${asset.filename}`}
                >
                  {deletingPath === asset.path ? "…" : "🗑"}
                </button>
              </>
            )}
          </div>
  );

  return (
    <>
      {/* Un solo contenedor scrolleable para los dos grupos: dentro del
          modal "Elegir imagen" es el que tiene que scrollear (ver
          .admin-gallery-scroll en admin.css). */}
      <div className="admin-gallery-scroll">
        {assets.length === 0 && <p>Todavía no hay imágenes.</p>}

        {usedAssets.length > 0 && (
          <section className="admin-gallery-group">
            <h4 className="admin-gallery-group-title">
              En uso <span>{usedAssets.length}</span>
            </h4>
            <div className="admin-gallery-grid">{usedAssets.map(renderAsset)}</div>
          </section>
        )}

        {unusedAssets.length > 0 && (
          <section className="admin-gallery-group">
            <h4 className="admin-gallery-group-title">
              Sin usar <span>{unusedAssets.length}</span>
            </h4>
            <p className="admin-gallery-group-hint">
              Ningún catálogo publicado usa estas fotos. Son las únicas que se pueden borrar.
            </p>
            <div className="admin-gallery-grid">{unusedAssets.map(renderAsset)}</div>
          </section>
        )}
      </div>

      <div
        className={`admin-wizard-dropzone${dragOver ? " drag-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFilesSelected(Array.from(e.dataTransfer.files));
        }}
      >
        <p>Arrastrá fotos acá, pegalas con Ctrl+V, o</p>
        <div className="admin-wizard-dropzone-actions">
          <button type="button" className="admin-btn admin-btn-primary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? `Subiendo${uploadProgress ? ` ${uploadProgress}` : ""}…` : "Elegir archivos"}
          </button>
          {CLOUD_SOURCES.map((source) => {
            const configured = source.isConfigured();
            return (
              <button
                key={source.id}
                type="button"
                className="admin-btn"
                onClick={() => setBrowsingSource(source)}
                disabled={!configured || cloudLoadingId !== null}
                title={configured ? undefined : source.unconfiguredReason?.()}
              >
                {cloudLoadingId === source.id ? "Importando…" : `Importar desde ${source.label}`}
              </button>
            );
          })}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) handleFilesSelected(Array.from(e.target.files));
          }}
          disabled={uploading}
        />
      </div>
      {uploadError && <p className="admin-save-message error">{uploadError}</p>}

      {browsingSource && (
        <CloudBrowser
          source={browsingSource}
          onPicked={(files) => importFromCloud(browsingSource, files)}
          onClose={() => setBrowsingSource(null)}
        />
      )}
    </>
  );
}
