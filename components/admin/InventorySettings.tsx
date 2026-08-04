"use client";

import type { CatalogInventory } from "@/data/schema";
import CheckboxField from "./fields/CheckboxField";

type InventorySettingsProps = {
  inventory: CatalogInventory | undefined;
  onChange: (inventory: CatalogInventory | undefined) => void;
};

/**
 * El teléfono se guarda solo con dígitos (así lo exige el schema, y así
 * lo necesita el enlace de WhatsApp), pero nadie escribe un teléfono
 * así: se escribe "+51 987 654 321". En vez de rechazar lo que la gente
 * escribe naturalmente y hacerla adivinar el formato, se limpia acá
 * mientras tipea — que es la diferencia entre un campo que funciona y
 * uno que falla recién al guardar, con un mensaje de validación.
 */
function onlyDigits(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

/** Muestra 51987654321 como "+51 987 654 321" — solo para leerlo, no es lo que se guarda. */
function prettyPhone(digits: string): string {
  if (!digits) return "";
  const groups = digits.slice(2).replace(/(\d{3})(?=\d)/g, "$1 ");
  return `+${digits.slice(0, 2)} ${groups}`.trim();
}

/**
 * Configuración de inventario del catálogo (Fase 2): el interruptor y
 * el teléfono de WhatsApp.
 *
 * Apagado es el estado por defecto y significa exactamente "el catálogo
 * funciona como siempre": no se muestra stock, no se consulta nada, no
 * hay ninguna dependencia de Google. Apagarlo NO borra lo que ya
 * estaba configurado (teléfono, hoja asociada) — volver a encenderlo
 * tiene que devolver las cosas donde estaban, no obligar a recargar
 * todo.
 */
export default function InventorySettings({ inventory, onChange }: InventorySettingsProps) {
  const enabled = inventory?.enabled === true;
  const phone = inventory?.whatsappPhone ?? "";

  const setEnabled = (value: boolean) => {
    const next: CatalogInventory = { ...inventory, enabled: value };
    // Un catálogo que nunca usó inventario y lo prendió y apagó no
    // debería quedar con un bloque de configuración vacío guardado: se
    // vuelve a "no tiene inventario", que es como estaba.
    if (!value && !next.spreadsheetId && !next.whatsappPhone) {
      onChange(undefined);
      return;
    }
    onChange(next);
  };

  /**
   * Se acepta pegar la URL entera de la hoja, no solo el id: es lo que
   * cualquiera copia de la barra del navegador, y pedirle a alguien que
   * recorte el tramo del medio a mano es una forma segura de que pegue
   * mal la mitad de las veces.
   */
  const setSpreadsheetId = (value: string) => {
    const fromUrl = value.match(/\/d\/([a-zA-Z0-9_-]+)/);
    const id = (fromUrl ? fromUrl[1] : value).trim();
    onChange({ ...inventory, enabled, spreadsheetId: id || undefined });
  };

  const setPhone = (value: string) => {
    const digits = onlyDigits(value);
    onChange({ ...inventory, enabled, whatsappPhone: digits || undefined });
  };

  return (
    <div className="admin-inventory-settings">
      <CheckboxField
        label="Control de inventario"
        checked={enabled}
        onChange={setEnabled}
        hint={
          enabled
            ? "Encendido: vas a poder cargar precio y stock por color, y el catálogo va a mostrar la disponibilidad."
            : "Apagado: el catálogo funciona como siempre. No se muestra stock ni se consulta nada."
        }
      />

      {enabled && (
        <div className="admin-field-group">
          <h4>Compras por WhatsApp</h4>

          <div className="admin-field">
            <label htmlFor="inv-whatsapp">Número de WhatsApp</label>
            <input
              id="inv-whatsapp"
              type="tel"
              inputMode="numeric"
              placeholder="ej. 51987654321"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <p className="admin-field-hint">
              Con el código de país y sin espacios ni signos. Para Perú, empieza con 51.
              {phone && <> Se guarda como <strong>{prettyPhone(phone)}</strong>.</>}
            </p>
          </div>

          {!phone && (
            <p className="admin-field-hint admin-field-hint-warn">
              Sin número, el botón &ldquo;Comprar por WhatsApp&rdquo; no aparece en el catálogo.
              Todo lo demás del inventario funciona igual.
            </p>
          )}
        </div>
      )}

      {enabled && (
        <div className="admin-field-group">
          <h4>Hoja de Google</h4>
          <div className="admin-field">
            <label htmlFor="inv-sheet">Identificador de la hoja</label>
            <input
              id="inv-sheet"
              type="text"
              placeholder="ej. 1AbCdEfGh…"
              value={inventory?.spreadsheetId ?? ""}
              onChange={(e) => setSpreadsheetId(e.target.value)}
            />
            <p className="admin-field-hint">
              Es el tramo largo de la dirección de la hoja, entre <code>/d/</code> y <code>/edit</code>. La hoja
              tiene que estar compartida como <strong>Editor</strong> con la cuenta de servicio. Las tres
              pestañas (PRODUCTOS, KARDEX, CONFIGURACION) las crea el sistema solo.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
