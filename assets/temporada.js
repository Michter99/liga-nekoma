/* Página de resultados de una temporada. La temporada se elige con
   ?temporada=<id> (ver assets/config.js); todo lo demás es idéntico entre
   temporadas. */

const SEASON_PARAM = new URLSearchParams(location.search).get("temporada");
const SEASON = getSeasonById(SEASON_PARAM);

// Textos que dependen de la temporada; se completan al cargar los datos.
const seasonMeta = { name: "", periodo: "" };

// ---- Renderers ----

const state = {
  tabla: { rows: [], sort: { key: "puntos", dir: "desc" } },
  partidos: { rows: [], sort: { key: "num_partido", dir: "asc" } },
  jugadores: {
    rows: [],
    sort: { key: "ganados", dir: "desc" },
    filterEquipo: "",
  },
};

function compareBy(a, b, key, dir, type) {
  const mul = dir === "desc" ? -1 : 1;
  const av = a[key],
    bv = b[key];
  if (type === "num") {
    const an = toNum(av),
      bn = toNum(bv);
    const ae = Number.isFinite(an),
      be = Number.isFinite(bn);
    if (!ae && !be) return 0;
    if (!ae) return 1;
    if (!be) return -1;
    return (an - bn) * mul;
  }
  return String(av ?? "").localeCompare(String(bv ?? "")) * mul;
}

function sortRows(rows, key, dir, type, tiebreakers) {
  if (!key) return rows.slice();
  return rows.slice().sort((a, b) => {
    const primary = compareBy(a, b, key, dir, type);
    if (primary !== 0) return primary;
    if (tiebreakers) {
      for (const tb of tiebreakers) {
        const r = compareBy(a, b, tb.key, tb.dir, tb.type);
        if (r !== 0) return r;
      }
    }
    return 0;
  });
}

function sortIndicator(col, sort) {
  const cls = ["sortable"];
  if (col.numeric) cls.push("num");
  if (col.extra) cls.push(col.extra);
  if (sort.key === col.key) {
    cls.push("active");
    cls.push("sort-" + sort.dir);
  }
  return `class="${cls.join(" ")}" data-key="${col.key}" data-type="${col.numeric ? "num" : "str"}"${col.width ? ` style="width:${col.width}"` : ""}`;
}

