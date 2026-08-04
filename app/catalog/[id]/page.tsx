import { notFound } from "next/navigation";
import type { Metadata } from "next";
import CatalogRenderer from "@/components/catalog/CatalogRenderer";
import { catalogs, type CatalogId } from "@/data/catalogs";

type CatalogPageProps = {
  params: Promise<{ id: string }>;
};

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * El nombre de cada catálogo en la pestaña viene de `productHero.name`
 * (el nombre de la colección, ej. "ARIEL") en vez de `cover.title` —
 * ese último es el título editorial libre de la portada (para Ariel,
 * es "ANGEL DE CANELA", justo el nombre de marca que se quería sacar
 * de la pestaña), mientras que `productHero.name` es consistente
 * entre catálogos.
 */
export async function generateMetadata({ params }: CatalogPageProps): Promise<Metadata> {
  const { id } = await params;

  if (!(id in catalogs)) {
    return {};
  }

  const entry = catalogs[id as CatalogId];
  const hero = entry.blocks.find((b) => b.type === "productHero");
  const name = hero ? toTitleCase(hero.data.name) : toTitleCase(id);

  // La portada del catálogo (bgImage del bloque "cover") es la imagen
  // que arma la vista previa al compartir el link — ej. en WhatsApp —
  // en vez de no mostrar ninguna. `subtitle` de la portada como
  // descripción si existe (para Ariel es "Essence of the sea — Ariel
  // Collection"); si no, cae al texto genérico del layout raíz.
  const cover = entry.blocks.find((b) => b.type === "cover");
  const description = cover?.data.subtitle || undefined;

  return {
    title: name,
    description,
    openGraph: {
      title: name,
      description,
      images: cover ? [{ url: cover.data.bgImage }] : undefined,
    },
    twitter: {
      title: name,
      description,
      images: cover ? [cover.data.bgImage] : undefined,
    },
  };
}

/**
 * Un catálogo específico, con link directo compartible (ej.
 * /catalog/ariel) — separado del índice en `/` para que mandar el link
 * de un catálogo puntual no dependa de que exista uno solo.
 */
export default async function CatalogPage({ params }: CatalogPageProps) {
  const { id } = await params;

  if (!(id in catalogs)) {
    notFound();
  }

  const entry = catalogs[id as CatalogId];

  return (
    <CatalogRenderer
      blocks={entry.blocks}
      theme={entry.theme}
      layoutId={entry.layoutId}
      pdfHref={`/catalog-${id}.pdf`}
      inventory={entry.inventory}
      catalogId={id}
    />
  );
}

export function generateStaticParams() {
  return Object.keys(catalogs).map((id) => ({ id }));
}
