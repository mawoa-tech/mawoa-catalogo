import Image from "next/image";

/**
 * Fondo dinámico del índice ("/"): columnas de fotos de los catálogos
 * desplazándose muy despacio en vertical, alternando el sentido, con
 * un velo oscuro encima para que el título y las tarjetas se lean.
 *
 * Todo el movimiento es CSS (`animation` infinita sobre `transform`),
 * no JavaScript: el mural es decoración, así que no tiene por qué
 * costar un componente cliente ni bloquear nada. Por lo mismo está
 * `aria-hidden` — no aporta información, solo ruido para un lector de
 * pantalla — y se queda quieto si el visitante pidió menos movimiento
 * (`prefers-reduced-motion`, ver globals.css).
 *
 * Cada columna se renderiza dos veces seguidas y la animación la
 * desplaza exactamente un 50%: al terminar, la segunda copia está justo
 * donde arrancó la primera, así que el loop no tiene corte visible. Las
 * URLs repetidas no son un pedido más al servidor (misma imagen, misma
 * caché).
 */

/** Duraciones distintas por columna: con una sola, el mural entero se movería como un bloque. */
const DURATIONS = ["64s", "82s", "54s", "92s", "72s"];

export default function CatalogWall({ columns }: { columns: string[][] }) {
  if (columns.length === 0) return null;

  return (
    <div className="catalog-wall" aria-hidden="true">
      {columns.map((images, column) => (
        <div className="catalog-wall-col" key={column}>
          <div
            className={`catalog-wall-track${column % 2 === 1 ? " catalog-wall-track--down" : ""}`}
            style={{ animationDuration: DURATIONS[column % DURATIONS.length] }}
          >
            {[...images, ...images].map((src, tile) => (
              <div className="catalog-wall-tile" key={`${column}-${tile}`}>
                <Image
                  src={src}
                  alt=""
                  fill
                  // Fijo y chico a propósito: la foto va desenfocada y
                  // oscurecida, así que pedir la versión grande sería
                  // pagar ancho de banda por un detalle que nadie ve.
                  sizes="200px"
                  style={{ objectFit: "cover" }}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
