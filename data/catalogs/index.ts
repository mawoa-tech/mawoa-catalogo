// Registro de catálogos disponibles. Renderizar un catálogo es pedirlo
// acá por id, nunca importar el contenido de una colección específica
// directamente en app/ o components/.
//
// Regenerado por lib/catalogStore.ts (createCatalog) cada vez que se
// agrega un catálogo desde el panel — no editar a mano el orden de
// imports, se reescribe completo a partir de la lista de ids.

import { catalogEntry as entry0 } from "./julia-botones";
import type { CatalogEntry } from "../schema";

// Tipado explícito (no `satisfies`) a propósito: con un registro
// vacío (`ids` = []), `satisfies Record<string, CatalogEntry>` deja
// que TS infiera el tipo del objeto literal `{}` en vez de ensancharlo
// — `keyof {}` es `never`, y `CatalogId = keyof typeof catalogs`
// colapsaba a `never`, rompiendo la compilación en cualquier archivo
// que indexara `catalogs[id]` (encontrado de verdad al probar borrar
// el último catálogo de un registro). Con la anotación explícita el
// tipo es siempre `Record<string, CatalogEntry>`, vacío o no.
export const catalogs: Record<string, CatalogEntry> = {
  "julia-botones": entry0,
};

export type CatalogId = keyof typeof catalogs;
