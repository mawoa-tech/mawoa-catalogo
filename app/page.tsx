import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import CatalogWall from "@/components/index/CatalogWall";
import { catalogs } from "@/data/catalogs";
import { getBackdropColumns } from "@/lib/indexBackdrop";
import type { Block, CatalogBlocks } from "@/data/schema";

/**
 * Título de la portada del índice. Es una variable de entorno y no un
 * texto fijo porque este mismo código se despliega en más de un sitio
 * (cada uno con su propia marca): el que la define muestra su nombre,
 * el que no, "Catálogos" a secas. Así los repos no arrastran una línea
 * distinta para siempre, que sería un conflicto en cada sincronización.
 *
 * Server component + página estática: el valor se resuelve en build
 * time, así que no hace falta NEXT_PUBLIC_ (no viaja al navegador como
 * variable, solo el texto ya renderizado).
 */
const SITE_TITLE = process.env.SITE_TITLE?.trim() || "Catálogos";

// `absolute` y no el título a secas: el template del layout es
// "Catálogo Digital — %s", que acá daría "Catálogo Digital — Catálogos
// Mawoa".
export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
};

function getCoverBlock(blocks: CatalogBlocks) {
  return blocks.find((b): b is Extract<Block, { type: "cover" }> => b.type === "cover");
}

/**
 * Índice de catálogos disponibles: una tarjeta por catálogo del
 * registro (data/catalogs/index.ts), usando su propio bloque "cover"
 * para el título/imagen — no hay un segundo lugar donde mantener esos
 * datos al día. Cada tarjeta linkea a /catalog/[id], que sí es la URL
 * pensada para compartir un catálogo puntual.
 */
export default function HomePage() {
  const entries = Object.entries(catalogs);

  return (
    <main className="catalog-index">
      <CatalogWall columns={getBackdropColumns(catalogs)} />
      <Link href="/admin" className="catalog-index-admin-link">
        Admin
      </Link>
      <div className="catalog-index-header">
        <h1>{SITE_TITLE}</h1>
        <span className="catalog-index-header-rule" />
      </div>
      {/* Sin catálogos publicados la página quedaba completamente en
          blanco: solo el título y una franja de fondo. Pasa de verdad —
          es el estado de un sitio recién puesto en línea, antes del
          primer catálogo — y esta URL es pública. */}
      {entries.length === 0 && (
        <p className="catalog-index-empty">
          Todavía no hay catálogos publicados.
        </p>
      )}
      <div className="catalog-index-grid">
        {entries.map(([id, entry]) => {
          const cover = getCoverBlock(entry.blocks);
          if (!cover) return null;
          return (
            <Link key={id} href={`/catalog/${id}`} className="catalog-index-card">
              <Image
                src={cover.data.bgImage}
                alt=""
                fill
                sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw"
                style={{ objectFit: "cover" }}
              />
              <div className="catalog-index-card-overlay">
                <h2>{cover.data.title}</h2>
                <span>{cover.data.subtitle}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
