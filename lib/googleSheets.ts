import "server-only";
import crypto from "node:crypto";

/**
 * Cliente mínimo de Google Sheets, con la cuenta de servicio.
 *
 * Por qué no `googleapis`: se usan tres endpoints REST y la firma de un
 * JWT que Node ya sabe hacer (`crypto.sign`). El paquete oficial trae el
 * cliente generado de TODAS las APIs de Google — decenas de MB y una
 * superficie enorme — para eso. Se verificó contra la API real antes de
 * escribir esto, no se dedujo de la documentación.
 *
 * `import "server-only"`: acá vive la clave privada de la cuenta de
 * servicio. Nunca puede alcanzarse desde el navegador.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

/** Las tres pestañas que el sistema mantiene dentro de la hoja del catálogo. */
export const SHEET_PRODUCTS = "PRODUCTOS";
export const SHEET_KARDEX = "KARDEX";
export const SHEET_CONFIG = "CONFIGURACION";

export const PRODUCTS_HEADER = [
  "SKU",
  "PRODUCTO",
  "COLOR",
  "TALLA",
  "CORTE",
  "PRECIO",
  "STOCK",
  "STOCK_MINIMO",
  "ESTADO",
] as const;

export const KARDEX_HEADER = [
  "FECHA",
  "SKU",
  "PRODUCTO",
  "COLOR",
  "TALLA",
  "CORTE",
  "TIPO",
  "CANTIDAD",
  "SALDO",
  "MOTIVO",
  "OBSERVACION",
] as const;

export const KARDEX_TYPES = ["ENTRADA", "SALIDA", "AJUSTE", "DEVOLUCION"] as const;
export type KardexType = (typeof KARDEX_TYPES)[number];

export function isSheetsConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
}

/**
 * La clave llega en dos formas según de dónde salga y hay que
 * normalizarla siempre: en `.env.local` el loader de Next expande los
 * `\n` y quedan saltos reales, pero Vercel guarda el valor literal, así
 * que en producción llegan como la secuencia de dos caracteres. El
 * reemplazo es inofensivo cuando ya son saltos reales, y sin él la
 * clave no parsea (ver también el comentario en `.env.example`).
 */
function privateKey(): string {
  return (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
}

let cachedToken: { value: string; expiresAt: number } | null = null;

/**
 * Access token de la cuenta de servicio, firmando un JWT con su clave
 * privada. Se cachea en memoria hasta poco antes de vencer: Google los
 * emite por una hora y pedir uno nuevo en cada operación sería una
 * ida y vuelta extra por sincronización, para nada.
 */
async function accessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.value;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = privateKey();
  if (!email || !key) throw new Error("Falta configurar la cuenta de servicio de Google.");

  const now = Math.floor(Date.now() / 1000);
  const b64 = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const head = b64({ alg: "RS256", typ: "JWT" });
  const body = b64({ iss: email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 });
  const signature = crypto.sign("RSA-SHA256", Buffer.from(`${head}.${body}`), key).toString("base64url");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${head}.${body}.${signature}`,
    }),
  });
  const data: { access_token?: string; expires_in?: number; error_description?: string } = await res.json();
  if (!data.access_token) {
    throw new Error(data.error_description ?? "Google rechazó las credenciales de la cuenta de servicio.");
  }
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

async function sheetsFetch(path: string, init?: RequestInit): Promise<unknown> {
  const token = await accessToken();
  const res = await fetch(`${SHEETS_API}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new SheetsError(res.status, detail?.error?.message ?? `Google respondió ${res.status}.`);
  }
  return res.json();
}

/**
 * Error con el código HTTP a mano, para poder traducirlo a un mensaje
 * entendible (ver `describeSheetsError`) en vez de mostrarle al
 * administrador el texto crudo de la API de Google.
 */
export class SheetsError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "SheetsError";
  }
}

