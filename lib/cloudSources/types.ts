/**
 * Contrato desacoplado para "traer imágenes desde un servicio en la
 * nube" (Fase E, 2026-07-28) — Google Drive es la primera y única
 * implementación por ahora; Dropbox/OneDrive podrían sumarse después
 * agregando otro módulo que cumpla esta misma interfaz, sin tocar
 * StepImages ni el resto del wizard.
 */
export type CloudPickedFile = {
  name: string;
  /**
   * El contenido crudo, no base64 — se sube vía el Route Handler
   * (app/api/admin/upload/route.ts) como multipart/form-data, no como
   * argumento de un Server Action (fix, 2026-07-28: un string base64 de
   * varios MB — típico en una foto real de Drive sin optimizar — choca
   * con un límite interno de React mucho antes de llegar al límite de
   * tamaño ya configurado).
   */
  blob: Blob;
  /** blob: URL local para mostrar la miniatura antes de que la próxima build sirva el archivo real. */
  previewUrl: string;
  /** Id del archivo en el proveedor de origen — se guarda como vínculo (lib/driveLinks.ts) para poder re-sincronizar más tarde (Fase F). */
  sourceFileId: string;
};

/** Una carpeta o una imagen, tal como se dibuja en la grilla del explorador. */
export type CloudItem = {
  id: string;
  name: string;
  kind: "folder" | "image";
  /** URL de miniatura ya utilizable como `src` — puede faltar (archivo sin vista previa generada). */
  thumbnailUrl?: string;
};

export type CloudListParams = {
  /** null = la raíz de la unidad del usuario. */
  folderId: string | null;
  /** Cuando viene, busca por nombre en todo el drive e ignora `folderId`. */
  search?: string;
  /** true = "compartidos conmigo" en vez de la unidad propia. */
  shared?: boolean;
  pageToken?: string;
};

/**
 * Navegación del proveedor dibujada por *nosotros* (components/admin/CloudBrowser.tsx)
 * en vez de por el widget del proveedor. Sustituye al Picker de Google,
 * cuya interfaz vive dentro de un iframe y no admite ningún estilo — se
 * veía como una pieza ajena pegada dentro del panel.
 */
export type CloudBrowser = {
  /** Pide autorización si hace falta. Separado de `list` para poder mostrar el estado "conectando" antes del primer listado. */
  connect: () => Promise<void>;
  list: (params: CloudListParams) => Promise<{ items: CloudItem[]; nextPageToken?: string }>;
  /** Descarga los archivos elegidos, ya listos para subir. */
  download: (ids: string[]) => Promise<CloudPickedFile[]>;
};

export type CloudSource = {
  id: string;
  label: string;
  /** false si falta configuración (credenciales, etc.) — el botón de este source no debería intentar abrir nada en ese caso. */
  isConfigured: () => boolean;
  /** Motivo human-legible de por qué no está configurado, para mostrar en vez de fallar en silencio. */
  unconfiguredReason?: () => string;
  /** Explorador propio del panel para este proveedor. */
  browse: CloudBrowser;
  /**
   * Re-descarga un archivo ya conocido por id, sin abrir el explorador
   * (Fase F) — opcional porque un proveedor futuro podría no soportar
   * re-sync.
   */
  resyncFile?: (fileId: string) => Promise<{ blob: Blob; previewUrl: string }>;
};
