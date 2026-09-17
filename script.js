const EUR0 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const DATE_FMT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function formatDate(isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  return DATE_FMT.format(d);
}

function avg(tier) {
  return (tier.price_min + tier.price_max) / 2;
}

function perWc(tier) {
  return avg(tier) / (tier.power_kwc * 1000);
}

// Linear interpolation/extrapolation of price bounds for an arbitrary kWc value,
// using the two nearest known tiers from data/prices.json.
function estimateForPower(tiers, kwc) {
  const sorted = [...tiers].sort((a, b) => a.power_kwc - b.power_kwc);
  let lower = sorted[0];
  let upper = sorted[sorted.length - 1];

  for (let i = 0; i < sorted.length - 1; i++) {
    if (kwc >= sorted[i].power_kwc && kwc <= sorted[i + 1].power_kwc) {
      lower = sorted[i];
      upper = sorted[i + 1];
      break;
    }
  }
  if (kwc <= sorted[0].power_kwc) {
    lower = sorted[0];
    upper = sorted[1];
  }
  if (kwc >= sorted[sorted.length - 1].power_kwc) {
    lower = sorted[sorted.length - 2];
    upper = sorted[sorted.length - 1];
  }

  const span = upper.power_kwc - lower.power_kwc;
  const t = span === 0 ? 0 : (kwc - lower.power_kwc) / span;
  const lerp = (a, b) => a + (b - a) * t;

  const price_min = Math.max(0, lerp(lower.price_min, upper.price_min));
  const price_max = Math.max(0, lerp(lower.price_max, upper.price_max));
  const surface = lerp(lower.surface_m2_approx, upper.surface_m2_approx);

  return { price_min, price_max, surface };
}

async function loadData() {
  const res = await fetch("data/prices.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Impossible de charger data/prices.json");
  return res.json();
}

function renderHeaderDates(data) {
  const nice = formatDate(data.lastUpdated);
  document.getElementById("pill-date").textContent = nice;
  document.getElementById("fresh-date").textContent = nice;
  document.getElementById("footer-date").textContent = nice;
}

function renderHeroStats(data) {
  const byPower = Object.fromEntries(data.tiers.map((t) => [t.power_kwc, t]));
  const set = (id, tier) => {
    const el = document.getElementById(id);
    if (tier) el.textContent = `${EUR0.format(tier.price_min)} – ${EUR0.format(tier.price_max)}`;
  };
  set("stat-3kwc", byPower[3]);
  set("stat-6kwc", byPower[6]);
  set("stat-9kwc", byPower[9]);
}

function renderTable(data) {
  const body = document.getElementById("compare-body");
  body.innerHTML = "";
  data.tiers
    .slice()
    .sort((a, b) => a.power_kwc - b.power_kwc)
    .forEach((tier) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="power-cell">${tier.power_kwc} kWc</td>
        <td>${EUR0.format(tier.price_min)}</td>
        <td>${EUR0.format(avg(tier))}</td>
        <td>${EUR0.format(tier.price_max)}</td>
        <td><span class="badge-wc">${perWc(tier).toFixed(2)} €/Wc</span></td>
        <td>≈ ${tier.surface_m2_approx} m²</td>
      `;
      body.appendChild(tr);
    });
}

function renderFactors(data) {
  const grid = document.getElementById("factor-grid");
  grid.innerHTML = "";
  data.factors.forEach((f) => {
    const div = document.createElement("div");
    div.className = "factor-card";
    div.innerHTML = `<h3>${f.title}</h3><p>${f.detail}</p>`;
    grid.appendChild(div);
  });
}

function renderAides(data) {
  const grid = document.getElementById("aide-grid");
  const { primeAutoconsommation: prime, rachatSurplus: rachat } = data;
  grid.innerHTML = `
    <div class="aide-card">
      <span class="tag tag-warn">Prime autoconsommation</span>
      <h3>Supprimée pour les nouvelles demandes</h3>
      <p>${prime.status}</p>
      <div class="figure">${prime.legacyRate_eur_per_kwc} €/kWc</div>
      <p>${prime.legacyNote}</p>
    </div>
    <div class="aide-card">
      <span class="tag tag-ok">Tarif de rachat EDF OA</span>
      <h3>Depuis le ${formatDate(rachat.effectiveDate)}</h3>
      <p>${rachat.note}</p>
      <div class="figure">${rachat.rate_c_per_kwh} c€/kWh <span style="font-size:0.95rem;font-weight:600;color:var(--ink-soft)">(+${rachat.indexation_annual_pct}%/an)</span></div>
      <p>Ancien tarif : ${rachat.legacyRate_c_per_kwh} c€/kWh (conservé 20 ans pour les dossiers validés avant la réforme).</p>
    </div>
  `;
}

function renderSources(data) {
  const list = document.getElementById("sources-list");
  list.innerHTML = "";
  data.sources.forEach((s) => {
    const li = document.createElement("li");
    li.innerHTML = `<a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.title}</a>`;
    list.appendChild(li);
  });
}

function setupSimulator(data) {
  const range = document.getElementById("kwc-range");
  const kwcValue = document.getElementById("kwc-value");
  const simRange = document.getElementById("sim-range");
  const simPerWc = document.getElementById("sim-per-wc");
  const simSurface = document.getElementById("sim-surface");
  const presetsWrap = document.getElementById("sim-presets");

  const presets = [3, 6, 9];
  presetsWrap.innerHTML = "";
  presets.forEach((p) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "preset-btn";
    btn.textContent = `${p} kWc`;
    btn.addEventListener("click", () => {
      range.value = String(p);
      update();
    });
    presetsWrap.appendChild(btn);
  });

  function syncPresetActive(kwc) {
    [...presetsWrap.children].forEach((btn, i) => {
      btn.classList.toggle("active", presets[i] === kwc);
    });
  }

  function update() {
    const kwc = parseFloat(range.value);
    kwcValue.textContent = kwc.toFixed(kwc % 1 === 0 ? 0 : 1);
    const est = estimateForPower(data.tiers, kwc);
    simRange.textContent = `${EUR0.format(est.price_min)} – ${EUR0.format(est.price_max)}`;
    const midWc = ((est.price_min + est.price_max) / 2 / (kwc * 1000)).toFixed(2);
    simPerWc.textContent = `${midWc} €/Wc`;
    simSurface.textContent = `≈ ${Math.round(est.surface)} m²`;
    syncPresetActive(kwc);
  }

  range.addEventListener("input", update);
  update();
}

async function init() {
  try {
    const data = await loadData();
    renderHeaderDates(data);
    renderHeroStats(data);
    renderTable(data);
    renderFactors(data);
    renderAides(data);
    renderSources(data);
    setupSimulator(data);
  } catch (err) {
    const body = document.getElementById("compare-body");
    if (body) {
      body.innerHTML = `<tr><td colspan="6">Erreur de chargement des données : ${err.message}</td></tr>`;
    }
    console.error(err);
  }
}

init();
