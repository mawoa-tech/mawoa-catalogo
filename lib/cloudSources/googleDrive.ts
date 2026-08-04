import type { CloudSource, CloudPickedFile, CloudItem, CloudListParams } from "./types";

// Google no ofrece paquetes npm para esto — Identity Services solo se
// carga como <script> global, así que estos tipos quedan como `any` a
// propósito (no hay @types oficiales tampoco).
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sin @types oficiales para el script global de Google Identity Services
    google: any;
  }
}

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";

function clientId(): string | undefined {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
}

/**
 * Desde que el explorador es propio (ya no se usa el Picker de Google),
 * la API Key y el número de proyecto dejaron de hacer falta: la API de
 * Drive se llama con el access token del usuario y nada más.
 */
function isGoogleDriveConfigured(): boolean {
  return Boolean(clientId());
}

function unconfiguredReason(): string {
  return "Falta configurar NEXT_PUBLIC_GOOGLE_CLIENT_ID para habilitar la importación desde Google Drive.";
}

let scriptsLoadingPromise: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`No se pudo cargar ${src}.`));
    document.head.appendChild(script);
  });
}

/** Carga el cliente de Google Identity Services — una sola vez, reusada entre importaciones. */
function loadGoogleScripts(): Promise<void> {
  if (!scriptsLoadingPromise) {
    scriptsLoadingPromise = loadScript("https://accounts.google.com/gsi/client");
  }
  return scriptsLoadingPromise;
}

/**
 * Token vivo de esta pestaña. Google los emite con ~1 hora de validez,
 * así que reusarlo mientras dure evita volver a abrir el popup en cada
 * importación — que es lo que hacía antes, una vez por foto. Vive solo
 * en memoria y muere con la pestaña: sigue sin persistirse ningún
 * refresh token (decisión de la Fase E, que es lo que evitaría tener
 * que meter una base de datos en este proyecto).
 */
let cachedToken: { value: string; expiresAt: number } | null = null;

/** Margen para no usar un token que caduca mientras se descargan las fotos. */
const TOKEN_SAFETY_MARGIN_MS = 60_000;

/**
 * Pide un access token de corta duración vía el token client de GIS.
 * `prompt: ""` es lo que hace que, una vez concedido el permiso, Google
 * devuelva el token sin volver a mostrar el selector de cuenta — sin
 * eso GIS asume su valor por defecto y vuelve a preguntar siempre.
 * Sin `error_callback`, cerrar el popup de consentimiento deja la
 * promesa colgada para siempre (comportamiento documentado de GIS) — el
 * mismo tipo de bug de "botón pegado en Cargando…" que este proyecto ya
 * tuvo que arreglar una vez en el login, así que se maneja explícito.
 */
function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - TOKEN_SAFETY_MARGIN_MS) {
    return Promise.resolve(cachedToken.value);
  }

  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId(),
      scope: DRIVE_SCOPE,
      prompt: "",
      callback: (response: { error?: string; access_token: string; expires_in?: number }) => {
        if (response.error) {
          reject(new Error(response.error));
        } else {
          const ttlMs = (response.expires_in ?? 3600) * 1000;
          cachedToken = { value: response.access_token, expiresAt: Date.now() + ttlMs };
          resolve(response.access_token);
        }
      },
      error_callback: (err: { type: string }) => {
        if (err.type === "popup_closed") {
          reject(new Error("Se cerró la ventana de Google sin elegir una cuenta."));
        } else {
          reject(new Error("No se pudo abrir la ventana de autorización de Google."));
        }
      },
    });
    tokenClient.requestAccessToken();
  });
}

async function connect(): Promise<void> {
  if (!isGoogleDriveConfigured()) {
    throw new Error(unconfiguredReason());
  }
  await loadGoogleScripts();
  await getAccessToken();
}

/**
 * Las comillas simples delimitan los literales del lenguaje de consulta
 * de Drive, así que un nombre buscado que las contenga (`O'Brien`)
 * rompería la consulta entera si no se escapa.
 */
function escapeQueryLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function buildQuery({ folderId, search, shared }: CloudListParams): string {
  const notTrashed = "trashed = false";
  const imagesOnly = "mimeType contains 'image/'";
  const foldersOrImages = `(mimeType = '${FOLDER_MIME}' or ${imagesOnly})`;

  if (search) {
    // Buscar sí o sí en todo el drive: limitar la búsqueda a la carpeta
    // abierta sería inútil justamente cuando no sabés dónde está la foto.
    return `name contains '${escapeQueryLiteral(search)}' and ${notTrashed} and ${imagesOnly}`;
  }
  if (shared && !folderId) {
    return `sharedWithMe = true and ${notTrashed} and ${foldersOrImages}`;
  }
  return `'${escapeQueryLiteral(folderId ?? "root")}' in parents and ${notTrashed} and ${foldersOrImages}`;
}

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
};

async function list(params: CloudListParams): Promise<{ items: CloudItem[]; nextPageToken?: string }> {
  const token = await getAccessToken();

  const url = new URL(DRIVE_FILES_URL);
  url.searchParams.set("q", buildQuery(params));
  url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,thumbnailLink)");
  url.searchParams.set("pageSize", "100");
  // Carpetas primero y después por nombre: es el orden con el que la
  // gente recorre un árbol de archivos, no el de fecha.
  url.searchParams.set("orderBy", "folder,name");
  url.searchParams.set("spaces", "drive");
  // Sin estos dos, las unidades compartidas de una organización quedan
  // invisibles aunque el usuario tenga acceso.
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  if (params.pageToken) url.searchParams.set("pageToken", params.pageToken);

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    cachedToken = null;
    throw new Error("La sesión de Google venció. Probá de nuevo.");
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error?.message ?? `Google Drive respondió ${res.status}.`);
  }

  const data: { files?: DriveFile[]; nextPageToken?: string } = await res.json();
  const items: CloudItem[] = (data.files ?? []).map((file) => ({
    id: file.id,
    name: file.name,
    kind: file.mimeType === FOLDER_MIME ? "folder" : "image",
    // `thumbnailLink` viene firmado y de corta duración: se usa tal cual
    // como src (ver el comentario sobre referrerPolicy en CloudBrowser),
    // pidiendo un tamaño mayor que el s220 por defecto para que no se
    // vea borrosa en la grilla.
    thumbnailUrl: file.thumbnailLink?.replace(/=s\d+$/, "=s400"),
  }));

  return { items, nextPageToken: data.nextPageToken };
}

async function downloadFile(fileId: string, accessToken: string): Promise<{ blob: Blob; previewUrl: string }> {
  const res = await fetch(`${DRIVE_FILES_URL}/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) {
    // El token cacheado dejó de servir (revocado, o cambió la cuenta):
    // tirarlo para que el próximo intento vuelva a pedirlo en vez de
    // reintentar para siempre contra un token muerto.
    cachedToken = null;
    throw new Error("La sesión de Google venció. Probá importar de nuevo.");
  }
  if (!res.ok) {
    throw new Error(`No se pudo descargar el archivo de Drive (${res.status}).`);
  }
  const blob = await res.blob();
  const previewUrl = URL.createObjectURL(blob);
  return { blob, previewUrl };
}

/** Metadata mínima (el nombre) de archivos ya elegidos, para nombrar bien lo que se sube. */
async function fileName(fileId: string, accessToken: string): Promise<string> {
  const res = await fetch(`${DRIVE_FILES_URL}/${fileId}?fields=name&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return `drive-${fileId}.jpg`;
  const data: { name?: string } = await res.json();
  return data.name ?? `drive-${fileId}.jpg`;
}

async function download(ids: string[]): Promise<CloudPickedFile[]> {
  const token = await getAccessToken();
  const files: CloudPickedFile[] = [];
  for (const id of ids) {
    const name = await fileName(id, token);
    const { blob, previewUrl } = await downloadFile(id, token);
    files.push({ name, blob, previewUrl, sourceFileId: id });
  }
  return files;
}

/**
 * Re-sync manual (Fase F): vuelve a descargar un archivo ya conocido por
 * id, sin abrir el explorador — el fileId ya está guardado en el vínculo
 * (lib/driveLinks.ts) desde la importación original.
 */
async function resyncFile(fileId: string): Promise<{ blob: Blob; previewUrl: string }> {
  await loadGoogleScripts();
  const accessToken = await getAccessToken();
  return downloadFile(fileId, accessToken);
}

export const googleDriveSource: CloudSource = {
  id: "google-drive",
  label: "Google Drive",
  isConfigured: isGoogleDriveConfigured,
  unconfiguredReason,
  browse: { connect, list, download },
  resyncFile,
};
