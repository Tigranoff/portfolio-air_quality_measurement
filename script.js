// Read URL load
document.getElementById("load-url").addEventListener("click", async function () {
  const url = document.getElementById("data-url").value.trim();
  if (!url) return;

  try {
    const response = await fetch(url);
    const json = await response.json();
    loadJSON(json);
  } catch (err) {
    alert("Failed to load JSON from URL (CORS?)");
  }
});

// Draw charts
function loadJSON(data) {
  const readings = data.readings;

  // Extract arrays of values
  const labels = readings.map(r => r.timestamp);

  const temp = readings.map(r => r.temperature);
  const pm25 = readings.map(r => r.pm2_5);
  const hum = readings.map(r => r.humidity);
  const pres = readings.map(r => r.pressure);
  const co2 = readings.map(r => r.co2ppm);
  const voc = readings.map(r => r.sgp40_raw); // or r.tvoc_index if you prefer

  // Helper to create charts
  function createChart(id, label, data, color="blue") {
    const ctx = document.getElementById(id);
    new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: label,
          data: data,
          borderColor: color,
          borderWidth: 2,
          fill: false,
          pointRadius: 0
        }]
      }
    });
  }

  // Temperature
  createChart("chart-temp", "Temperature (°C)", temp, "red");

  // Particulate Matter (pm2.5)
  createChart("chart-pm", "PM2.5 (µg/m³)", pm25, "green");

  // Humidity
  createChart("chart-hum", "Humidity (%)", hum, "blue");

  // Pressure
  createChart("chart-pres", "Pressure (hPa)", pres, "orange");

  // CO2 ppm
  createChart("chart-co2", "CO₂ (ppm)", co2, "purple");

  // VOC raw or index
  createChart("chart-voc", "VOC Raw (SGP40)", voc, "brown");
}