function renderTabla() {
  const el = document.getElementById("tabla-content");
  if (!el) return;
  const { rows, sort } = state.tabla;
  if (!rows.length) {
    el.className = "state";
    el.textContent = "Sin datos";
    return;
  }
  const sortType = sort.key === "puntos" ? "num" : "str";
  const max = Math.max(...rows.map((r) => r.puntos)) || 1;
  const cols = [
    { key: "equipo", label: "Equipo" },
    { key: "puntos", label: "Puntos", numeric: true },
  ];

  const hasGroups = rows.some((r) => r.grupo);

  // El orden ENTRE grupos es fijo (Superior siempre antes que
  // Inferior, sin importar puntos); el click en una columna solo
  // reordena DENTRO de cada grupo.
  let displayRows;
  if (hasGroups) {
    const superior = sortRows(
      rows.filter((r) => r.grupo === "superior"),
      sort.key,
      sort.dir,
      sortType,
    );
    const inferior = sortRows(
      rows.filter((r) => r.grupo === "inferior"),
      sort.key,
      sort.dir,
      sortType,
    );
    displayRows = [
      { isGroupHeader: true, label: "Grupo Superior · Final Four" },
      ...superior,
      { isGroupHeader: true, label: "Grupo Inferior · Final Four" },
      ...inferior,
    ];
  } else {
    displayRows = sortRows(rows, sort.key, sort.dir, sortType);
  }

  let rank = 0;
  el.className = "";
  el.innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr>
        <th style="width:72px;">#</th>
        ${cols.map((c) => `<th ${sortIndicator(c, sort)}>${c.label}</th>`).join("")}
        <th class="bar-cell"></th>
      </tr></thead>
      <tbody>
        ${displayRows
          .map((r) => {
            if (r.isGroupHeader) {
              return `<tr class="group-header"><td colspan="4">${escapeHTML(r.label)}</td></tr>`;
            }
            rank += 1;
            return `
          <tr>
            <td><span class="rank ${rank === 1 ? "top" : ""}">${rank}</span></td>
            <td class="team">${escapeHTML(r.equipo)}</td>
            <td class="num"><span class="score"><span class="win">${r.puntos}</span></span></td>
            <td class="bar-cell"><div class="bar"><span style="width:${((r.puntos / max) * 100).toFixed(1)}%"></span></div></td>
          </tr>
        `;
          })
          .join("")}
      </tbody>
    </table></div>
  `;
}

let allPartidos = [];

function renderPartidos(rows) {
  const host = document.getElementById("partidos-content");
  if (!host) return;
  if (!rows.length) {
    host.className = "state";
    host.textContent = "Sin resultados para los filtros seleccionados";
    return;
  }
  const sort = state.partidos.sort;
  const colTypes = {
    num_partido: "num",
    fecha: "str",
    equipo_a: "str",
    equipo_b: "str",
    ganados_a: "num",
    ganados_b: "num",
  };
  const sorted = sortRows(rows, sort.key, sort.dir, colTypes[sort.key] || "str");
  const cols = [
    { key: "num_partido", label: "#", numeric: true, width: "60px" },
    { key: "fecha", label: "Fecha" },
    { key: "equipo_a", label: "Equipo A" },
    { key: "ganados_a", label: "A", numeric: true },
    { key: "ganados_b", label: "B", numeric: true },
    { key: "equipo_b", label: "Equipo B" },
  ];
  host.className = "";
  host.innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr>
        ${cols.map((c) => `<th ${sortIndicator(c, sort)}>${c.label}</th>`).join("")}
      </tr></thead>
      <tbody>
        ${sorted
          .map((r) => {
            const aWin = r.ganados_a > r.ganados_b;
            const bWin = r.ganados_b > r.ganados_a;
            return `
            <tr>
              <td><span class="rank">${escapeHTML(r.num_partido)}</span></td>
              <td>${escapeHTML(r.fecha)}</td>
              <td class="team" style="${aWin ? "color:var(--blue);" : ""}">${escapeHTML(r.equipo_a)}</td>
              <td class="num"><span class="score ${aWin ? "win" : ""}">${r.ganados_a}</span></td>
              <td class="num"><span class="score ${bWin ? "win" : ""}">${r.ganados_b}</span></td>
              <td class="team" style="${bWin ? "color:var(--blue);" : ""}">${escapeHTML(r.equipo_b)}</td>
            </tr>
          `;
          })
          .join("")}
      </tbody>
    </table></div>
  `;
}

function applyPartidosFilters() {
  renderPartidos(currentPartidosFiltered());
}

function setupPartidosFilters(rows) {
  allPartidos = rows;
  state.partidos.rows = rows;
  const fechas = [...new Set(rows.map((r) => r.fecha).filter(Boolean))];
  const equipos = [
    ...new Set(rows.flatMap((r) => [r.equipo_a, r.equipo_b]).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));

  const fSel = document.getElementById("filter-fecha");
  const eSel = document.getElementById("filter-equipo");
  fSel.innerHTML =
    '<option value="">Todas</option>' +
    fechas
      .map((f) => `<option value="${escapeHTML(f)}">${escapeHTML(f)}</option>`)
      .join("");
  eSel.innerHTML =
    '<option value="">Todos</option>' +
    equipos
      .map((e) => `<option value="${escapeHTML(e)}">${escapeHTML(e)}</option>`)
      .join("");

  fSel.addEventListener("change", applyPartidosFilters);
  eSel.addEventListener("change", applyPartidosFilters);
  document.getElementById("filter-reset").addEventListener("click", () => {
    fSel.value = "";
    eSel.value = "";
    applyPartidosFilters();
  });

  document.getElementById("partidos-filters").hidden = false;
  renderPartidos(rows);
}