/** Traduce cualquier fallo a algo accionable. Nunca se muestra el error crudo de Google. */
export function describeSheetsError(err: unknown): string {
  if (err instanceof SheetsError) {
    if (err.status === 401 || err.status === 403) {
      return "Google no da acceso a la hoja. Revisá que esté compartida como Editor con la cuenta de servicio.";
    }
    if (err.status === 404) {
      return "No se encontró la hoja. Puede haber sido borrada o el identificador ser incorrecto.";
    }
    if (err.status === 429) {
      return "Google está limitando los pedidos. Esperá un momento y volvé a intentar.";
    }
    return "No se pudo sincronizar con Google Sheets. Intentá de nuevo en un momento.";
  }
  if (err instanceof Error && err.message.includes("cuenta de servicio")) return err.message;
  return "No se pudo conectar con Google. Verificá la conexión a internet.";
}

type SpreadsheetInfo = { title: string; tabs: string[] };

export async function getSpreadsheet(spreadsheetId: string): Promise<SpreadsheetInfo> {
  const data = (await sheetsFetch(
    `/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties.title`
  )) as { properties?: { title?: string }; sheets?: { properties?: { title?: string } }[] };
  return {
    title: data.properties?.title ?? "",
    tabs: (data.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean),
  };
}

/**
 * Deja la hoja con las tres pestañas y sus encabezados. Idempotente: se
 * puede llamar cuantas veces se quiera — solo crea lo que falta, nunca
 * duplica una pestaña ni pisa datos existentes.
 */
export async function ensureSheetStructure(
  spreadsheetId: string,
  config: { catalogId: string; catalogName: string }
): Promise<void> {
  const { tabs } = await getSpreadsheet(spreadsheetId);

  const missing = [SHEET_PRODUCTS, SHEET_KARDEX, SHEET_CONFIG].filter((t) => !tabs.includes(t));
  if (missing.length > 0) {
    await sheetsFetch(`/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
      }),
    });
  }

  // Los encabezados se escriben solo si la pestaña recién se creó: si ya
  // existía, sus datos mandan y reescribir la fila 1 podría desplazar lo
  // que el administrador tenga cargado.
  if (missing.includes(SHEET_PRODUCTS)) {
    await writeRange(spreadsheetId, `${SHEET_PRODUCTS}!A1`, [[...PRODUCTS_HEADER]]);
  }
  if (missing.includes(SHEET_KARDEX)) {
    await writeRange(spreadsheetId, `${SHEET_KARDEX}!A1`, [[...KARDEX_HEADER]]);
  }
  if (missing.includes(SHEET_CONFIG)) {
    await writeRange(spreadsheetId, `${SHEET_CONFIG}!A1`, [
      ["CATALOGO_ID", config.catalogId],
      ["CATALOGO_NOMBRE", config.catalogName],
      ["FECHA_CREACION", new Date().toISOString()],
      ["ULTIMA_SINCRONIZACION", ""],
    ]);
  }
}

export async function readRange(spreadsheetId: string, range: string): Promise<string[][]> {
  const data = (await sheetsFetch(
    `/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`
  )) as { values?: string[][] };
  return data.values ?? [];
}

export async function writeRange(
  spreadsheetId: string,
  range: string,
  values: (string | number)[][]
): Promise<void> {
  await sheetsFetch(
    `/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    { method: "PUT", body: JSON.stringify({ values }) }
  );
}

export async function appendRows(
  spreadsheetId: string,
  range: string,
  values: (string | number)[][]
): Promise<void> {
  if (values.length === 0) return;
  await sheetsFetch(
    `/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values }) }
  );
}

/** Vacía las filas de datos de una pestaña sin tocar su encabezado. */
export async function clearDataRows(spreadsheetId: string, sheet: string): Promise<void> {
  await sheetsFetch(
    `/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${sheet}!A2:Z100000`)}:clear`,
    { method: "POST", body: "{}" }
  );
}
