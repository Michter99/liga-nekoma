/* Utilidades compartidas: lectura del CSV, fechas, consultas y tema.
   Se usan tanto en el selector de temporadas como en la página de resultados. */

// ---- CSV ----

// Minimal CSV parser (handles quoted fields, commas, newlines, escaped quotes)
function parseCSV(text) {
  const rows = [];
  let row = [],
    field = "",
    inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (c === "\r") {
        /* skip */
      } else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function normalizeKey(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "");
}

function toRecords(rows) {
  if (!rows.length) return [];
  const header = rows[0].map(normalizeKey);
  return rows
    .slice(1)
    .filter((r) => r.some((v) => v && v.trim() !== ""))
    .map((r) => {
      const o = {};
      header.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
      return o;
    });
}

function toNum(v) {
  if (v === undefined || v === null || v === "") return NaN;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function escapeHTML(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

async function fetchRecords(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return toRecords(parseCSV(await res.text()));
}

// ---- Fechas ----

// Devuelve las fechas únicas en el orden en que aparecen en el CSV
// (orden cronológico de captura), una por jornada.
function getOrderedFechas(records) {
  const seen = [];
  for (const r of records) {
    const f = r.fecha;
    if (f && !seen.includes(f)) seen.push(f);
  }
  return seen;
}

// Acepta "2026-02-15" y "15/02/2026". Devuelve null si no se puede interpretar.
// Se construye en hora local a propósito: `new Date("2026-02-15")` se parsea
// como UTC y en husos negativos mostraría el día anterior.
function parseFecha(v) {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  return null;
}

const MESES_CORTOS = [
  "ENE",
  "FEB",
  "MAR",
  "ABR",
  "MAY",
  "JUN",
  "JUL",
  "AGO",
  "SEP",
  "OCT",
  "NOV",
  "DIC",
];

// Las fechas de la temporada ordenadas cronológicamente (las que se puedan
// interpretar). Devuelve [] si ninguna tiene un formato reconocible.
function seasonDates(records) {
  return getOrderedFechas(records)
    .map(parseFecha)
    .filter(Boolean)
    .sort((a, b) => a - b);
}

// "15 FEB — 21 JUN 2026" · "2 AGO 2026" · "15 NOV 2026 — 20 MAR 2027"
function seasonPeriodLabel(records) {
  const dates = seasonDates(records);
  if (!dates.length) {
    const fechas = getOrderedFechas(records);
    return fechas.length ? fechas[0] : "";
  }
  const a = dates[0],
    b = dates[dates.length - 1];
  const day = (d) => `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
  if (a.getTime() === b.getTime()) return `${day(a)} ${a.getFullYear()}`;
  if (a.getFullYear() === b.getFullYear())
    return `${day(a)} — ${day(b)} ${b.getFullYear()}`;
  return `${day(a)} ${a.getFullYear()} — ${day(b)} ${b.getFullYear()}`;
}

// "2026" o "2026–2027" según lo que abarque la columna `fecha`.
function seasonYearLabel(records) {
  const dates = seasonDates(records);
  if (!dates.length) return "";
  const a = dates[0].getFullYear(),
    b = dates[dates.length - 1].getFullYear();
  return a === b ? String(a) : `${a}–${b}`;
}

// Nombre de la temporada derivado de la columna `fecha`: "Temporada 2026".
// `season.name` en la configuración lo sobrescribe.
function seasonDisplayName(season, records) {
  if (season.name) return season.name;
  const years = seasonYearLabel(records);
  return years ? `Temporada ${years}` : `Temporada ${season.num}`;
}

// ---- Consultas ----

// Agrupa los registros (uno por enfrentamiento individual) en partidos
// completos equipo vs equipo, contando cuántos de los puntos
// individuales ganó cada lado.
function aggregateMatches(records) {
  const map = new Map();
  for (const r of records) {
    const key = [r.fecha, r.equipo_a, r.equipo_b, r.num_partido].join("||");
    if (!map.has(key)) {
      map.set(key, {
        fecha: r.fecha,
        equipo_a: r.equipo_a,
        equipo_b: r.equipo_b,
        num_partido: r.num_partido,
        ganados_a: 0,
        ganados_b: 0,
      });
    }
    const row = map.get(key);
    const sa = toNum(r.sets_a),
      sb = toNum(r.sets_b);
    if (Number.isFinite(sa) && Number.isFinite(sb)) {
      if (sa > sb) row.ganados_a += 1;
      else if (sa < sb) row.ganados_b += 1;
    }
  }
  return [...map.values()];
}

function teamPointsFromMatches(matches) {
  const pts = new Map();
  for (const m of matches) {
    if (!m.equipo_a || !m.equipo_b) continue;
    pts.set(m.equipo_a, (pts.get(m.equipo_a) ?? 0) + m.ganados_a);
    pts.set(m.equipo_b, (pts.get(m.equipo_b) ?? 0) + m.ganados_b);
  }
  return pts;
}

// Puntos individuales ganados por cada equipo en sus enfrentamientos
// cara a cara contra cada rival, usado para desempatar.
function buildHeadToHead(matches) {
  const h2h = new Map();
  const add = (teamX, teamY, ptsX) => {
    if (!teamX || !teamY) return;
    const key = teamX + "||" + teamY;
    h2h.set(key, (h2h.get(key) ?? 0) + ptsX);
  };
  for (const m of matches) {
    add(m.equipo_a, m.equipo_b, m.ganados_a);
    add(m.equipo_b, m.equipo_a, m.ganados_b);
  }
  return h2h;
}

// -1 si A debe ir antes que B por el resultado directo, 1 si después,
// 0 si no hay enfrentamiento directo registrado entre ambos.
function h2hCompare(teamA, teamB, h2h) {
  const aVsB = h2h.get(teamA + "||" + teamB);
  const bVsA = h2h.get(teamB + "||" + teamA);
  if (aVsB === undefined || bVsA === undefined) return 0;
  if (aVsB === bVsA) return 0;
  return aVsB > bVsA ? -1 : 1;
}

function sortByPuntosConDesempate(teams, puntos, h2h) {
  return teams.slice().sort((a, b) => {
    const pa = puntos.get(a) ?? 0;
    const pb = puntos.get(b) ?? 0;
    if (pb !== pa) return pb - pa;
    const h = h2hCompare(a, b, h2h);
    if (h !== 0) return h;
    return a.localeCompare(b);
  });
}

// Calcula la tabla de posiciones respetando el reglamento de Nekoma:
//  - Fase regular: las primeras `fechasFaseRegular` jornadas (todos contra
//    todos).
//  - Al cerrar la fase regular se fijan dos grupos: Superior (los
//    `tamanoGrupo` primeros lugares) e Inferior (el resto). Esa división es
//    permanente — ningún equipo del grupo inferior puede superar a uno
//    del grupo superior en la jornada de Final Four, sin importar
//    cuántos puntos gane ahí.
//  - Los empates en puntos se resuelven por el resultado del partido
//    directo entre los equipos empatados.
function computeStandings(records, opts) {
  const fechasFaseRegular = opts?.fechasFaseRegular ?? 3;
  const tamanoGrupo = opts?.tamanoGrupo ?? 4;

  const allMatches = aggregateMatches(records);
  const allTeams = new Set();
  allMatches.forEach((m) => {
    if (m.equipo_a) allTeams.add(m.equipo_a);
    if (m.equipo_b) allTeams.add(m.equipo_b);
  });

  const fechas = getOrderedFechas(records);
  const fechasRegular = fechas.slice(0, fechasFaseRegular);
  const fechasFinal = fechas.slice(fechasFaseRegular);
  const regularComplete = fechasRegular.length >= fechasFaseRegular;

  if (!regularComplete) {
    // Fase regular en curso: tabla general simple, grupos aún no existen.
    const puntos = teamPointsFromMatches(allMatches);
    const h2h = buildHeadToHead(allMatches);
    const orden = sortByPuntosConDesempate([...allTeams], puntos, h2h);
    return orden.map((equipo) => ({
      equipo,
      puntos: puntos.get(equipo) ?? 0,
      grupo: null,
    }));
  }

  const matchesRegular = allMatches.filter((m) =>
    fechasRegular.includes(m.fecha),
  );
  const matchesFinal = allMatches.filter((m) => fechasFinal.includes(m.fecha));

  const puntosRegular = teamPointsFromMatches(matchesRegular);
  const h2hRegular = buildHeadToHead(matchesRegular);

  // Grupos fijos según la posición al cierre de la fase regular.
  const ordenRegular = sortByPuntosConDesempate(
    [...allTeams],
    puntosRegular,
    h2hRegular,
  );
  const grupoSuperior = ordenRegular.slice(0, tamanoGrupo);
  const grupoInferior = ordenRegular.slice(tamanoGrupo);

  // Puntos totales = fase regular + Final Four (si ya se jugó).
  const puntosFinal = teamPointsFromMatches(matchesFinal);
  const puntosTotales = new Map();
  allTeams.forEach((equipo) => {
    puntosTotales.set(
      equipo,
      (puntosRegular.get(equipo) ?? 0) + (puntosFinal.get(equipo) ?? 0),
    );
  });

  // El desempate dentro de cada grupo usa el resultado directo
  // considerando todos los enfrentamientos de la temporada.
  const h2hTotal = buildHeadToHead(allMatches);

  const ordenSuperior = sortByPuntosConDesempate(
    grupoSuperior,
    puntosTotales,
    h2hTotal,
  );
  const ordenInferior = sortByPuntosConDesempate(
    grupoInferior,
    puntosTotales,
    h2hTotal,
  );

  return [
    ...ordenSuperior.map((equipo) => ({
      equipo,
      puntos: puntosTotales.get(equipo) ?? 0,
      grupo: "superior",
    })),
    ...ordenInferior.map((equipo) => ({
      equipo,
      puntos: puntosTotales.get(equipo) ?? 0,
      grupo: "inferior",
    })),
  ];
}

function queryPartidos(records) {
  return aggregateMatches(records).sort(
    (a, b) => toNum(a.num_partido) - toNum(b.num_partido),
  );
}

function queryJugadores(records) {
  const partidos = [];
  for (const r of records) {
    const sa = toNum(r.sets_a),
      sb = toNum(r.sets_b);
    if (!Number.isFinite(sa) || !Number.isFinite(sb)) continue;
    partidos.push({
      equipo: r.equipo_a,
      jugador: r.jugador_a,
      ganado: sa > sb ? 1 : 0,
    });
    partidos.push({
      equipo: r.equipo_b,
      jugador: r.jugador_b,
      ganado: sb > sa ? 1 : 0,
    });
  }
  const totEquipo = new Map();
  for (const p of partidos) {
    totEquipo.set(p.equipo, (totEquipo.get(p.equipo) ?? 0) + p.ganado);
  }
  const agg = new Map();
  for (const p of partidos) {
    const k = p.equipo + "||" + p.jugador;
    if (!agg.has(k))
      agg.set(k, {
        equipo: p.equipo,
        jugador: p.jugador,
        jugados: 0,
        ganados: 0,
      });
    const row = agg.get(k);
    row.jugados += 1;
    row.ganados += p.ganado;
  }
  const out = [...agg.values()].map((r) => {
    const totE = totEquipo.get(r.equipo) || 0;
    return {
      ...r,
      efectividad:
        r.jugados > 0 ? Math.round((r.ganados * 1000) / r.jugados) / 10 : 0,
      aportacion: totE > 0 ? Math.round((r.ganados * 1000) / totE) / 10 : 0,
    };
  });
  out.sort((a, b) => {
    if (a.equipo !== b.equipo) return a.equipo.localeCompare(b.equipo);
    if (b.aportacion !== a.aportacion) return b.aportacion - a.aportacion;
    return b.efectividad - a.efectividad;
  });
  return out;
}

// Resumen de una temporada para el selector.
function seasonSummary(season, records) {
  const equipos = new Set();
  const partidos = aggregateMatches(records);
  partidos.forEach((m) => {
    if (m.equipo_a) equipos.add(m.equipo_a);
    if (m.equipo_b) equipos.add(m.equipo_b);
  });
  const jornadas = getOrderedFechas(records).length;
  return {
    name: seasonDisplayName(season, records),
    periodo: seasonPeriodLabel(records),
    anios: seasonYearLabel(records),
    equipos: equipos.size,
    jornadas,
    partidos: partidos.length,
    // La temporada termina con la jornada de Final Four, justo después de
    // las jornadas de fase regular.
    finalizada: jornadas >= season.fechasFaseRegular + 1,
  };
}

// ---- Tema ----

function initTheme() {
  const saved = localStorage.getItem("theme");
  const prefers = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (saved === "dark" || (!saved && prefers))
    document.body.classList.add("dark");
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    localStorage.setItem(
      "theme",
      document.body.classList.contains("dark") ? "dark" : "light",
    );
  });
}