function setupJugadoresFilters(rows) {
  const equipos = [...new Set(rows.map((r) => r.equipo).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  );
  const sel = document.getElementById("filter-jug-equipo");
  sel.innerHTML =
    '<option value="">Todos</option>' +
    equipos
      .map((e) => `<option value="${escapeHTML(e)}">${escapeHTML(e)}</option>`)
      .join("");
  sel.addEventListener("change", () => {
    state.jugadores.filterEquipo = sel.value;
    renderJugadores();
  });
  document.getElementById("filter-jug-reset").addEventListener("click", () => {
    sel.value = "";
    state.jugadores.filterEquipo = "";
    renderJugadores();
  });
  document.getElementById("jugadores-filters").hidden = false;
}

function renderJugadores() {
  const el = document.getElementById("jugadores-content");
  if (!el) return;
  const { rows, sort, filterEquipo } = state.jugadores;
  if (!rows.length) {
    el.className = "state";
    el.textContent = "Sin datos";
    return;
  }
  const colTypes = {
    equipo: "str",
    jugador: "str",
    jugados: "num",
    ganados: "num",
    efectividad: "num",
    aportacion: "num",
  };
  const filtered = filterEquipo
    ? rows.filter((r) => r.equipo === filterEquipo)
    : rows;
  if (!filtered.length) {
    el.className = "state";
    el.textContent = "Sin resultados para los filtros seleccionados";
    return;
  }
  const tiebreakers =
    sort.key === "ganados"
      ? [{ key: "efectividad", dir: "desc", type: "num" }]
      : null;
  const sorted = sortRows(
    filtered,
    sort.key,
    sort.dir,
    colTypes[sort.key] || "str",
    tiebreakers,
  );
  const cols = [
    { key: "equipo", label: "Equipo" },
    { key: "jugador", label: "Jugador" },
    { key: "jugados", label: "Jugados", numeric: true },
    { key: "ganados", label: "Ganados", numeric: true },
    {
      key: "efectividad",
      label: "Efectividad",
      numeric: true,
      extra: "bar-cell",
    },
    {
      key: "aportacion",
      label: "Aportación",
      numeric: true,
      extra: "bar-cell",
    },
  ];
  el.className = "";
  el.innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr>
        ${cols.map((c) => `<th ${sortIndicator(c, sort)}>${c.label}</th>`).join("")}
      </tr></thead>
      <tbody>
        ${sorted
          .map(
            (g) => `
          <tr>
            <td class="team">${escapeHTML(g.equipo)}</td>
            <td>${escapeHTML(g.jugador)}</td>
            <td class="num">${g.jugados}</td>
            <td class="num">${g.ganados}</td>
            <td class="bar-cell">
              <div class="bar-wrap">
                <div class="bar"><span style="width:${g.efectividad}%"></span></div>
                <span class="pct">${g.efectividad}%</span>
              </div>
            </td>
            <td class="bar-cell">
              <div class="bar-wrap">
                <div class="bar"><span style="width:${g.aportacion}%"></span></div>
                <span class="pct">${g.aportacion}%</span>
              </div>
            </td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table></div>
  `;
}

// ---- Tabs ----
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".tab")
      .forEach((b) => b.classList.remove("active"));
    document
      .querySelectorAll(".panel")
      .forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

// ---- Sort delegation ----
function bindSort(panelId, stateKey, rerender) {
  const panel = document.getElementById(panelId);
  panel.addEventListener("click", (e) => {
    const th = e.target.closest("th.sortable");
    if (!th || !panel.contains(th)) return;
    const key = th.dataset.key;
    const cur = state[stateKey].sort;
    if (cur.key === key) {
      cur.dir = cur.dir === "asc" ? "desc" : "asc";
    } else {
      cur.key = key;
      cur.dir = th.dataset.type === "num" ? "desc" : "asc";
    }
    rerender();
  });
}
bindSort("tabla", "tabla", renderTabla);
bindSort("partidos", "partidos", () =>
  renderPartidos(currentPartidosFiltered()),
);
bindSort("jugadores", "jugadores", renderJugadores);

function currentPartidosFiltered() {
  const f = document.getElementById("filter-fecha");
  const e = document.getElementById("filter-equipo");
  const fv = f ? f.value : "";
  const ev = e ? e.value : "";
  return allPartidos.filter(
    (r) =>
      (!fv || r.fecha === fv) &&
      (!ev || r.equipo_a === ev || r.equipo_b === ev),
  );
}

// ---- Tema ----
initTheme();

// ---- PNG Export ----
document.querySelectorAll(".btn-export").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const targetId = btn.dataset.target;
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Generando…";

    const slug = (SEASON ? SEASON.id + "-" : "") + targetId;
    const filename = `nekoma-${slug}-${new Date().toISOString().slice(0, 10)}.png`;

    try {
      const blob = await exportTableToPNG(targetId);
      const file = new File([blob], filename, { type: "image/png" });

      const canShareFiles =
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });

      btn.disabled = false;

      if (canShareFiles) {
        // Cambiar a botón de "Compartir" y esperar tap fresco
        btn.textContent = "↑ Tocar para compartir";
        btn.style.background = "var(--blue)";
        btn.style.color = "#fff";
        btn.style.borderColor = "var(--blue)";
        btn.style.fontWeight = "700";

        const shareHandler = async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          btn.removeEventListener("click", shareHandler);
          clearTimeout(timeoutId);

          try {
            await navigator.share({
              files: [file],
              title: "Liga Nekoma",
            });
          } catch (err) {
            if (err.name !== "AbortError") {
              triggerDownload(blob, filename);
            }
          } finally {
            resetButton(btn, originalLabel);
          }
        };

        btn.addEventListener("click", shareHandler);

        const timeoutId = setTimeout(() => {
          btn.removeEventListener("click", shareHandler);
          resetButton(btn, originalLabel);
        }, 15000);
      } else {
        // Sin soporte: descarga directa
        triggerDownload(blob, filename);
        resetButton(btn, originalLabel);
      }
    } catch (err) {
      alert("Error al exportar PNG: " + err.message);
      resetButton(btn, originalLabel);
    }
  });
});

