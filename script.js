const form = document.getElementById("search-form");
const cityInput = document.getElementById("city");
const statusEl = document.getElementById("status");
const result = document.getElementById("result");

const placeEl = document.getElementById("place");
const summaryEl = document.getElementById("summary");
const tempEl = document.getElementById("temp");
const windEl = document.getElementById("wind");
const humidityEl = document.getElementById("humidity");
const dailyEl = document.getElementById("daily");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = cityInput.value.trim();
  if (!q) return;

  setStatus("Searching city…");
  result.classList.add("hidden");

  try {
    // 1) Geocode city → lat/lon
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`;
    const geoRes = await fetch(geoUrl);
    if (!geoRes.ok) throw new Error("Failed to find the city.");
    const geo = await geoRes.json();

    if (!geo.results || geo.results.length === 0) {
      throw new Error("City not found. Try another name.");
    }

    const g = geo.results[0];
    const { latitude, longitude, name, country, admin1 } = g;

    setStatus("Fetching weather…");

    // 2) Fetch weather (no API key needed)
    const wxUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current_weather=true&hourly=temperature_2m,relative_humidity_2m,precipitation` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`;

    const wxRes = await fetch(wxUrl);
    if (!wxRes.ok) throw new Error("Failed to fetch weather data.");
    const wx = await wxRes.json();

    // 3) Current conditions
    placeEl.textContent = [name, admin1, country].filter(Boolean).join(", ");

    const current = wx.current_weather; // { temperature, windspeed, winddirection, weathercode, time }
    if (!current) throw new Error("No current weather returned.");

    const nowTemp = Math.round(current.temperature);
    const wind = Math.round(current.windspeed);

    // Find nearest humidity hour to current.time
    let humidity = "—";
    if (wx.hourly?.time && wx.hourly?.relative_humidity_2m) {
      const times = wx.hourly.time.map((t) => new Date(t).getTime());
      const target = new Date(current.time).getTime();
      let bestIdx = 0;
      let bestDiff = Infinity;
      times.forEach((t, i) => {
        const d = Math.abs(t - target);
        if (d < bestDiff) { bestDiff = d; bestIdx = i; }
      });
      humidity = `${wx.hourly.relative_humidity_2m[bestIdx]}%`;
    }

    tempEl.textContent = `${nowTemp}°C`;
    windEl.textContent = `${wind} km/h`;
    humidityEl.textContent = humidity;
    summaryEl.textContent = humanizeWeather(current.weathercode, current.winddirection);

    // 4) Next 5 days
    dailyEl.innerHTML = "";
    const days = wx.daily?.time?.slice(0, 5) ?? [];
    const tmax = wx.daily?.temperature_2m_max?.slice(0, 5) ?? [];
    const tmin = wx.daily?.temperature_2m_min?.slice(0, 5) ?? [];
    const prcp = wx.daily?.precipitation_sum?.slice(0, 5) ?? [];

    if (days.length === 0) throw new Error("No daily forecast returned.");

    days.forEach((d, i) => {
      const el = document.createElement("div");
      el.className = "day";
      el.innerHTML = `
        <div class="date">${formatDate(d)}</div>
        <div class="range">${isNum(tmin[i]) ? Math.round(tmin[i]) : "—"}°C — ${isNum(tmax[i]) ? Math.round(tmax[i]) : "—"}°C</div>
        <div class="muted">Precip: ${isNum(prcp[i]) ? Math.round(prcp[i]) : 0} mm</div>
      `;
      dailyEl.appendChild(el);
    });

    result.classList.remove("hidden");
    setStatus("");
  } catch (err) {
    setStatus(err.message || "Something went wrong.");
    result.classList.add("hidden");
  }
});

function setStatus(msg) { statusEl.textContent = msg; }
function isNum(v) { return typeof v === "number" && !Number.isNaN(v); }

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// Minimal mapping for weather codes (Open-Meteo codes)
function humanizeWeather(code, windDir) {
  const map = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Depositing rime fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    61: "Light rain", 63: "Moderate rain", 65: "Heavy rain",
    71: "Light snow", 73: "Moderate snow", 75: "Heavy snow",
    95: "Thunderstorm", 96: "Thunderstorm + hail", 99: "Severe thunderstorm + hail",
  };
  const text = map[code] ?? "Weather";
  const dir = degToCompass(windDir);
  return `${text} • Wind ${dir}`;
}

function degToCompass(deg) {
  if (typeof deg !== "number") return "—";
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE",
                "S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}
