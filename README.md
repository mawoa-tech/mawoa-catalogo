# Catálogo Digital

Lookbook/catálogo digital, generado desde datos estructurados (no editado a mano página por página). Next.js App Router + React 19 + TypeScript, con un panel de administración que comitea los cambios directo al repo de GitHub (no hay base de datos ni filesystem editable en producción).

La arquitectura completa está documentada en [`CLAUDE.md`](./CLAUDE.md). Este README cubre solo lo necesario para levantar el proyecto **en un entorno nuevo** (otro repo, otro proyecto de Vercel, otra máquina).

## Resumen: ¿qué se lleva un clon/fork y qué no?

El código sí. **Las variables de entorno no** — están en `.gitignore` (`.env*`) a propósito, porque son credenciales. Cloná este repo a otro lado, o conectalo a otro proyecto de Vercel, y **ninguna** de las integraciones de abajo va a funcionar hasta que las configures de nuevo ahí: ni GitHub, ni el login del admin, ni Google Drive.

Esto responde directamente la pregunta de "¿usaría mi API de Google?": **no automáticamente**. Ver la sección [Google Drive](#google-drive-opcional---solo-si-usás-importar-desde-drive) para el motivo exacto y los dos pasos que hacen falta.

## 1. Instalación local

```bash
npm install     # también corre `playwright install chromium` (postinstall, para el export a PDF)
cp .env.example .env.local   # completar con tus propios valores, ver abajo
npm run dev
```

- `npm run dev` — servidor de desarrollo
- `npm run build` — build de producción (`next build` + genera un PDF por catálogo en `public/`)
- `npm run start` — corre el build de producción
- `npm run lint` — ESLint

No hay suite de tests configurada.

## 2. Variables de entorno

| Variable | Obligatoria | Para qué |
|---|---|---|
| `GITHUB_TOKEN` | Sí, para guardar cambios | Token de GitHub con el que el admin comitea (catálogos, imágenes). Ver [2.1](#21-github). |
| `GITHUB_REPO` | Sí, para guardar cambios | `owner/repo` — **el repo al que se comitea**, no necesariamente el mismo del que corre el sitio. |
| `GITHUB_BRANCH` | No (default `main`) | Rama a la que se comitea. |
| `ADMIN_USERNAME` | Sí, para entrar a `/admin` | Usuario del único admin. |
| `ADMIN_PASSWORD_HASH` | Sí, para entrar a `/admin` | Hash bcrypt de la contraseña — **nunca texto plano**. Ver [2.2](#22-credenciales-del-admin). |
| `AUTH_SECRET` | Sí, para entrar a `/admin` | Clave para firmar el JWT de sesión (cookie httpOnly). Ver [2.2](#22-credenciales-del-admin). |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | No — solo para "Importar desde Google Drive" | OAuth Client ID de Google Cloud. Es la **única** credencial de Google que necesita Drive. Ver [2.3](#23-google-drive-opcional). |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | No — solo para el inventario en Google Sheets | Correo de la cuenta de servicio que escribe en la hoja. Ver [2.4](#24-inventario-en-google-sheets-opcional). |
| `GOOGLE_PRIVATE_KEY` | No — solo para el inventario | Clave privada de esa cuenta de servicio. **Solo servidor**, nunca `NEXT_PUBLIC_`. Ver [2.4](#24-inventario-en-google-sheets-opcional). |
| `INVENTARIO_READ_WRITE_TOKEN` | No — solo para el inventario | Token del store de Blob **privado** donde vive el stock. Ver [2.5](#25-d%C3%B3nde-vive-el-stock). |

Sin `GITHUB_TOKEN`/`GITHUB_REPO`, todo lo demás del sitio funciona igual — solo falla (con un mensaje claro, no un cuelgue) el botón "Guardar y publicar" y la subida de imágenes. Sin `AUTH_SECRET`/`ADMIN_*`, `/admin` no es accesible. Sin las tres `NEXT_PUBLIC_GOOGLE_*`, el botón de Drive queda deshabilitado con un tooltip que dice exactamente cuál falta — el resto del panel funciona normal.

### 2.1 GitHub

1. Generá un **fine-grained personal access token** (GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens), con acceso solo al repo donde vive el contenido (`data/catalogs/*.json`, `public/imagenes/`) y permiso **Contents: Read and write**.
2. `GITHUB_REPO` = `tu-usuario/tu-repo` (el repo destino de los commits — si movés este proyecto a un fork o a otro repo, este valor tiene que apuntar ahí, si no el panel va a seguir comiteando al repo original).
3. El admin panel usa la API GraphQL de GitHub (`createCommitOnBranch`) para comitear — no necesita nada más de tu lado que el token con ese permiso.

### 2.2 Credenciales del admin

```bash
# AUTH_SECRET: cualquier string largo y aleatorio
openssl rand -base64 32

# ADMIN_PASSWORD_HASH: hash bcrypt de tu contraseña real
npx bcryptjs-cli hash "tu-contraseña"
```

Guardá el hash (no la contraseña) en `ADMIN_PASSWORD_HASH`, y un usuario cualquiera en `ADMIN_USERNAME`.

### 2.3 Google Drive (opcional)

El botón "Importar desde Google Drive" (en el wizard de creación y en cualquier campo de imagen del editor) abre un explorador **del propio panel** (`components/admin/CloudBrowser.tsx`): pestañas "Mi unidad" / "Compartidos conmigo", navegación por carpetas, buscador y selección múltiple, con el mismo diseño que el resto del panel. Habla directo contra la API de Drive con el token del usuario, obtenido con Identity Services **desde el navegador** — no hay ningún token de Google guardado en el servidor ni en el repo.

Hasta el 2026-08-03 esto usaba el Picker de Google, que se dibuja dentro de un iframe: no admite ningún estilo (se veía como una pieza ajena, con una interfaz que Google no actualiza) y exigía dos credenciales extra (`NEXT_PUBLIC_GOOGLE_API_KEY` y `NEXT_PUBLIC_GOOGLE_APP_ID`) que la API de Drive no necesita. **Si venís de una versión anterior, esas dos variables ya no se usan y se pueden borrar.**

El token de acceso se reusa mientras dure (~1 hora) dentro de la misma pestaña, así que importar varias veces seguidas no vuelve a pedir la cuenta; al recargar la página sí. No se persiste ningún refresh token — eso exigiría una base de datos, que este proyecto no tiene.

**Por qué no "viene incluido" al mover el proyecto a otro lado**, dos motivos independientes, hacen falta los dos:

1. **Las variables de entorno no viajan con el código.** `NEXT_PUBLIC_GOOGLE_CLIENT_ID`/`_API_KEY`/`_APP_ID` están en `.env.local` (local) o en la configuración del proyecto de Vercel (producción) — ninguna de las dos cosas está en el repo de Git. Un clon nuevo, o el mismo repo conectado a un proyecto de Vercel distinto, no las tiene hasta que las cargues ahí de nuevo.
2. **El OAuth Client ID está restringido por dominio.** Google exige declarar de antemano, en el Client ID, cuáles son los "Authorized JavaScript origins" desde los que se puede pedir login (ej. `https://tu-sitio.vercel.app`, `http://localhost:3000`). Si el proyecto termina sirviéndose desde un dominio nuevo (otro proyecto de Vercel, un dominio propio), ese dominio tiene que agregarse a la lista en Google Cloud Console — si no, Google rechaza el login con un error de origen no autorizado, aunque el Client ID/API Key sean correctos.

**Setup, si querés habilitarlo en un entorno nuevo:**

1. [Google Cloud Console](https://console.cloud.google.com/) → crear o reusar un proyecto → habilitar **Google Drive API**.
2. **Pantalla de consentimiento de OAuth**: tipo **Externo**, nombre de la app (es el que ve el admin en la ventana de Google), correo de asistencia y de contacto. Dejala en modo **Prueba** y agregá como *usuarios de prueba* cada cuenta que vaya a importar fotos — una cuenta que no esté en esa lista recibe "acceso bloqueado" aunque las credenciales estén bien. Publicarla exigiría pasar por la verificación de Google (el scope `drive.readonly` es sensible) sin ninguna ventaja para un panel de un solo admin.
3. **Credenciales → OAuth 2.0 Client ID** (tipo "Web application"). En **Authorized JavaScript origins**, agregá cada dominio desde el que se va a usar el panel (ej. `http://localhost:3000` para desarrollo, `https://tu-proyecto.vercel.app` y/o tu dominio propio para producción; si tenés dominio propio *y* el de Vercel, van los dos, porque Google compara el origen exacto y no entiende de redirecciones). → `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
4. Reusar un Client ID/proyecto de Google Cloud que ya tenías de otro entorno es válido — solo asegurate de agregar el dominio nuevo a "Authorized JavaScript origins" en el paso 3, si no lo vas a poder usar desde ahí.

> Si la cuenta de Google pertenece a una organización, puede tener activada la política `iam.disableServiceAccountKeyCreation` — no afecta a Drive (que no usa cuentas de servicio), pero sí bloquea el setup del inventario de [2.4](#24-inventario-en-google-sheets-opcional). Ver la nota al final de esa sección.

Si en algún momento se quiere sincronización automática (sin volver a pedir login cada vez), hace falta persistir un refresh token — eso quedó fuera de alcance a propósito (ver decision log en `CLAUDE.md`, "Phase F") porque requeriría una base de datos que este proyecto no tiene.

### 2.4 Inventario en Google Sheets (opcional)

Solo hace falta si vas a usar el **control de inventario** de un catálogo. Sin estas dos variables, todo lo demás del panel y del catálogo funciona igual; el botón de sincronizar queda deshabilitado con un mensaje que dice qué falta.

**Qué es una "cuenta de servicio" y por qué esto no usa tu cuenta de Google.** Una cuenta de servicio es un usuario de Google que le pertenece al programa, no a una persona: tiene su propio correo y su propia clave, y no pide contraseña ni consentimiento cada vez. Es lo que permite que la sincronización funcione sola. La alternativa (entrar con tu cuenta) exige guardar un token de sesión renovable en algún lado, y este proyecto no tiene base de datos — es el mismo motivo por el que la importación desde Drive (2.3) te pide elegir tu cuenta en cada uso.

**Paso a paso** (una sola vez, ~10 minutos):

1. **Proyecto de Google Cloud.** Entrá a [console.cloud.google.com](https://console.cloud.google.com/) y elegí un proyecto existente o creá uno nuevo (arriba a la izquierda, el selector de proyecto → **Proyecto nuevo**). Si ya hiciste el setup de Drive de la sección 2.3, **usá ese mismo proyecto**.

2. **Habilitar las APIs.** Menú ☰ → **APIs y servicios** → **Biblioteca**. Buscá y habilitá estas dos:
   - **Google Sheets API** (obligatoria: es la que lee y escribe las celdas)
   - **Google Drive API** (necesaria solo si querés que el sistema cree la hoja solo; ver el punto 6)

3. **Crear la cuenta de servicio.** Menú ☰ → **IAM y administración** → **Cuentas de servicio** → **Crear cuenta de servicio**.
   - Nombre: cualquiera que reconozcas, por ejemplo `inventario-catalogo`.
   - En "Otorgar acceso a esta cuenta de servicio" (paso 2) y "usuarios con acceso" (paso 3): **dejalos vacíos y dale Listo**. Esos permisos son sobre Google Cloud, no sobre tu hoja — el acceso a la hoja se da en el punto 6.

4. **Descargar la clave.** Clickeá el correo de la cuenta recién creada → pestaña **Claves** → **Agregar clave** → **Crear clave nueva** → tipo **JSON** → **Crear**. Se descarga un archivo `.json`.
   > ⚠️ Es la **única copia**: Google no te la deja volver a descargar. Guardala fuera del repo (nunca la subas a Git).

5. **Sacar las dos variables de ese archivo.** Adentro del JSON hay muchos campos; solo hacen falta dos:
   ```jsonc
   {
     "client_email": "inventario-catalogo@tu-proyecto.iam.gserviceaccount.com",  // → GOOGLE_SERVICE_ACCOUNT_EMAIL
     "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"  // → GOOGLE_PRIVATE_KEY
   }
   ```
   En `.env.local`, la clave va **entre comillas dobles y en una sola línea**, con los `\n` tal cual aparecen en el JSON:
   ```bash
   GOOGLE_SERVICE_ACCOUNT_EMAIL="inventario-catalogo@tu-proyecto.iam.gserviceaccount.com"
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"
   ```
   En Vercel (**Project Settings → Environment Variables**) se pega el valor tal cual, con los saltos de línea reales o con los `\n` — las dos formas funcionan.

6. **Darle acceso a la hoja.** Acá hay dos caminos, y **el recomendado es el primero**:

   - **Recomendado — la hoja es tuya y se la compartís.** Creá una hoja de cálculo vacía en tu Drive, tocá **Compartir**, pegá el correo `client_email` del punto 5 y dale permiso de **Editor**. Después copiá el **ID de la hoja** de su URL y pegalo en el panel:
     ```
     https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890/edit
                                            └──────────── este es el ID ────────────┘
     ```
     Las tres pestañas (PRODUCTOS, KARDEX, CONFIGURACIÓN) las crea el sistema solo dentro de esa hoja.

   - **Automático — el sistema crea la hoja.** Requiere además la **Google Drive API** del punto 2. Tiene una contra real y conocida: una cuenta de servicio **no tiene espacio propio en Drive**, y desde 2025 crear archivos con ella suele fallar con "se excedió la cuota de almacenamiento del usuario". Si te pasa, usá el camino recomendado — no es un problema de configuración tuya.

   La ventaja concreta del camino recomendado, más allá de la cuota: **la hoja es tuya**. Si algún día borrás la cuenta de servicio o cambiás de proveedor, la hoja y todo su historial siguen en tu Drive.

7. **Probarlo.** En el panel, pestaña **Inventario** del catálogo → pegar el ID de la hoja → **Sincronizar**. Si algo falla, el panel dice qué (permisos, hoja inexistente, API sin habilitar), nunca un error técnico crudo.

**Si la cuenta pertenece a una organización de Google Workspace**, el paso 4 (descargar la clave JSON) puede fallar con un error de *política de la organización* (`iam.disableServiceAccountKeyCreation`, activada por defecto por "Seguridad por defecto"). No es un problema de permisos tuyos sobre el proyecto. Se resuelve desactivando esa política **a nivel del proyecto** (☰ → IAM y administración → Políticas de la organización → buscar la restricción → Administrar política → Anular la política del elemento principal → regla con Aplicación **Desactivada**), lo que antes exige autoasignarse el rol `roles/orgpolicy.policyAdmin` **a nivel organización** — ser "Administrador de la organización" no alcanza, porque ese rol no incluye `orgpolicy.policy.set`. Ojo al buscar el rol: "Administrador del recomendador de políticas de la organización" es otro y no sirve; conviene buscarlo por su id. La alternativa sin tocar políticas es crear el proyecto de Cloud en una cuenta personal sin organización — la hoja puede seguir viviendo en el Drive de la empresa, solo hay que compartirla con la cuenta de servicio.

**Seguridad.** `GOOGLE_PRIVATE_KEY` **nunca** lleva el prefijo `NEXT_PUBLIC_`: con ese prefijo Next la incrusta en el JavaScript que descarga cualquier visitante, y sería entregarle a cualquiera la llave de tu hoja. Vive solo del lado del servidor, igual que `GITHUB_TOKEN`.

### 2.5 Dónde vive el stock

El stock **no** se guarda en el repositorio, a diferencia del resto del contenido. El texto de un catálogo cambia cada tanto y publicarlo por commit está bien; el stock cambia todo el tiempo, y un commit + redespliegue por cada movimiento llenaría el historial de ruido y tardaría 1-2 minutos en verse. Va a un **store de Vercel Blob propio**, que escribe al instante y no dispara ningún build.

Es un store **aparte del de las fotos**, y eso no es manía de orden: el acceso (público o privado) se define al crear el store y vale para todo lo que tenga adentro. El de fotos **tiene** que ser público para poder servirlas; guardar ahí el archivo de stock lo dejaría legible para cualquiera que armara la URL, que es predecible. Vercel directamente lo rechaza: *"Cannot use private access on a public store"*.

**Setup en un entorno nuevo:**

```bash
vercel blob create-store <nombre>-inventario --access private --yes
```

Después hay que conectarlo al proyecto **con un prefijo**, porque `BLOB_READ_WRITE_TOKEN` ya está tomado por el store de fotos: en el dashboard de Vercel, **Storage → el store → Connect Project → Environment Variables Prefix: `INVENTARIO`**. Eso crea `INVENTARIO_READ_WRITE_TOKEN`. Para desarrollo local, `vercel env pull` lo trae.

Sin esta variable el catálogo funciona igual: el stock que se ve es el que quedó guardado en el contenido la última vez que se apretó "Guardar y publicar", y la sincronización avisa que falta configurarla.

**Qué se guarda y qué sale afuera.** El archivo (uno por catálogo, ~1 KB) tiene las cantidades exactas por SKU. El catálogo público **nunca** las recibe: consulta `/api/inventory/<id>`, que devuelve solo el estado de cada SKU (`AVAILABLE` / `LOW_STOCK` / `OUT_OF_STOCK`). Es **un pedido por catálogo**, no uno por producto ni por color, y se cachea 30 segundos en el CDN.

## 3. Desplegar en Vercel

1. Importar el repo en Vercel.
2. Cargar las variables de la sección 2 en **Project Settings → Environment Variables** — separado para Production/Preview/Development si hace falta que se comporten distinto (ej. un `GITHUB_BRANCH` de prueba en Preview).
3. El build (`next build && node scripts/generate-pdf.mjs`) genera un PDF por catálogo (`public/catalog-<id>.pdf`) usando Chromium — en Vercel usa automáticamente `@sparticuz/chromium` (detectado vía `process.env.VERCEL`) en vez del Chromium de Playwright, que no puede correr en el contenedor de build de Vercel.
4. Si el paso de PDF falla por cualquier motivo, el build igual termina bien (`exit 0`) — el PDF queda desactualizado hasta el próximo build exitoso, pero nunca bloquea que se publique un cambio de contenido.

No hay "botón de publicar" aparte: cada guardado desde `/admin` comitea directo a `GITHUB_REPO`/`GITHUB_BRANCH`, y eso dispara el redeploy normal de Vercel (~1-2 minutos hasta verse en vivo).
