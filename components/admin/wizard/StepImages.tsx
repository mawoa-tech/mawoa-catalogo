"use client";

import { useEffect, useRef, useState } from "react";
import { recordDriveLinkAction } from "@/app/admin/actions";
import { uploadFile } from "@/lib/uploadClient";
import { useAssets } from "../AssetsContext";
import { CLOUD_SOURCES, type CloudSource, type CloudPickedFile } from "@/lib/cloudSources";
import CloudBrowser from "../CloudBrowser";
import type { DriveLink } from "@/lib/driveLinks";

export type WizardImage = { path: string; previewUrl: string };

type StepImagesProps = {
  images: WizardImage[];
  onChange: (images: WizardImage[]) => void;
  slotCount: number;
  /** Id que va a tener el catálogo que se está creando — se usa para nombrar las fotos que se suban acá (ver buildAssetName en lib/assets.ts). */
  catalogId?: string;
};

/**
 * Paso 2 del wizard: arrastrar, pegar (Ctrl+V) o elegir archivos — las
 * tres formas suben por el mismo `uploadFile` (lib/uploadClient.ts) que
 * ya usa ImagePicker en el editor (mismo commit real a GitHub, mismas
 * validaciones de extensión/nombre). Las miniaturas se pueden
 * reordenar arrastrándolas: es la única excepción deliberada al Non
 * Goal de "no drag-and-drop" de este proyecto — ese Non Goal apunta a
 * no reordenar páginas/bloques del catálogo con drag-and-drop, no a
 * una grilla de miniaturas de subida, que es el patrón estándar para
 * esto y no toca el modelo de bloques en absoluto.
 */
export default function StepImages({ images, onChange, slotCount, catalogId }: StepImagesProps) {
  const { addAsset } = useAssets();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOverDropzone, setDragOverDropzone] = useState(false);
  const [cloudLoadingId, setCloudLoadingId] = useState<string | null>(null);
  /** Proveedor cuyo explorador está abierto (null = ninguno). */
  const [browsingSource, setBrowsingSource] = useState<CloudSource | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Agrega cada foto a la grilla apenas termina de subir esa foto en
  // particular — no recién al final de todo el lote (bug real: con
  // varias fotos a la vez, la grilla se quedaba sin cambios y sin
  // ningún indicador por foto durante toda la espera, así que se sentía
  // trabado/roto en vez de "subiendo de a una"). Mismo patrón que
  // AssetGallery ya usa en el editor normal, donde esto nunca pasó.
  const uploadFiles = async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    setError(null);
    setUploading(true);
    let current = images;
    for (const file of imageFiles) {
      try {
        const res = await uploadFile(file, catalogId);
        if (res.ok) {
          const previewUrl = URL.createObjectURL(file);
          current = [...current, { path: res.path, previewUrl }];
          onChange(current);
          addAsset({ path: res.path, filename: res.path.split("/").pop() ?? file.name, previewUrl });
        } else {
          setError(res.error);
        }
      } catch {
        setError("No se pudo leer una de las imágenes.");
      }
    }
    setUploading(false);
  };

  // Cada foto elegida en el explorador ya llega con su Blob y una
  // previewUrl propia (lib/cloudSources/*) — de ahí en más sube
  // exactamente igual que un archivo local: mismo uploadFile, mismo
  // commit real a GitHub.
  const importFromCloud = async (source: CloudSource, picked: CloudPickedFile[]) => {
    setError(null);
    setCloudLoadingId(source.id);
    try {
      if (picked.length === 0) return; // cerró sin elegir nada, no es un error
      let current = images;
      for (const file of picked) {
        const res = await uploadFile(new File([file.blob], file.name, { type: file.blob.type }), catalogId);
        if (res.ok) {
          current = [...current, { path: res.path, previewUrl: file.previewUrl }];
          onChange(current);
          // Vínculo con el archivo de origen (Fase F) — solo si este
          // source soporta re-sync; de lo contrario no hay fileId
          // significativo que guardar para más adelante.
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
          addAsset({
            path: res.path,
            filename: res.path.split("/").pop() ?? file.name,
            previewUrl: file.previewUrl,
            driveLink,
          });
        } else {
          setError(res.error);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `No se pudo importar desde ${source.label}.`);
    } finally {
      setCloudLoadingId(null);
    }
  };

  // Pegar con Ctrl+V funciona en cualquier parte de este paso, no solo
  // con el foco puesto en un elemento puntual — más tolerante para
  // alguien sin experiencia técnica.
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter((item) => item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((f): f is File => f !== null);
      if (files.length > 0) {
        e.preventDefault();
        uploadFiles(files);
      }
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images]);

  const removeAt = (i: number) => {
    onChange(images.filter((_, idx) => idx !== i));
  };

  const reorder = (from: number, to: number) => {
    if (from === to) return;
    const next = [...images];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  return (
    <div className="admin-wizard-step">
      <p className="admin-image-picker-note">
        Esta plantilla tiene {slotCount} espacio{slotCount === 1 ? "" : "s"} de foto. Las que subas acá se usan en
        ese orden (portada, manifiesto, cada colorway, cierre); las que falten quedan con las fotos de muestra de
        la plantilla — se pueden cambiar una por una en el Paso 3.
      </p>

      <div
        className={`admin-wizard-dropzone${dragOverDropzone ? " drag-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverDropzone(true);
        }}
        onDragLeave={() => setDragOverDropzone(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOverDropzone(false);
          uploadFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <p>Arrastrá fotos acá, pegalas con Ctrl+V, o</p>
        <div className="admin-wizard-dropzone-actions">
          <button type="button" className="admin-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? "Subiendo…" : "Elegir archivos"}
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
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) uploadFiles(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
      </div>

      {error && <p className="admin-save-message error">{error}</p>}

      {images.length > 0 && (
        <div className="admin-wizard-thumbs">
          {images.map((img, i) => (
            <div
              key={img.path}
              className="admin-wizard-thumb"
              draggable
              onDragStart={() => {
                dragIndexRef.current = i;
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragIndexRef.current;
                dragIndexRef.current = null;
                if (from !== null) reorder(from, i);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- blob: previews locales, next/image no sirve para eso */}
              <img src={img.previewUrl} alt="" />
              <button
                type="button"
                className="admin-wizard-thumb-remove"
                onClick={() => removeAt(i)}
                aria-label="Quitar foto"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {browsingSource && (
        <CloudBrowser
          source={browsingSource}
          onPicked={(files) => importFromCloud(browsingSource, files)}
          onClose={() => setBrowsingSource(null)}
        />
      )}
    </div>
  );
}
