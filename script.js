// Read file upload
document.getElementById("data-upload").addEventListener("change", function () {
  const file = this.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => loadJSON(JSON.parse(e.target.result));
  reader.readAsText(file);
});

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
