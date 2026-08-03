/* Selector de temporadas. Pinta una tarjeta por cada entrada de SEASONS
   (assets/config.js) y completa nombre, periodo y estadísticas leyendo la
   pestaña correspondiente del Google Sheet. */

initTheme();

// Más reciente primero.
const seasons = getSeasons().slice().reverse();

function cardHTML(season) {
  return `
    <a class="season-card is-loading" href="${escapeHTML(seasonUrl(season))}" id="card-${escapeHTML(season.id)}">
      <div class="season-top">
        <span class="season-num">${String(season.num).padStart(2, "0")}</span>
        <span class="season-status" data-role="status">Cargando…</span>
      </div>
      <h2 class="season-title">${escapeHTML(season.title)}</h2>
      <div class="season-period" data-role="period"></div>
      <div class="season-stats" data-role="stats"></div>
      <div class="season-go">Ver resultados →</div>
    </a>
  `;
}

document.getElementById("seasons").innerHTML = seasons.map(cardHTML).join("");

function fillCard(season, summary) {
  const card = document.getElementById("card-" + season.id);
  if (!card) return;
  card.classList.remove("is-loading");

  const status = card.querySelector('[data-role="status"]');
  status.textContent = summary.finalizada ? "Finalizada" : "En curso";
  status.classList.toggle("live", !summary.finalizada);

  card.querySelector('[data-role="period"]').textContent = summary.periodo;

  const stats = [
    [summary.equipos, "equipo", "equipos"],
    [summary.jornadas, "jornada", "jornadas"],
    [summary.partidos, "partido", "partidos"],
  ];
  card.querySelector('[data-role="stats"]').innerHTML = stats
    .map(([n, one, many]) => `<span><b>${n}</b> ${n === 1 ? one : many}</span>`)
    .join("");

  card.title = `${summary.name} · ${season.title}`;
}

function failCard(season, err) {
  const card = document.getElementById("card-" + season.id);
  if (!card) return;
  card.classList.remove("is-loading");
  card.classList.add("is-error");
  card.querySelector('[data-role="status"]').textContent = "Sin datos";
  card.querySelector('[data-role="period"]').textContent = "";
  card.querySelector('[data-role="stats"]').textContent = err.message;
}

async function loadSeason(season) {
  try {
    const records = await fetchRecords(await seasonCsvUrl(season));
    fillCard(season, seasonSummary(season, records));
  } catch (err) {
    failCard(season, err);
  }
}

Promise.all(seasons.map(loadSeason)).then(() => {
  const d = new Date();
  document.getElementById("updated").textContent =
    "Actualizado " +
    d.toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
});
