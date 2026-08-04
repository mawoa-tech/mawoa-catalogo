"use client";

import type { Block } from "@/data/schema";
import { COLLAGE_LAYOUT_IMAGE_COUNT, deriveCollageLayout, hasVariantDimensions } from "@/data/schema";
import TextField from "./fields/TextField";
import TextAreaField from "./fields/TextAreaField";
import StringListEditor from "./fields/StringListEditor";
import CollageImagesEditor from "./fields/CollageImagesEditor";
import SwatchesEditor from "./fields/SwatchesEditor";
import VariantsEditor from "./fields/VariantsEditor";
import CheckboxField from "./fields/CheckboxField";
import ImagePicker from "./ImagePicker";

type BlockFormProps = {
  block: Block;
  onChange: (block: Block) => void;
};

/**
 * Un formulario por tipo de bloque, con los campos que ese tipo
 * necesita (mismo espíritu que BlockRenderer, pero para editar en vez
 * de dibujar). pageNumber no se edita acá: se recalcula a partir de la
 * posición del bloque al guardar (ver app/admin/actions.ts).
 */
export default function BlockForm({ block, onChange }: BlockFormProps) {
  switch (block.type) {
    case "cover": {
      const { data } = block;
      const set = (patch: Partial<typeof data>) => onChange({ ...block, data: { ...data, ...patch } });
      return (
        <>
          <TextField label="Título" value={data.title} onChange={(v) => set({ title: v })} />
          <StringListEditor
            label="Meta (vol, año, etc.)"
            items={data.meta}
            onChange={(v) => set({ meta: v })}
            placeholder="ej. VOL.01"
          />
          <TextField label="Subtítulo" value={data.subtitle} onChange={(v) => set({ subtitle: v })} />
          <TextField label="Línea inferior 1" value={data.bottomLine1} onChange={(v) => set({ bottomLine1: v })} />
          <TextField label="Línea inferior 2" value={data.bottomLine2} onChange={(v) => set({ bottomLine2: v })} />
          <ImagePicker label="Imagen de fondo" value={data.bgImage} onChange={(v) => set({ bgImage: v })} />
        </>
      );
    }

    case "manifesto": {
      const { data } = block;
      const set = (patch: Partial<typeof data>) => onChange({ ...block, data: { ...data, ...patch } });
      return (
        <>
          <TextField label="Título" value={data.heading} onChange={(v) => set({ heading: v })} />
          <TextAreaField label="Párrafo" value={data.paragraph} onChange={(v) => set({ paragraph: v })} />
          <ImagePicker label="Imagen de fondo" value={data.bgImage} onChange={(v) => set({ bgImage: v })} />
        </>
      );
    }

    case "productHero": {
      const { data } = block;
      const set = (patch: Partial<typeof data>) => onChange({ ...block, data: { ...data, ...patch } });
      return (
        <>
          <TextField label="Nombre" value={data.name} onChange={(v) => set({ name: v })} />
          <TextField label="Tipo" value={data.type} onChange={(v) => set({ type: v })} />
          <ImagePicker label="Imagen de fondo" value={data.bgImage} onChange={(v) => set({ bgImage: v })} />
        </>
      );
    }

    case "chapterHero": {
      const { data } = block;
      const set = (patch: Partial<typeof data>) => onChange({ ...block, data: { ...data, ...patch } });
      return (
        <>
          <TextField label="Nombre del producto" value={data.name} onChange={(v) => set({ name: v })} />
          {/* Este es EL nombre del colorway: se ve en el catálogo y, al
              cambiarlo, BlockList reescribe con él el identificador
              interno de las dos páginas del par (ver allá). Por eso ya
              no hay un campo de identificador que mirar ni mantener. */}
          <TextField label="Nombre del colorway" value={data.label} onChange={(v) => set({ label: v })} />
          <ImagePicker label="Imagen de fondo" value={data.bgImage} onChange={(v) => set({ bgImage: v })} />
        </>
      );
    }

    case "productDetail": {
      const { data } = block;
      const set = (patch: Partial<typeof data>) => onChange({ ...block, data: { ...data, ...patch } });
      return (
        <>
          <div className="admin-field-group">
            <h4>Contenido</h4>
            <TextField label="Nombre" value={data.name} onChange={(v) => set({ name: v })} />
            <TextField label="Tipo" value={data.type} onChange={(v) => set({ type: v })} />
            <TextField label="Precio" value={data.price} onChange={(v) => set({ price: v })} />
            <StringListEditor
              label="Descripción"
              items={data.description}
              onChange={(v) => set({ description: v })}
            />
            <CheckboxField
              label="Modelo agotado (sold out)"
              checked={data.soldOut === true}
              onChange={(v) => set({ soldOut: v || undefined })}
              hint="Muestra un cartel SOLD OUT en la esquina de esta página. Para marcar solo un color, usá la casilla de cada swatch en “Colores”."
            />
          </div>
          <div className="admin-field-group">
            <h4>Fotos</h4>
            <CollageImagesEditor
              images={data.collageImages}
              onChange={(v) => set({ collageImages: v, collageLayout: deriveCollageLayout(v.length) })}
            />
            <p className="admin-field-hint">
              Se muestran en una grilla de {COLLAGE_LAYOUT_IMAGE_COUNT[data.collageLayout]} fotos
              (según la cantidad cargada arriba).
            </p>
          </div>
          <div className="admin-field-group">
            <h4>Colores</h4>
            <SwatchesEditor
              swatches={data.swatches}
              onChange={(v) => set({ swatches: v })}
              pageId={data.id}
              pageSoldOut={data.soldOut === true}
              dimensioned={hasVariantDimensions(data)}
            />
          </div>
          <div className="admin-field-group">
            <h4>Tallas y cortes</h4>
            <VariantsEditor data={data} onChange={set} />
          </div>
        </>
      );
    }

    case "closing": {
      const { data } = block;
      const set = (patch: Partial<typeof data>) => onChange({ ...block, data: { ...data, ...patch } });
      return (
        <>
          <TextField label="Título" value={data.title} onChange={(v) => set({ title: v })} />
          <TextField label="Línea 1" value={data.line1} onChange={(v) => set({ line1: v })} />
          <TextField label="Línea 2" value={data.line2} onChange={(v) => set({ line2: v })} />
          <ImagePicker label="Imagen de fondo" value={data.bgImage} onChange={(v) => set({ bgImage: v })} />
        </>
      );
    }

    default: {
      const exhaustiveCheck: never = block;
      return exhaustiveCheck;
    }
  }
}
