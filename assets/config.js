/* =========================================================================
 * CONFIGURACIÓN DE TEMPORADAS
 *
 * PARA AÑADIR UNA TEMPORADA NUEVA (p. ej. S3):
 *   1. Crea la pestaña "S3_Partidos" en el mismo Google Sheet, con las mismas
 *      columnas: fecha, num_partido, equipo_a, equipo_b, jugador_a, jugador_b,
 *      sets_a, sets_b.
 *   2. Publícala en la web (Archivo › Compartir › Publicar en la web).
 *   3. Añade UNA línea a SEASONS, aquí abajo:
 *
 *        { sheet: "S3_Partidos", title: "Sexta División" },
 *
 *   Y ya está. El id de la URL ("s3"), la etiqueta ("T3"), el gid de la
 *   pestaña, el nombre de la temporada, las fechas y las estadísticas se
 *   calculan solos a partir de la hoja.
 *
 * CAMPOS OPCIONALES por temporada:
 *   gid                -> gid de la pestaña. Si lo pones, la página carga sin
 *                         la petición extra que resuelve el gid por el nombre.
 *                         Lo encuentras en la URL de la pestaña en Sheets
 *                         (…#gid=1476911987).
 *   id                 -> id usado en la URL (?temporada=…). Por defecto se
 *                         deriva del nombre de la pestaña: "S3_Partidos" -> "s3".
 *   label              -> etiqueta corta. Por defecto "T3".
 *   name               -> nombre de la temporada. Por defecto se calcula con
 *                         la columna `fecha` (p. ej. "Temporada 2026").
 *   fechasFaseRegular  -> nº de jornadas de la fase regular. Por defecto 3.
 *   tamanoGrupo        -> equipos del Grupo Superior en el Final Four. Por
 *                         defecto 4.
 * ========================================================================= */

const SHEET_PUB_ID =
  "2PACX-1vTCQ8MCOsw6aLINOHvTa8a_DijQZBmcxxdCBqIOJb2SzTPg_XSDzGFyfQEao1bFuOkaQ41NZnLTLpJ3";

const SEASONS = [
  { sheet: "S1_Partidos", title: "Sexta División", gid: "13146208" },
  { sheet: "S2_Partidos", title: "Sexta División", gid: "1476911987" },
];

/* ---------------- A partir de aquí no hace falta tocar nada -------------- */

const SHEET_BASE = `https://docs.google.com/spreadsheets/d/e/${SHEET_PUB_ID}`;

const SEASON_DEFAULTS = {
  fechasFaseRegular: 3,
  tamanoGrupo: 4,
};

// "S3_Partidos" -> 3 · "Temporada 12" -> 12 · sin número -> índice + 1
function seasonNumberFrom(sheet, index) {
  const m = String(sheet || "").match(/(\d+)/);
  return m ? Number(m[1]) : index + 1;
}

function normalizeSeason(cfg, index) {
  const num = seasonNumberFrom(cfg.sheet, index);
  return {
    ...SEASON_DEFAULTS,
    ...cfg,
    num,
    id: cfg.id || "s" + num,
    label: cfg.label || "T" + num,
  };
}

function getSeasons() {
  return SEASONS.map(normalizeSeason);
}

function getSeasonById(id) {
  if (!id) return null;
  const wanted = String(id).toLowerCase();
  return getSeasons().find((s) => s.id.toLowerCase() === wanted) || null;
}

function seasonUrl(season) {
  return `temporada.html?temporada=${encodeURIComponent(season.id)}`;
}

// Mapa nombre-de-pestaña -> gid, leído de la portada publicada del documento.
// Se pide una sola vez por carga de página y solo si alguna temporada no
// declara su `gid` a mano.
let gidMapPromise = null;

function loadGidMap() {
  if (!gidMapPromise) {
    gidMapPromise = fetch(`${SHEET_BASE}/pubhtml`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then((html) => {
        const map = new Map();
        const re = /\{name:\s*"([^"]+)"[\s\S]{0,600}?gid:\s*"(\d+)"/g;
        let m;
        while ((m = re.exec(html))) map.set(m[1], m[2]);
        return map;
      })
      .catch((err) => {
        gidMapPromise = null; // permite reintentar
        throw err;
      });
  }
  return gidMapPromise;
}

async function resolveGid(season) {
  if (season.gid) return String(season.gid);
  const map = await loadGidMap();
  const gid = map.get(season.sheet);
  if (!gid) {
    throw new Error(
      `No se encontró la pestaña "${season.sheet}" entre las publicadas. ` +
        `Publícala en Sheets o añade su gid a mano en assets/config.js.`,
    );
  }
  return gid;
}

async function seasonCsvUrl(season) {
  const gid = await resolveGid(season);
  return `${SHEET_BASE}/pub?gid=${gid}&single=true&output=csv`;
}