(function () {
  // Run only if the stats page elements exist (either load button or a chart canvas)
  if (!document.getElementById('load-url') && !document.getElementById('chart-temp')) return;

  const urlEl = document.getElementById('data-url');
  const loadUrlBtn = document.getElementById('load-url');
  const statusEl = document.getElementById('status');

  let charts = {};

  // Accept multiple comma-separated URLs, or if empty try default local files (voc + without_voc).
  loadUrlBtn.addEventListener('click', async () => {
    const raw = (urlEl && urlEl.value || '').trim();
    let urls = [];
    if (raw) {
      // split by comma and trim
      urls = raw.split(/\s*,\s*/).filter(Boolean);
    } else {
      // try common local filenames (voc first), useful when deployed on a server
      urls = ['./data_with_voc.json', './data_without_voc.json', './data_without_voc.json'];
    }

    status('Fetching JSON...');
    try {
      const combined = [];
      for (const u of urls) {
        status(`Fetching ${u} ...`);
        try {
          const res = await fetch(u, { cache: 'no-store' });
          if (!res.ok) {
            console.warn('Fetch failed for', u, res.status);
            continue;
          }
          const parsed = await res.json();
          // normalizeInput will return an array when parsed has 'readings' or similar
          const arr = normalizeInput(parsed);
          if (Array.isArray(arr) && arr.length) {
            combined.push(...arr);
          } else if (Array.isArray(parsed) && parsed.length) {
            combined.push(...parsed);
          } else {
            // nothing usable in this file
            console.info('No array found in', u);
          }
        } catch (errFetch) {
          console.warn('Error fetching/parsing', u, errFetch);
        }
      }

      if (!combined.length) {
        status('No data loaded from provided URL(s). Paste valid JSON URL(s) or host JSON files alongside this site.');
        return;
      }

      // merged readings array -> render
      renderFromData(combined);
      status('Loaded data from URL(s).');
    } catch (err) {
      status('Failed to fetch/parse URL(s): ' + err.message);
    }
  });

  function status(msg) {
    statusEl.textContent = msg;
  }

  function extractNumber(obj, keys) {
    for (const k of keys) {
      if (obj == null) continue;
      if (k in obj && obj[k] !== null && obj[k] !== '') {
        const v = Number(obj[k]);
        return Number.isFinite(v) ? v : null;
      }
    }
    return null;
  }

  function renderFromData(raw) {
    const arr = normalizeInput(raw);
    if (!arr.length) {
      status('No data found in the provided JSON.');
      return;
    }

    // build time-sorted entries
    const entries = arr.map((it) => {
      // common key aliases
      const ts = it.timestamp ?? it.time ?? it.t ?? it.date ?? it.datetime ?? it.ts;
      return {
        date: parseTimestamp(ts),
        temperature: extractNumber(it, ['temperature', 'temp', 't']),
        humidity: extractNumber(it, ['humidity', 'hum', 'h']),
        pressure: extractNumber(it, ['pressure', 'pres', 'p']),
        pm2_5: extractNumber(it, ['pm2_5', 'pm2.5', 'pm25', 'pm_2_5', 'pm2']),
        pm10: extractNumber(it, ['pm10', 'pm_10']),
        pm1_0: extractNumber(it, ['pm1_0', 'pm1.0', 'pm1']),
        // include common variants used in your file (co2ppm)
        co2: extractNumber(it, ['co2', 'co_2', 'co2_ppm', 'co2ppm', 'co2_ppm']),
        // VOC variants
        voc: extractNumber(it, ['voc', 'tvoc', 'voc_ppb', 'vocppb']),
      };
    }).filter(e => e.date !== null).sort((a,b)=>a.date - b.date);

    if (!entries.length) {
      status('No entries with valid timestamps found.');
      return;
    }

    const labels = entries.map(e => e.date.toISOString());

    const series = {
      temperature: entries.map(e => e.temperature),
      humidity: entries.map(e => e.humidity),
      pressure: entries.map(e => e.pressure),
      pm2_5: entries.map(e => e.pm2_5),
      pm10: entries.map(e => e.pm10),
      pm1_0: entries.map(e => e.pm1_0),
      co2: entries.map(e => e.co2),
      voc: entries.map(e => e.voc),
    };

    // helper: compute simple moving average (window size n)
    function movingAverage(arr, n = 5) {
      const res = new Array(arr.length).fill(null);
      if (n <= 1) return arr.map(v => (typeof v === 'number' ? v : null));
      let sum = 0, cnt = 0;
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        if (typeof v === 'number' && Number.isFinite(v)) {
          sum += v; cnt++;
        }
        if (i >= n) {
          const old = arr[i - n];
          if (typeof old === 'number' && Number.isFinite(old)) { sum -= old; cnt--; }
        }
        if (cnt > 0) res[i] = +(sum / cnt).toFixed(2);
      }
      return res;
    }

    // compute summary metrics (min/max/avg) for a numeric array
    function summaryStats(arr) {
      const nums = (arr || []).filter(v => typeof v === 'number' && Number.isFinite(v));
      if (!nums.length) return null;
      const min = Math.min(...nums), max = Math.max(...nums);
      const avg = nums.reduce((a,b)=>a+b,0)/nums.length;
      return {min:+min.toFixed(2), max:+max.toFixed(2), avg:+avg.toFixed(2), count:nums.length};
    }

    // helper: check if dataset(s) contain at least one finite number
    function hasNumericData(datasetArray) {
      return datasetArray.some(ds => Array.isArray(ds.data) && ds.data.some(v => typeof v === 'number' && Number.isFinite(v)));
    }

    // render chart + moving average + summary
    function safeEnsureWithMA(id, labels, baseDatasets, opts = {}) {
      const hasData = hasNumericData(baseDatasets);
      if (!hasData) {
        if (charts[id]) { try { charts[id].destroy(); } catch(e){} delete charts[id]; }
        showEmptyState(id, 'No data for this metric in the uploaded file.');
        updateSummary(id, null);
        return;
      }
      clearEmptyState(id);
      // compute MA on the first dataset only (per metric)
      try {
        const maWindow = opts.maWindow ?? 7;
        const maDatasets = [];
        for (const ds of baseDatasets) {
          const ma = movingAverage(ds.data, maWindow);
          maDatasets.push({
            label: `${ds.label} — MA(${maWindow})`,
            data: ma,
            borderColor: ds.borderColor.replace('rgb', 'rgba').replace(')', ',0.9)'),
            borderDash: [6,4],
            backgroundColor: 'transparent',
            pointRadius: 0,
            borderWidth: 2,
          });
        }
        // combine base + MA (MA styled differently)
        const datasets = baseDatasets.map(d => ({...d, fill:true, backgroundColor: d.backgroundColor ?? 'rgba(0,0,0,0.05)', borderWidth:2, pointRadius:2})).concat(maDatasets);
        ensureChart(id, labels, datasets, opts);

        // update summary under chart (based on first base dataset)
        const stats = summaryStats(baseDatasets[0].data);
        updateSummary(id, stats);
      } catch (err) {
        console.error('Chart render error', err);
        showEmptyState(id, 'Chart error — see console.');
        updateSummary(id, null);
      }
    }

    // create/update charts with better visuals and MA
    safeEnsureWithMA('chart-temp', labels, [{label:'Temperature (°C)', data: series.temperature, borderColor:'rgb(255,99,132)', backgroundColor:'rgba(255,99,132,0.12)'}], {yLabel:'°C', maWindow:7});
    safeEnsureWithMA('chart-pm', labels, [
      {label:'PM2.5 (µg/m³)', data: series.pm2_5, borderColor:'rgb(54,162,235)', backgroundColor:'rgba(54,162,235,0.12)'},
      {label:'PM10 (µg/m³)', data: series.pm10, borderColor:'rgb(75,192,192)', backgroundColor:'rgba(75,192,192,0.10)'}
    ], {yLabel:'µg/m³', maWindow:9});
    safeEnsureWithMA('chart-hum', labels, [{label:'Humidity (%)', data: series.humidity, borderColor:'rgb(153,102,255)', backgroundColor:'rgba(153,102,255,0.10)'}], {yLabel:'%'} );
    safeEnsureWithMA('chart-pres', labels, [{label:'Pressure (hPa)', data: series.pressure, borderColor:'rgb(255,159,64)', backgroundColor:'rgba(255,159,64,0.08)'}], {yLabel:'hPa'} );
    safeEnsureWithMA('chart-co2', labels, [{label:'CO₂ (ppm)', data: series.co2, borderColor:'rgb(201,203,207)', backgroundColor:'rgba(201,203,207,0.10)'}], {yLabel:'ppm'} );
    safeEnsureWithMA('chart-voc', labels, [{label:'VOC (ppb)', data: series.voc, borderColor:'rgb(255,205,86)', backgroundColor:'rgba(255,205,86,0.10)'}], {yLabel:'ppb'} );
    // also show pm1 if available in a dedicated hidden chart or summary (optional)
    // safeEnsureWithMA('chart-pm1', labels, [{label:'PM1.0 (µg/m³)', data: series.pm1_0, borderColor:'rgb(100,150,200)', backgroundColor:'rgba(100,150,200,0.08)'}], {yLabel:'µg/m³'} );

    status('Charts rendered. If some charts appear empty it means those fields were not present in the provided JSON.');
  }

  // update or insert numeric summary under a chart-card
  function updateSummary(canvasId, stats) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const card = canvas.closest('.chart-card') || canvas.parentElement;
    if (!card) return;
    let s = card.querySelector('.chart-summary');
    if (!s) {
      s = document.createElement('div');
      s.className = 'chart-summary';
      card.appendChild(s);
    }
    if (!stats) {
      s.innerHTML = '<em class="muted">No numeric data</em>';
      return;
    }
    s.innerHTML = `<div>n=${stats.count} • min=${stats.min} • avg=${stats.avg} • max=${stats.max}</div>`;
  }

  // ...existing ensureChart definition replaced earlier ... (keeps category x axis)
  // Make sure ensureChart sets better tooltip formatting and gridlines
  function ensureChart(canvasId, labels, datasets, opts = {}) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (charts[canvasId]) { try { charts[canvasId].destroy(); } catch(e){} delete charts[canvasId]; }

    const cleanDatasets = datasets.map(ds => ({
      ...ds,
      data: ds.data.map(v => (v === undefined || v === null ? null : v)),
      tension: 0.24,
      pointRadius: ds.pointRadius ?? 2,
      spanGaps: false,
    }));

    charts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: cleanDatasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: true, position: 'top', labels: { usePointStyle: true, boxWidth:10 } },
          tooltip: {
            mode: 'index',
            callbacks: {
              label: (context) => {
                const v = context.raw;
                if (v === null || v === undefined) return context.dataset.label + ': —';
                return `${context.dataset.label}: ${typeof v === 'number' ? v : v}`;
              }
            }
          }
        },
        scales: {
          x: {
            type: 'category',
            title: { display: true, text: 'Time' },
            ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 10 }
          },
          y: {
            title: { display: !!opts.yLabel, text: opts.yLabel || '' },
            grid: { color: 'rgba(0,0,0,0.06)' },
            ticks: {
              callback: function(val) { return Number.isFinite(val) ? (+val).toFixed(2) : val; }
            }
          }
        }
      }
    });
  }

})();