function resetButton(btn, label) {
  btn.disabled = false;
  btn.textContent = label;
  btn.style.background = "";
  btn.style.color = "";
  btn.style.borderColor = "";
  btn.style.fontWeight = "";
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function exportTableToPNG(targetId) {
  return new Promise((resolve, reject) => {
    try {
      const card = document.getElementById(targetId);
      if (!card) throw new Error("Contenedor no encontrado");
      const table = card.querySelector("table");
      if (!table) throw new Error("No hay tabla para exportar");

      const isDark = document.body.classList.contains("dark");
      const T = isDark
        ? {
            bg: "#0a0c14",
            ink: "#e9ebf2",
            muted: "#7e8393",
            blue: "#5957ff",
            line: "rgba(233,235,242,0.12)",
            headBg: "rgba(255,255,255,0.04)",
            barBg: "rgba(233,235,242,0.12)",
            cardBg: "#14161f",
            rankBg: "#e9ebf2",
            rankInk: "#0a0c14",
          }
        : {
            bg: "#e9e9ea",
            ink: "#0b1020",
            muted: "#6b6e7a",
            blue: "#2a27ff",
            line: "rgba(11,16,32,0.14)",
            headBg: "rgba(255,255,255,0.6)",
            barBg: "rgba(11,16,32,0.1)",
            cardBg: "#ffffff",
            rankBg: "#0b1020",
            rankInk: "#ffffff",
          };

      const FONT_DISPLAY = `Impact, "Helvetica Neue Condensed", "Arial Narrow", "Arial Black", sans-serif`;
      const FONT_BODY = `-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif`;
      const FONT_MONO = `ui-monospace, "SF Mono", Menlo, Monaco, Consolas, "Courier New", monospace`;

      // Extraer datos
      const headerCells = [...table.querySelectorAll("thead th")];
      const headers = headerCells.map((th) => ({
        text: th.textContent.trim(),
        isNum: th.classList.contains("num"),
        isBar: th.classList.contains("bar-cell"),
      }));
      const rows = [...table.querySelectorAll("tbody tr")].map((tr) =>
        [...tr.querySelectorAll("td")].map((td) => {
          const rankEl = td.querySelector(".rank");
          const barEl = td.querySelector(".bar > span");
          const pctEl = td.querySelector(".pct");
          const scoreEl = td.querySelector(".score");
          const styleColor = (td.getAttribute("style") || "").includes(
            "var(--blue)",
          );
          return {
            text: td.textContent.trim(),
            isTeam: td.classList.contains("team"),
            isNum: td.classList.contains("num"),
            isBar: td.classList.contains("bar-cell"),
            isRank: !!rankEl,
            isRankTop: rankEl && rankEl.classList.contains("top"),
            rankText: rankEl ? rankEl.textContent.trim() : null,
            isWin: scoreEl && scoreEl.classList.contains("win"),
            isTeamWinner: styleColor,
            barPct: barEl ? parseFloat(barEl.style.width) || 0 : null,
            pctLabel: pctEl ? pctEl.textContent.trim() : null,
          };
        }),
      );

      // ---- Estrategia: calcular tamaños escalados a un factor K ----
      // K = multiplicador de resolución. Dibujamos TODO directamente a tamaño K*base.
      // No usamos ctx.scale() — control total sobre el output real.
      const MAX_CANVAS_WIDTH = 4000; // iOS Safari soporta bien hasta ~4096px
      const BASE = {
        // tamaños base en "px lógicos"
        padding: 36,
        titleFS: 28,
        subtitleFS: 12,
        titleGap: 44,
        headerH: 48,
        rowH: 54,
        colPad: 22,
        cardRadius: 16,
        headFS: 12,
        teamFS: 18,
        numFS: 18,
        bodyFS: 15,
        rankFS: 13,
        rankH: 30,
        barH: 6,
        pctFS: 12,
        pctW: 50,
        barMinW: 110,
        bottomGap: 24,
      };

      // Medir columnas a tamaño base (K=1) para saber qué tan ancha saldrá la imagen
      const measure = document.createElement("canvas");
      const mctx = measure.getContext("2d");
      const setFont = (w, s, f) => {
        mctx.font = `${w} ${s}px ${f}`;
      };

      const colWidths1 = headers.map((h, i) => {
        setFont("600", BASE.headFS, FONT_MONO);
        let max = mctx.measureText(h.text.toUpperCase()).width;
        rows.forEach((r) => {
          const c = r[i];
          if (!c) return;
          let w = 0;
          if (c.isRank) {
            setFont("600", BASE.rankFS, FONT_MONO);
            w = Math.max(BASE.rankH, mctx.measureText(c.rankText).width + 18);
          } else if (c.isBar) {
            w = BASE.barMinW + (c.pctLabel ? BASE.pctW + 10 : 0);
          } else if (c.isTeam) {
            setFont("900", BASE.teamFS, FONT_DISPLAY);
            w = mctx.measureText(c.text.toUpperCase()).width;
          } else if (c.isNum) {
            setFont("600", BASE.numFS, FONT_MONO);
            w = mctx.measureText(c.text).width;
          } else {
            setFont("500", BASE.bodyFS, FONT_BODY);
            w = mctx.measureText(c.text).width;
          }
          if (w > max) max = w;
        });
        return Math.ceil(max + BASE.colPad * 2);
      });

      const tableW1 = colWidths1.reduce((a, b) => a + b, 0);
      const W1 = tableW1 + BASE.padding * 2;

      // Elegir K: queremos K lo más alto posible pero sin pasar MAX_CANVAS_WIDTH
      // También respetar el devicePixelRatio del dispositivo para no malgastar.
      const dprCap = Math.min(3, Math.max(2, window.devicePixelRatio || 2));
      const kByDpr = dprCap;
      const kByWidth = MAX_CANVAS_WIDTH / W1;
      const K = Math.min(kByDpr, kByWidth, 3);

      // Escalar TODOS los valores por K
      const S = {};
      for (const key in BASE) S[key] = BASE[key] * K;
      const colWidths = colWidths1.map((w) => w * K);
      const tableW = tableW1 * K;
      const W = W1 * K;
      const cardH = S.headerH + S.rowH * rows.length;
      const H = S.padding * 2 + S.titleGap + cardH + S.bottomGap;

      // Canvas a tamaño real (no usamos ctx.scale)
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(W);
      canvas.height = Math.ceil(H);
      const ctx = canvas.getContext("2d");

      // Activar smoothing de alta calidad
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.textBaseline = "middle";

      // Fondo
      ctx.fillStyle = T.bg;
      ctx.fillRect(0, 0, W, H);

      // Título
      const titleMap = {
        "tabla-card": "TABLA",
        "partidos-card": "PARTIDOS",
        "jugadores-card": "JUGADORES",
      };
      const titleText =
        "LIGA NEKOMA" + (titleMap[targetId] ? " — " + titleMap[targetId] : "");

      ctx.fillStyle = T.blue;
      ctx.font = `900 ${S.titleFS}px ${FONT_DISPLAY}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(titleText, S.padding, S.padding);

      ctx.fillStyle = T.muted;
      ctx.font = `600 ${S.subtitleFS}px ${FONT_MONO}`;
      const dateStr = new Date()
        .toLocaleString("es-ES", {
          dateStyle: "short",
          timeStyle: "short",
        })
        .toUpperCase();
      // Subtítulo: temporada + periodo + momento de la exportación. Si no cabe
      // en el ancho de la tabla se van soltando las partes menos importantes.
      const subtitleParts = [
        SEASON ? SEASON.label : null,
        SEASON ? SEASON.title.toUpperCase() : null,
        seasonMeta.periodo ? seasonMeta.periodo.toUpperCase() : null,
        dateStr,
      ].filter(Boolean);
      let subtitle = subtitleParts.join(" · ");
      while (
        subtitleParts.length > 1 &&
        ctx.measureText(subtitle).width > tableW
      ) {
        subtitleParts.splice(subtitleParts.length - 2, 1); // conserva la fecha
        subtitle = subtitleParts.join(" · ");
      }
      ctx.fillText(subtitle, S.padding, S.padding + S.titleFS + 6 * K);

      // Card
      const cardX = S.padding;
      const cardY = S.padding + S.titleGap + 20 * K;
      roundRect(ctx, cardX, cardY, tableW, cardH, S.cardRadius);
      ctx.fillStyle = T.cardBg;
      ctx.fill();
      ctx.lineWidth = 1 * K;
      ctx.strokeStyle = T.line;
      ctx.stroke();

      // Header bg
      ctx.save();
      roundRectTop(ctx, cardX, cardY, tableW, S.headerH, S.cardRadius);
      ctx.clip();
      ctx.fillStyle = T.headBg;
      ctx.fillRect(cardX, cardY, tableW, S.headerH);
      ctx.restore();

      // Header texto
      ctx.font = `600 ${S.headFS}px ${FONT_MONO}`;
      ctx.fillStyle = T.muted;
      ctx.textBaseline = "middle";
      let x = cardX;
      headers.forEach((h, i) => {
        const w = colWidths[i];
        ctx.textAlign = h.isNum ? "right" : "left";
        const tx = h.isNum ? x + w - S.colPad : x + S.colPad;
        ctx.fillText(h.text.toUpperCase(), tx, cardY + S.headerH / 2);
        x += w;
      });

      // Línea debajo del header
      ctx.strokeStyle = T.line;
      ctx.lineWidth = 1 * K;
      ctx.beginPath();
      ctx.moveTo(cardX, cardY + S.headerH);
      ctx.lineTo(cardX + tableW, cardY + S.headerH);
      ctx.stroke();

      // Filas
      rows.forEach((row, ri) => {
        const y = cardY + S.headerH + S.rowH * ri;
        const cy = y + S.rowH / 2;

        if (ri > 0) {
          ctx.strokeStyle = T.line;
          ctx.lineWidth = 1 * K;
          ctx.beginPath();
          ctx.moveTo(cardX + S.colPad, y);
          ctx.lineTo(cardX + tableW - S.colPad, y);
          ctx.stroke();
        }

        let cx = cardX;
        row.forEach((cell, ci) => {
          const w = colWidths[ci];

          if (cell.isRank) {
            ctx.font = `600 ${S.rankFS}px ${FONT_MONO}`;
            const pillW = Math.max(
              S.rankH,
              ctx.measureText(cell.rankText).width + 18 * K,
            );
            const pillH = S.rankH;
            const px = cx + S.colPad;
            const py = cy - pillH / 2;
            roundRect(ctx, px, py, pillW, pillH, pillH / 2);
            ctx.fillStyle = cell.isRankTop ? T.blue : T.rankBg;
            ctx.fill();
            ctx.fillStyle = cell.isRankTop ? "#fff" : T.rankInk;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(cell.rankText, px + pillW / 2, cy + 1 * K);
          } else if (cell.isBar) {
            const labelW = cell.pctLabel ? S.pctW + 10 * K : 0;
            const barW = w - S.colPad * 2 - labelW;
            const bx = cx + S.colPad;
            const by = cy - S.barH / 2;
            roundRect(ctx, bx, by, barW, S.barH, S.barH / 2);
            ctx.fillStyle = T.barBg;
            ctx.fill();
            const pct = Math.max(0, Math.min(100, cell.barPct || 0)) / 100;
            if (pct > 0) {
              const fillW = Math.max(S.barH, barW * pct);
              roundRect(ctx, bx, by, fillW, S.barH, S.barH / 2);
              ctx.fillStyle = T.blue;
              ctx.fill();
            }
            if (cell.pctLabel) {
              ctx.font = `600 ${S.pctFS}px ${FONT_MONO}`;
              ctx.fillStyle = T.muted;
              ctx.textAlign = "right";
              ctx.textBaseline = "middle";
              ctx.fillText(cell.pctLabel, cx + w - S.colPad, cy);
            }
          } else if (cell.isTeam) {
            ctx.font = `900 ${S.teamFS}px ${FONT_DISPLAY}`;
            ctx.fillStyle = cell.isTeamWinner ? T.blue : T.ink;
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(cell.text.toUpperCase(), cx + S.colPad, cy);
          } else if (cell.isNum) {
            ctx.font = `600 ${S.numFS}px ${FONT_MONO}`;
            ctx.fillStyle = cell.isWin ? T.blue : T.ink;
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            ctx.fillText(cell.text, cx + w - S.colPad, cy);
          } else {
            ctx.font = `500 ${S.bodyFS}px ${FONT_BODY}`;
            ctx.fillStyle = T.ink;
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(cell.text, cx + S.colPad, cy);
          }

          cx += w;
        });
      });

      // Exportar como Blob (mejor en iOS que toDataURL para canvas grandes)
      if (canvas.toBlob) {
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error("No se pudo generar el PNG"));
          resolve(blob);
        }, "image/png");
      } else {
        // Fallback: dataURL -> Blob
        const dataUrl = canvas.toDataURL("image/png");
        const bin = atob(dataUrl.split(",")[1]);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        resolve(new Blob([arr], { type: "image/png" }));
      }
    } catch (err) {
      reject(err);
    }
  });
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function roundRectTop(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ---- Textos de la temporada ----

function applySeasonChrome() {
  document.title = `Liga Nekoma ${SEASON.title} · ${SEASON.label}`;
  document.getElementById("hero-title").innerHTML =
    `Liga<br />Nekoma ${escapeHTML(SEASON.title)}`;
  document.getElementById("footer-season").textContent =
    `NEKOMA · ${SEASON.title}`;
}

function applySeasonMeta(records) {
  seasonMeta.name = seasonDisplayName(SEASON, records);
  seasonMeta.periodo = seasonPeriodLabel(records);
  const anios = seasonYearLabel(records);

  document.getElementById("hero-meta").innerHTML =
    `<strong>${escapeHTML(seasonMeta.name)}</strong>` +
    (seasonMeta.periodo ? ` · ${escapeHTML(seasonMeta.periodo)}` : "");
  document.getElementById("footer-season").textContent =
    `NEKOMA · ${SEASON.title}` + (anios ? ` · ${anios}` : "");
  if (seasonMeta.name) {
    document.title = `${seasonMeta.name} · Liga Nekoma ${SEASON.title}`;
  }
}

function showError(msg) {
  for (const id of ["tabla-content", "partidos-content", "jugadores-content"]) {
    const el = document.getElementById(id);
    if (el) {
      el.className = "state error";
      el.textContent = msg;
    }
  }
}

// ---- Load ----
async function load() {
  if (!SEASON) {
    if (!SEASON_PARAM) {
      location.replace("index.html");
      return;
    }
    document.getElementById("hero-meta").textContent =
      "Temporada no encontrada";
    showError(`No existe la temporada "${SEASON_PARAM}". Vuelve a Temporadas.`);
    return;
  }

  applySeasonChrome();

  try {
    const records = await fetchRecords(await seasonCsvUrl(SEASON));

    applySeasonMeta(records);

    state.tabla.rows = computeStandings(records, SEASON);
    renderTabla();

    setupPartidosFilters(queryPartidos(records));

    state.jugadores.rows = queryJugadores(records);
    setupJugadoresFilters(state.jugadores.rows);
    renderJugadores();

    const d = new Date();
    document.getElementById("updated").textContent =
      "Actualizado " +
      d.toLocaleString("es-ES", {
        dateStyle: "short",
        timeStyle: "short",
      });
  } catch (err) {
    showError("Error al cargar datos: " + err.message);
  }
}

load();
