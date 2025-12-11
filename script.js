// GitHub button functionality and repo-button wiring
document.addEventListener('DOMContentLoaded', () => {
	// Open repo in new tab when a button with data-repo is clicked
	document.querySelectorAll('[data-repo]').forEach(btn => {
		btn.addEventListener('click', () => {
			const url = btn.getAttribute('data-repo');
			if (url) window.open(url, '_blank', 'noopener');
		});
	});
});

// --- Stats/chart logic (runs only on stats page) ---
(function () {
  // Guard: do nothing unless there's a chart canvas on the page
  if (!document.getElementById('chart-temp')) return;

  const statusEl = document.getElementById('status');
  let charts = {};

  // Utility: write status
  function status(msg) {
    if (statusEl) statusEl.textContent = msg;
    console.info('[stats] ' + msg);
  }

  // Normalize data array: supports array, { data: [] }, { readings: [] }, or named arrays inside object
  function normalizeInput(input) {
    if (!input) return [];
    if (Array.isArray(input)) return input;
    if (input && Array.isArray(input.data)) return input.data;
    if (input && Array.isArray(input.readings)) return input.readings;
    for (const k of Object.keys(input || {})) {
      if (Array.isArray(input[k])) return input[k];
    }
    return [];
  }

  // Parse timestamps (ISO string, epoch seconds, epoch ms)
  function parseTimestamp(v) {
    if (v == null) return null;
    if (typeof v === 'number') {
      // assume ms if large, else seconds
      if (v > 1e12) return new Date(v);
      if (v > 1e9) return new Date(v);
      return new Date(v * 1000);
    }
    const n = Number(v);
    if (!Number.isNaN(n)) {
      if (n > 1e12) return new Date(n);
      if (n > 1e9) return new Date(n);
      return new Date(n * 1000);
    }
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? null : d;
  }

  // Extract numeric value from object using list of possible keys
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

  // Simple moving average (window n). Returns array same length, null where no value.
  function movingAverage(arr, n = 5) {
    const res = new Array(arr.length).fill(null);
    if (n <= 1) {
      return arr.map(v => (typeof v === 'number' && Number.isFinite(v) ? +v : null));
    }
    let sum = 0, cnt = 0;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (typeof v === 'number' && Number.isFinite(v)) { sum += v; cnt++; }
      if (i >= n) {
        const old = arr[i - n];
        if (typeof old === 'number' && Number.isFinite(old)) { sum -= old; cnt--; }
      }
      if (cnt > 0) res[i] = +(sum / cnt).toFixed(2);
    }
    return res;
  }

  // Numeric summary
  function summaryStats(arr) {
    const nums = (arr || []).filter(v => typeof v === 'number' && Number.isFinite(v));
    if (!nums.length) return null;
    const min = Math.min(...nums), max = Math.max(...nums);
    const avg = nums.reduce((a,b)=>a+b,0)/nums.length;
    return {min:+min.toFixed(2), max:+max.toFixed(2), avg:+avg.toFixed(2), count:nums.length};
  }

  // Show a "No data" overlay inside chart-card
  function showEmptyState(canvasId, message) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const card = canvas.closest('.chart-card') || canvas.parentElement;
    if (!card) return;
    clearEmptyState(canvasId);
    const ov = document.createElement('div');
    ov.className = 'chart-empty-overlay';
    ov.textContent = message;
    card.appendChild(ov);
  }

  function clearEmptyState(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const card = canvas.closest('.chart-card') || canvas.parentElement;
    if (!card) return;
    const existing = card.querySelector('.chart-empty-overlay');
    if (existing) existing.remove();
  }

  // Update or insert numeric summary under a chart-card
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

  // Ensure chart: destroy existing then create new (category x-axis)
  function ensureChart(canvasId, labels, datasets, opts = {}) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (charts[canvasId]) { try { charts[canvasId].destroy(); } catch(e){} delete charts[canvasId]; }

    const cleanDatasets = datasets.map(ds => ({
      ...ds,
      data: (ds.data || []).map(v => (v === undefined || v === null ? null : v)),
      tension: ds.tension ?? 0.24,
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

  // Helper: check if dataset(s) contain at least one numeric value
  function hasNumericData(datasetArray) {
    return datasetArray.some(ds => Array.isArray(ds.data) && ds.data.some(v => typeof v === 'number' && Number.isFinite(v)));
  }

  // Render combined data into charts (with MA and summary)
  function renderFromData(raw) {
    const arr = normalizeInput(raw);
    if (!arr.length) {
      status('No data found in the provided JSON.');
      return;
    }

    // build time-sorted entries with common aliases
    const entries = arr.map((it) => {
      const ts = it.timestamp ?? it.time ?? it.t ?? it.date ?? it.datetime ?? it.ts;
      return {
        date: parseTimestamp(ts),
        temperature: extractNumber(it, ['temperature', 'temp', 't']),
        humidity: extractNumber(it, ['humidity', 'hum', 'h']),
        pressure: extractNumber(it, ['pressure', 'pres', 'p']),
        pm2_5: extractNumber(it, ['pm2_5', 'pm2.5', 'pm25', 'pm_2_5', 'pm2']),
        pm10: extractNumber(it, ['pm10', 'pm_10']),
        pm1_0: extractNumber(it, ['pm1_0', 'pm1.0', 'pm1']),
        co2: extractNumber(it, ['co2', 'co_2', 'co2_ppm', 'co2ppm', 'co2_ppm', 'co2ppm']),
        // include tvoc_index and other common TVOC keys (tvoc_index → numeric index)
        voc: extractNumber(it, ['voc', 'tvoc', 'tvoc_index', 'tvocindex', 'voc_ppb', 'vocppb', 'sgp40_raw']) // sgp40_raw as fallback numeric sensor reading
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

    // debug summary counts
    (function logCounts() {
      function countNumeric(a){ return Array.isArray(a) ? a.filter(v => typeof v === 'number' && Number.isFinite(v)).length : 0; }
      console.info('Data summary:', {
        totalPoints: labels.length,
        temperature: countNumeric(series.temperature),
        humidity: countNumeric(series.humidity),
        pressure: countNumeric(series.pressure),
        pm2_5: countNumeric(series.pm2_5),
        pm10: countNumeric(series.pm10),
        co2: countNumeric(series.co2),
        voc: countNumeric(series.voc),
      });
    })();

    // render helper with MA
    function safeEnsureWithMA(id, labels, baseDatasets, opts = {}) {
      const hasData = hasNumericData(baseDatasets);
      if (!hasData) {
        if (charts[id]) { try { charts[id].destroy(); } catch(e){} delete charts[id]; }
        showEmptyState(id, 'No data for this metric in the provided files.');
        updateSummary(id, null);
        return;
      }
      clearEmptyState(id);
      try {
        const maWindow = opts.maWindow ?? 7;
        const maDatasets = baseDatasets.map(ds => {
          const ma = movingAverage(ds.data, maWindow);
          return {
            label: `${ds.label} — MA(${maWindow})`,
            data: ma,
            borderColor: ds.borderColor ? ds.borderColor.replace('rgb', 'rgba').replace(')', ',0.9)') : 'rgba(0,0,0,0.6)',
            borderDash: [6,4],
            backgroundColor: 'transparent',
            pointRadius: 0,
            borderWidth: 2,
          };
        });
        const datasets = baseDatasets.map(d => ({...d, fill:true, backgroundColor: d.backgroundColor ?? 'rgba(0,0,0,0.05)', borderWidth:2, pointRadius:2})).concat(maDatasets);
        ensureChart(id, labels, datasets, opts);
        const stats = summaryStats(baseDatasets[0].data);
        updateSummary(id, stats);
      } catch (err) {
        console.error('Chart render error', err);
        showEmptyState(id, 'Chart error — see console.');
        updateSummary(id, null);
      }
    }

    // create charts
    safeEnsureWithMA('chart-temp', labels, [{label:'Temperature (°C)', data: series.temperature, borderColor:'rgb(255,99,132)', backgroundColor:'rgba(255,99,132,0.12)'}], {yLabel:'°C', maWindow:7});
    safeEnsureWithMA('chart-pm', labels, [
      {label:'PM2.5 (µg/m³)', data: series.pm2_5, borderColor:'rgb(54,162,235)', backgroundColor:'rgba(54,162,235,0.12)'},
      {label:'PM10 (µg/m³)', data: series.pm10, borderColor:'rgb(75,192,192)', backgroundColor:'rgba(75,192,192,0.10)'}
    ], {yLabel:'µg/m³', maWindow:9});
    safeEnsureWithMA('chart-hum', labels, [{label:'Humidity (%)', data: series.humidity, borderColor:'rgb(153,102,255)', backgroundColor:'rgba(153,102,255,0.10)'}], {yLabel:'%'} );
    safeEnsureWithMA('chart-pres', labels, [{label:'Pressure (hPa)', data: series.pressure, borderColor:'rgb(255,159,64)', backgroundColor:'rgba(255,159,64,0.08)'}], {yLabel:'hPa'} );
    safeEnsureWithMA('chart-co2', labels, [{label:'CO₂ (ppm)', data: series.co2, borderColor:'rgb(201,203,207)', backgroundColor:'rgba(201,203,207,0.10)'}], {yLabel:'ppm'} );
    // TVOC: many devices report a unitless/index value as "tvoc_index" — label accordingly
    safeEnsureWithMA('chart-voc', labels, [{label:'TVOC (index)', data: series.voc, borderColor:'rgb(255,205,86)', backgroundColor:'rgba(255,205,86,0.10)'}], {yLabel:'index'} );

    status('Charts rendered. See console for data summary.');
  }

  // Auto-load local voc.json and data_without_voc.json, merge readings, then render
  (async function autoLoadLocalFiles() {
    const localFiles = ['./voc.json', './data_without_voc.json'];
    status('Loading local data files...');
    const combined = [];
    for (const f of localFiles) {
      status(`Fetching ${f} ...`);
      try {
        const res = await fetch(f, { cache: 'no-store' });
        if (!res.ok) {
          console.warn('fetch failed for', f, res.status);
          continue;
        }
        const parsed = await res.json();
        const arr = normalizeInput(parsed);
        if (Array.isArray(arr) && arr.length) {
          combined.push(...arr);
          continue;
        }
        if (Array.isArray(parsed) && parsed.length) {
          combined.push(...parsed);
          continue;
        }
        console.info('No array found in', f);
      } catch (err) {
        console.warn('Error fetching/parsing', f, err);
      }
    }

    if (!combined.length) {
      status('No local data found. Ensure voc.json and data_without_voc.json are next to this page.');
      return;
    }

    renderFromData(combined);
    status('Loaded local data (voc + non-voc).');
  })();

})();
