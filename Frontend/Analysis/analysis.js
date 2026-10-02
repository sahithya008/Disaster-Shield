const BACKEND_BASE_URL = window.location.port === "8080"
  ? `${window.location.protocol}//${window.location.hostname}:5000`
  : (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost")
    ? `${window.location.protocol}//${window.location.hostname}:5000`
    : window.location.origin;
const API_URL = `${BACKEND_BASE_URL}/weather`;

// Global map and chart variables to prevent recreation bugs
let mapInstance = null;
let weatherChartInstance = null;
let riskChartInstance = null;

// Expose active location data globally for the chatbot to access
window.activeClimateReport = null;

const descriptions = {
  flood: {
    low: "No significant flood risk. Normal conditions.",
    moderate: "Some flood potential. Avoid low-lying areas.",
    high: "Elevated flood risk. Stay away from rivers.",
    critical: "Dangerous floods. Move to higher ground immediately.",
  },
  heat: {
    low: "Comfortable temperatures. No precautions needed.",
    moderate: "Mild heat stress. Stay hydrated.",
    high: "High heat risk. Avoid outdoor exertion.",
    critical: "Extreme heat emergency. Stay indoors.",
  },
  wildfire: {
    low: "Calm conditions. No immediate fire risk.",
    moderate: "Dry conditions. Avoid open burning.",
    high: "Elevated fire risk. Be ready to evacuate.",
    critical: "Critical fire danger. Follow evacuation orders.",
  },
  cyclone: {
    low: "Stable weather. No cyclone activity.",
    moderate: "Low-level indicators. Monitor weather bulletins.",
    high: "Significant cyclone risk. Secure loose objects.",
    critical: "Severe cyclone warning. Seek sturdy shelter.",
  },
  drought: {
    low: "No strong hot and dry weather signal in the current conditions.",
    moderate: "Some hot or dry conditions. This does not establish drought.",
    high: "Hot and dry conditions detected. This is not a drought diagnosis.",
    critical: "Very hot and dry conditions detected. Follow local official advisories.",
  },
};

const cityInput = document.getElementById("city");
const suggestionsBox = document.getElementById("city-suggestions");

if (cityInput && suggestionsBox) {
  cityInput.addEventListener("input", async () => {
      console.log("Typing:", cityInput.value);

    const query = cityInput.value.trim();
const currentQuery = query;;

    if (query.length < 2) {
      suggestionsBox.innerHTML = "";
      suggestionsBox.classList.add("hidden");
      return;
    }

    try {
      const CITY_API_URL = `${BACKEND_BASE_URL}/city-suggestions`;
      const response = await fetch(
        `${CITY_API_URL}?q=${encodeURIComponent(query)}`,
        { credentials: "include" },
      );

      const cities = await response.json();
      if (cityInput.value.trim() !== currentQuery) {
  return;
}
      console.log("Cities:", cities);

     suggestionsBox.innerHTML = "";

if (cities.length === 0) {
  suggestionsBox.classList.add("hidden");
  return;
}

suggestionsBox.classList.remove("hidden");
suggestionsBox.classList.remove("hidden");
console.log("After remove:", suggestionsBox.className);
console.log(cities);
      cities.forEach((city) => {
        const item = document.createElement("div");

        item.className = "city-suggestion-item";

        item.textContent = [city.city, city.state, city.country]
  .filter(Boolean)
  .join(", ");

        item.addEventListener("click", () => {
          cityInput.value = city.city;
          document.getElementById("state").value = city.state;
          document.getElementById("country").value = city.country;

          suggestionsBox.innerHTML = "";
          suggestionsBox.classList.add("hidden");
        });

        suggestionsBox.appendChild(item);
      });
      console.log("Children:", suggestionsBox.children.length);
console.log(suggestionsBox.innerHTML);
    } catch (err) {
      console.error("Autocomplete Error:", err);
    }
  });
}

function getRiskLevel(score, riskType) {
  const type = riskType.toLowerCase();
  const d = descriptions[type] || descriptions.flood;

  if (score <= 0.29) return { label: "Low", cssClass: "low", desc: d.low };
  if (score <= 0.49)
    return { label: "Moderate", cssClass: "moderate", desc: d.moderate };
  if (score <= 0.69) return { label: "High", cssClass: "high", desc: d.high };
  return { label: "Critical", cssClass: "critical", desc: d.critical };
}
function generateRecommendations(risks) {
  const recommendations = [];

  if (risks.flood >= 0.7) {
    recommendations.push(
      "Avoid low-lying and flood-prone areas.",
      "Keep emergency supplies and important documents ready.",
    );
  }

  if (risks.heat >= 0.7) {
    recommendations.push(
      "Stay hydrated throughout the day.",
      "Avoid outdoor activities during peak heat hours.",
    );
  }

  if (risks.wildfire >= 0.7) {
    recommendations.push(
      "Avoid forested areas and open flames.",
      "Prepare for possible evacuation notices.",
    );
  }

  if (risks.cyclone >= 0.7) {
    recommendations.push(
      "Secure loose outdoor objects.",
      "Keep emergency kits and communication devices ready.",
    );
  }

  if (risks.drought >= 0.7) {
    recommendations.push(
      "Hot and dry weather detected; check local water and weather advisories.",
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "Current climate risks are low. Continue monitoring weather conditions.",
    );
  }

  return recommendations;
}


function addNotificationEntry(container, { tone = "info", label = "INFO", time = "", message = "", sourceUrl = "" }) {
  const entry = document.createElement("div");
  entry.className = `log-entry ${tone}`;
  const header = document.createElement("div");
  header.className = "log-header";
  const badge = document.createElement("span");
  badge.className = `log-badge badge-${tone}`;
  badge.textContent = label;
  const timeNode = document.createElement("span");
  timeNode.className = "log-time";
  timeNode.textContent = time ? new Date(time).toLocaleString() : "";
  header.append(badge, timeNode);
  const body = document.createElement("div");
  body.className = "log-message";
  body.textContent = message;
  entry.append(header, body);
  if (sourceUrl) {
    const source = document.createElement("a");
    source.href = sourceUrl;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    source.textContent = "Source: IMD";
    source.className = "notification-source-link";
    entry.appendChild(source);
  }
  container.appendChild(entry);
}

async function loadNotificationLogs(district = "", state = "") {
  const container = document.getElementById("dispatch-logs-box");
  if (!container) return;
  container.replaceChildren();
  try {
    const query = new URLSearchParams({ district, state });
    const [alertResponse, logResponse, statusResponse] = await Promise.all([
      fetch(`${BACKEND_BASE_URL}/api/notifications/alerts?${query}`, { credentials: "include" }),
      fetch(`${BACKEND_BASE_URL}/api/notifications/logs`, { credentials: "include" }),
      fetch(`${BACKEND_BASE_URL}/api/notifications/status`, { credentials: "include" }),
    ]);
    const alertData = await alertResponse.json();
    const logData = await logResponse.json();
    const statusData = await statusResponse.json();

    const matchingAlerts = Array.isArray(alertData.alerts) ? alertData.alerts : [];
    matchingAlerts.forEach((alert) => {
      const tone = alert.severity === "red" ? "critical" : ["orange", "yellow"].includes(alert.severity) ? "warning" : "info";
      addNotificationEntry(container, {
        tone,
        label: `OFFICIAL IMD ${(alert.severity || "unknown").toUpperCase()}`,
        time: alert.observed_at,
        message: `${alert.title} at ${alert.district}${alert.state ? `, ${alert.state}` : ""}. Issued ${alert.issue_date || "date not supplied"}${alert.valid_until ? `; valid until ${alert.valid_until}` : ""}. ${alert.details || ""}`,
        sourceUrl: alert.source_url,
      });
    });

    const districtKey = district.trim().toLowerCase();
    const stateKey = state.trim().toLowerCase();
    const deliveryLogs = Array.isArray(logData.logs) ? logData.logs : [];
    deliveryLogs.filter((item) => (!districtKey || item.district.toLowerCase() === districtKey) && (!stateKey || !item.state || item.state.toLowerCase() === stateKey)).forEach((item) => {
      const sent = item.status === "sent";
      addNotificationEntry(container, {
        tone: sent ? "success" : "warning",
        label: `${item.channel.toUpperCase()} ${sent ? "SENT" : "NOT SENT"}`,
        time: item.attempted_at,
        message: `${item.title} for ${item.district}, ${item.state}. ${sent ? "Delivery accepted by provider." : (item.detail || "Delivery attempt failed.")}`,
        sourceUrl: "",
      });
    });

    const statusLine = document.getElementById("notification-service-status");
    if (statusLine) {
      if (!statusData.imd_configured) {
        statusLine.textContent = "IMD API key is not configured in the backend .env file.";
      } else if (statusData.last_error) {
        statusLine.textContent = `IMD worker status: ${statusData.last_error}`;
      } else if (!statusData.last_poll) {
        statusLine.textContent = "IMD API is configured. Start backend/notification_worker.py to begin polling.";
      } else {
        const deliverySetup = [
          !statusData.email_configured ? "Email disabled until SMTP settings are filled in .env." : "",
          !statusData.telegram_configured ? "Telegram alerts disabled until TELEGRAM_BOT_TOKEN is set in .env." : "",
        ].filter(Boolean).join(" ");
        statusLine.textContent = `IMD feed last checked ${new Date(statusData.last_poll).toLocaleString()}. ${deliverySetup}`;
      }
    }

    if (!container.children.length) {
      const empty = document.createElement("p");
      empty.className = "notification-empty";
      empty.textContent = district
        ? `No current official alerts or delivery records for ${district}${state ? `, ${state}` : ""}.`
        : "Enter a district and state to view matching official IMD warnings.";
      container.appendChild(empty);
    }
  } catch (error) {
    const message = document.createElement("p");
    message.className = "notification-empty";
    message.textContent = "Notification service is unavailable. Start the Flask backend and notification worker.";
    container.appendChild(message);
  }
}


async function getWeatherData() {
  const city = document.getElementById("city").value.trim();
  const state = document.getElementById("state").value.trim();
  const country = document.getElementById("country").value.trim();
  const districtSubscriptionInput = document.getElementById("subscribe-district");
  const stateSubscriptionInput = document.getElementById("subscribe-state");
  if (districtSubscriptionInput && !districtSubscriptionInput.value) districtSubscriptionInput.value = city;
  if (stateSubscriptionInput && !stateSubscriptionInput.value) stateSubscriptionInput.value = state;
  const loading = document.getElementById("loading");
  const messageBox = document.getElementById("message-box");
  const results = document.getElementById("results");
  const alertBox = document.getElementById("alert-box");
  const resultStatus = document.getElementById("result-status");
  const resultSummary = document.getElementById("result-summary");
  const analyzeBtn = document.getElementById("analyze-btn");
  const demoIndicator = document.getElementById("demo-mode-indicator");

  const showMessage = (message, tone) => {
    messageBox.textContent = message;
    messageBox.classList.remove("hidden", "is-error", "is-success");
    if (tone) {
      messageBox.classList.add(tone);
    }
  };

  const hideMessage = () => {
    messageBox.textContent = "";
    messageBox.classList.add("hidden");
    messageBox.classList.remove("is-error", "is-success");
  };

  if (!city || !state || !country) {
    showMessage("Please fill all fields.", "is-error");
    return;
  }

  loading.classList.remove("hidden");
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = "Analyzing...";

  hideMessage();
  results.classList.add("hidden");
  results.classList.remove("is-visible");
  alertBox.classList.add("hidden");
  alertBox.innerHTML = "";

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        city,
        state,
        country,
      }),
    });

    const data = await response.json();
    loading.classList.add("hidden");
    analyzeBtn.disabled = false;
    analyzeBtn.innerText = "Analyze Climate Risk";

    if (!data.success) {
      showMessage(data.message || "Location not found.", "is-error");
      return;
    }

    hideMessage();
    
    if (typeof saveRecentSearch === "function") {
      saveRecentSearch(city, state, country);
    }

    // Update active report in window context
    window.activeClimateReport = data;

    // UI Text updates
    document.getElementById("location").innerText =
      `${data.location.city}, ${data.location.state}, ${data.location.country}`;
    document.getElementById("temperature").innerText =
      `${data.weather.temperature} °C`;
    document.getElementById("humidity").innerText =
      `${data.weather.humidity} %`;
    document.getElementById("rainfall").innerText =
      `${data.weather.rainfall} mm`;
    document.getElementById("wind").innerText =
      `${data.weather.wind_speed} km/h`;

    // Risks scores
    const floodCard = document.querySelector(".risk-card.flood");
    const floodScore = data.risks.flood_risk;
    document.getElementById("flood-risk").innerText = floodScore;
    let score = floodScore;
    let card = floodCard;
    let level = getRiskLevel(score, "flood");
    let labelEl = card.querySelector(".risk-label");
    labelEl.textContent = level.label;
    labelEl.className = "risk-label " + level.cssClass;
    card.querySelector(".risk-description").textContent = level.desc;

    const heatCard = document.querySelector(".risk-card.heat");
    const heatScore = data.risks.heat_risk;
    document.getElementById("heat-risk").innerText = heatScore;
    score = heatScore;
    card = heatCard;
    level = getRiskLevel(score, "heat");
    labelEl = card.querySelector(".risk-label");
    labelEl.textContent = level.label;
    labelEl.className = "risk-label " + level.cssClass;
    card.querySelector(".risk-description").textContent = level.desc;
    const wildfireCard = document.querySelector(".risk-card.wildfire");
    const wildfireScore = data.risks.wildfire_risk;
    document.getElementById("wildfire-risk").innerText = wildfireScore;
    score = wildfireScore;
    card = wildfireCard;
    level = getRiskLevel(score, "wildfire");
    labelEl = card.querySelector(".risk-label");
    labelEl.textContent = level.label;
    labelEl.className = "risk-label " + level.cssClass;
    card.querySelector(".risk-description").textContent = level.desc;

    const cycloneCard = document.querySelector(".risk-card.cyclone");
    const cycloneScore = data.risks.cyclone_risk;
    document.getElementById("cyclone-risk").innerText = cycloneScore;
    score = cycloneScore;
    card = cycloneCard;
    level = getRiskLevel(score, "cyclone");
    labelEl = card.querySelector(".risk-label");
    labelEl.textContent = level.label;
    labelEl.className = "risk-label " + level.cssClass;
    card.querySelector(".risk-description").textContent = level.desc;

    const droughtCard = document.querySelector(".risk-card.drought");
    const droughtScore = data.risks.drought_risk;
    document.getElementById("drought-risk").innerText = droughtScore;
    score = droughtScore;
    card = droughtCard;
    level = getRiskLevel(score, "drought");
    labelEl = card.querySelector(".risk-label");
    labelEl.textContent = level.label;
    labelEl.className = "risk-label " + level.cssClass;
    card.querySelector(".risk-description").textContent = level.desc;
    const recommendationsPanel = document.getElementById(
      "recommendations-panel",
    );

    const recommendationsList = document.getElementById("recommendations-list");

    const recommendations = generateRecommendations({
      flood: floodScore,
      heat: heatScore,
      wildfire: wildfireScore,
      cyclone: cycloneScore,
      drought: droughtScore,
    });

    recommendationsList.innerHTML = recommendations
      .map((item) => `<li>✅ ${item}</li>`)
      .join("");

    recommendationsPanel.classList.remove("hidden");

    // Store last analysis result so Disaster Shield Assistant can use it
    window.lastAnalysisContext = {
      location: {
        city: city,
        state: state,
        country: country,
      },
      weather: {
        temperature: data.weather.temperature,
        humidity: data.weather.humidity,
        rainfall: data.weather.rainfall,
        wind_speed: data.weather.wind_speed,
      },
      risks: {
        flood_risk: data.risks.flood_risk,
        heat_risk: data.risks.heat_risk,
        wildfire_risk: data.risks.wildfire_risk,
        cyclone_risk: data.risks.cyclone_risk,
        drought_risk: data.risks.drought_risk,
      },
      alerts: Array.isArray(data.alerts) ? data.alerts : [],
      forecast_summary: data.forecast_summary || "",
      forecast: Array.isArray(data.forecast) ? data.forecast : [],
    };

    // Update chatbot context badge if it exists
    const badge = document.getElementById("chatbot-context-badge");
    if (badge) {
      badge.textContent = "📍 " + city + ", " + state;
      badge.style.display = "inline-block";
    }


    // Demo indicator
    if (data.demo_mode) {
      demoIndicator.classList.remove("hidden");
    } else {
      demoIndicator.classList.add("hidden");
    }

    // Render Alerts
    let alertsHTML = "";
    data.alerts.forEach((alertMessage) => {
      let badgeClass = alertMessage.includes("✅")
        ? "alert-warning"
        : "alert-danger";
      alertsHTML += `<div class="alert-box ${badgeClass}">${alertMessage}</div>`;
    });
    alertBox.innerHTML = alertsHTML;
    alertBox.classList.remove("hidden");

    // Render Leaflet Map
    const lat = data.location.latitude;
    const lon = data.location.longitude;

    if (!mapInstance) {
      mapInstance = L.map("map").setView([lat, lon], 10);

      // Theme-aware tile layers
      const darkTile  = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
      const lightTile = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      let tileLayer = L.tileLayer(
        currentTheme === 'light' ? lightTile : darkTile,
        { attribution: '© OpenStreetMap © CARTO', maxZoom: 19 }
      ).addTo(mapInstance);

      // Swap tile layer when theme changes
      window.addEventListener('themechange', function (e) {
        tileLayer.remove();
        tileLayer = L.tileLayer(
          e.detail.theme === 'light' ? lightTile : darkTile,
          { attribution: '© OpenStreetMap © CARTO', maxZoom: 19 }
        ).addTo(mapInstance);
      });
    } else {
      mapInstance.setView([lat, lon], 10);
      // Clear old layers (except the base tile layer)
      mapInstance.eachLayer((layer) => {
        if (layer instanceof L.Marker || layer instanceof L.Circle) {
          mapInstance.removeLayer(layer);
        }
      });
    }

    // Draw a circle centered around the risk scale
    const maxRisk = Math.max(
      data.risks.flood_risk,
      data.risks.heat_risk,
      data.risks.wildfire_risk,
      data.risks.cyclone_risk,
      data.risks.drought_risk,
    );
    let circleColor = "#22c55e"; // green (safe)
    if (maxRisk >= 0.7) {
      circleColor = "#ef4444"; // red (danger)
    } else if (maxRisk >= 0.5) {
      circleColor = "#f59e0b"; // orange (warning)
    }

    L.circle([lat, lon], {
      color: circleColor,
      fillColor: circleColor,
      fillOpacity: 0.15,
      radius: 10000, // 10km radius
    }).addTo(mapInstance);

    const mapMarker = L.marker([lat, lon]).addTo(mapInstance);
    mapMarker
      .bindPopup(
        `
            <div style="min-width: 160px; font-family: sans-serif;">
                <h4 style="margin: 0 0 5px 0; color: #fff;">${data.location.city}</h4>
                <p style="margin: 0; font-size: 0.8rem; line-height: 1.4; color: #cbd5e1;">
                    🌡️ Temp: ${data.weather.temperature} °C<br>
                    🌊 Flood Risk: ${data.risks.flood_risk}<br>
                    🔥 Heat Risk: ${data.risks.heat_risk}<br>
                    🌲 Wildfire: ${data.risks.wildfire_risk}<br>
                    🌀 Cyclone: ${data.risks.cyclone_risk}
                </p>
            </div>
        `,
      )
      mapInstance.once("moveend", () => {
        mapMarker.openPopup();
      });

    // Render 7-Day Forecast
    const forecastContainer = document.getElementById(
      "forecast-cards-container",
    );
    forecastContainer.innerHTML = "";
    const forecastSummary = document.getElementById("forecast-summary");
    if (forecastSummary) forecastSummary.textContent = data.forecast_summary || "7-day forecast summary is unavailable.";

    data.forecast.forEach((day) => {
      const dateObj = new Date(`${day.date}T12:00:00`);
      const formattedDate = dateObj.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });

      const maxDayRisk = Math.max(
        day.risks.flood_risk,
        day.risks.heat_risk,
        day.risks.wildfire_risk,
        day.risks.cyclone_risk,
        day.risks.drought_risk,
      );
      const isDanger = maxDayRisk >= 0.65;
      const alertTag = isDanger ? "⚠️ High Hazard" : "✅ Normal";
      const riskMap = {
        Flood: day.risks.flood_risk,
        Heat: day.risks.heat_risk,
        Wildfire: day.risks.wildfire_risk,
        Cyclone: day.risks.cyclone_risk,
        "Hot & dry": day.risks.drought_risk,
      };

      const sortedRisks = Object.entries(riskMap).sort((a, b) => b[1] - a[1]);

      const primaryRisk = sortedRisks[0];
      const secondaryRisk = sortedRisks[1];

      const primaryCause = primaryRisk[0];
      const primaryScore = primaryRisk[1];

      const card = document.createElement("div");
      card.className = "forecast-card";
      card.innerHTML = `
    <div class="forecast-date">${formattedDate}</div>
    <div class="forecast-temp">${day.temperature_min}-${day.temperature_max} &#176;C</div>
    <div class="forecast-condition">${day.condition || "Daily outlook"}</div>

    <div class="forecast-details">
        <span>💧 Humid: ${day.humidity}%</span>
        <span>Rain: ${day.rainfall} mm; rain chance: ${day.rain_probability ?? "unknown"}%</span>
        <span>🌪 Wind: ${day.wind_speed} km/h</span>
    </div>

    <div class="forecast-risk-indicator ${isDanger ? "has-danger" : ""}">
        ${alertTag}
    </div>

    <div class="forecast-primary-cause">
        Primary Cause: ${primaryCause} Risk (${primaryScore.toFixed(2)})
    </div>

    <div class="forecast-secondary-cause">
        Also: ${secondaryRisk[0]} Risk (${secondaryRisk[1].toFixed(2)})
    </div>
`;
      forecastContainer.appendChild(card);
    });

    // Initialize / Update Charts
    const forecastLabels = data.forecast.map((day) => {
      const dateObj = new Date(`${day.date}T12:00:00`);
      return dateObj.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    });

    // Weather Chart (Temp Line, Rain Bar)
    if (weatherChartInstance) {
      weatherChartInstance.destroy();
    }
    const ctx1 = document.getElementById("weatherChart").getContext("2d");
    weatherChartInstance = new Chart(ctx1, {
      type: "bar",
      data: {
        labels: forecastLabels,
        datasets: [
          {
            label: "Rainfall (mm)",
            data: data.forecast.map((day) => day.rainfall),
            backgroundColor: "rgba(56, 189, 248, 0.4)",
            borderColor: "#38bdf8",
            borderWidth: 1,
            yAxisID: "yRain",
          },
          {
            label: "Mean temperature (\u00b0C)",
            data: data.forecast.map((day) => day.temperature),
            type: "line",
            borderColor: "#ef4444",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            tension: 0.35,
            fill: false,
            yAxisID: "yTemp",
          },
          {
            label: "Daily high (\u00b0C)",
            data: data.forecast.map((day) => day.temperature_max),
            type: "line",
            borderColor: "#fb923c",
            borderDash: [5, 4],
            pointRadius: 2,
            tension: 0.3,
            yAxisID: "yTemp",
          },
          {
            label: "Daily low (\u00b0C)",
            data: data.forecast.map((day) => day.temperature_min),
            type: "line",
            borderColor: "#60a5fa",
            borderDash: [5, 4],
            pointRadius: 2,
            tension: 0.3,
            yAxisID: "yTemp",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#cbd5e1" } },
        },
        scales: {
          x: {
            grid: { color: "rgba(255,255,255,0.05)" },
            ticks: { color: "#94a3b8" },
          },
          yTemp: {
            type: "linear",
            position: "left",
            ticks: { color: "#ef4444" },
            grid: { color: "rgba(255,255,255,0.05)" },
          },
          yRain: {
            type: "linear",
            position: "right",
            ticks: { color: "#38bdf8" },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });

    // Multi-Risk Index Trends Chart
    if (riskChartInstance) {
      riskChartInstance.destroy();
    }
    const ctx2 = document.getElementById("riskChart").getContext("2d");
    riskChartInstance = new Chart(ctx2, {
      type: "line",
      data: {
        labels: forecastLabels,
        datasets: [
          {
            label: "Flood",
            data: data.forecast.map((day) => day.risks.flood_risk),
            borderColor: "#ef4444",
            tension: 0.3,
            fill: false,
          },
          {
            label: "Heat",
            data: data.forecast.map((day) => day.risks.heat_risk),
            borderColor: "#f59e0b",
            tension: 0.3,
            fill: false,
          },
          {
            label: "Wildfire",
            data: data.forecast.map((day) => day.risks.wildfire_risk),
            borderColor: "#f97316",
            tension: 0.3,
            fill: false,
          },
          {
            label: "Cyclone",
            data: data.forecast.map((day) => day.risks.cyclone_risk),
            borderColor: "#a855f7",
            tension: 0.3,
            fill: false,
          },
          {
            label: "Hot & dry conditions",
            data: data.forecast.map((day) => day.risks.drought_risk),
            borderColor: "#eab308",
            tension: 0.3,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#cbd5e1" } },
        },
        scales: {
          x: {
            grid: { color: "rgba(255,255,255,0.05)" },
            ticks: { color: "#94a3b8" },
          },
          y: {
            min: 0,
            max: 1.0,
            ticks: { color: "#94a3b8" },
            grid: { color: "rgba(255,255,255,0.05)" },
          },
        },
      },
    });

    // Load official IMD alerts and real provider delivery attempts.
    await loadNotificationLogs(city, state);

    // Results Card animation
    results.classList.remove("hidden");
    requestAnimationFrame(() => {
      results.classList.add("is-visible");
      // Force Leaflet sizing correction since it was initialized in a hidden div
      setTimeout(() => {
        if (mapInstance) {
          mapInstance.invalidateSize();
        }
      }, 150);
    });

    resultStatus.innerText = "Climate analysis completed";
    resultSummary.innerText =
      "Live weather and risk analysis generated successfully.";
  } catch (error) {
    console.error(error);
    loading.classList.add("hidden");
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = "Analyze Climate Risk";

    showMessage("Backend server is not running.", "is-error");
  }
}

function clearResults() {
  document.getElementById("city").value = "";
  document.getElementById("state").value = "";
  document.getElementById("country").value = "";
  document.getElementById("results").classList.add("hidden");
  document.getElementById("alert-box").classList.add("hidden");
  document.getElementById("message-box").classList.add("hidden");
}

// Save a real district subscription in the backend.
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("subscribe-form");
  const notice = document.getElementById("subscribe-success");
  const districtInput = document.getElementById("subscribe-district");
  const stateInput = document.getElementById("subscribe-state");
  const telegramInput = document.getElementById("subscribe-telegram-chat-id");
  const telegramOption = form?.querySelector('input[name="notification-channel"][value="telegram"]');
  if (telegramInput && telegramOption) {
    const syncTelegramRequirement = () => { telegramInput.required = telegramOption.checked; };
    telegramOption.addEventListener("change", syncTelegramRequirement);
    syncTelegramRequirement();
  }
  const previousDistrict = document.getElementById("city")?.value;
  const previousState = document.getElementById("state")?.value;
  if (previousDistrict && districtInput && !districtInput.value) districtInput.value = previousDistrict;
  if (previousState && stateInput && !stateInput.value) stateInput.value = previousState;

  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const channels = [...form.querySelectorAll('input[name="notification-channel"]:checked')].map((input) => input.value);
      const payload = {
        email: document.getElementById("subscribe-email").value.trim(),
        telegram_chat_id: document.getElementById("subscribe-telegram-chat-id").value.trim(),
        district: districtInput.value.trim(),
        state: stateInput.value.trim(),
        categories: [document.getElementById("subscribe-type").value],
        channels,
        consent: document.getElementById("subscribe-consent").checked,
      };
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      notice.classList.remove("hidden");
      notice.textContent = "Saving subscription...";
      try {
        const response = await fetch(`${BACKEND_BASE_URL}/api/notifications/subscribe`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || "Subscription could not be saved.");
        notice.textContent = result.message;
        await loadNotificationLogs(payload.district, payload.state);
      } catch (error) {
        notice.textContent = error.message || "Notification service is unavailable.";
      } finally {
        button.disabled = false;
      }
    });
  }

  loadNotificationLogs(districtInput?.value || "", stateInput?.value || "");
  window.setInterval(() => {
    loadNotificationLogs(districtInput?.value || "", stateInput?.value || "");
  }, 60000);
});

window.useCurrentLocation = async function () {
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by your browser.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async function (position) {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      try {
        const reverseGeocodeUrl = `${BACKEND_BASE_URL}/reverse-geocode`;

        const response = await fetch(reverseGeocodeUrl, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            latitude: latitude,
            longitude: longitude,
          }),
        });

        const data = await response.json();

        if (!data.success) {
          alert(data.message || "Unable to detect location.");
          return;
        }

        document.getElementById("city").value = data.city || "";
        document.getElementById("state").value = data.state || "";
        document.getElementById("country").value = data.country || "";

        getWeatherData();
      } catch (error) {
        console.error(error);
        alert("Unable to detect location.");
      }
    },
    function () {
      alert("Location permission denied.");
    }
  );
};

document.addEventListener("DOMContentLoaded", () => {
    // Typewriter effect
    const typingTextElement = document.getElementById("hero-typing-text");
    if (typingTextElement) {
        const textToType = "Check flood and heat risk for any location in seconds.";
        let i = 0;
        
        typingTextElement.innerHTML = '<span id="typing-content"></span><span class="typewriter-cursor"></span>';
        const contentSpan = document.getElementById("typing-content");

        function typeWriter() {
            if (i < textToType.length) {
                contentSpan.innerHTML += textToType.charAt(i);
                i++;
                setTimeout(typeWriter, 40);
            } else {
                setTimeout(() => {
                    const cursor = document.querySelector('.typewriter-cursor');
                    if(cursor) cursor.style.display = 'none';
                }, 3000);
            }
        }
        
        setTimeout(typeWriter, 400);
    }

    const toggleBtn = document.getElementById("toggle-history-btn");
    const wrapper = document.getElementById("recent-search-wrapper");
    const clearBtn = document.getElementById("clear-history-btn");

    if (toggleBtn && wrapper) {
      toggleBtn.addEventListener("click", () => {
        wrapper.classList.toggle("show-history");
        if (wrapper.classList.contains("show-history")) {
          toggleBtn.innerText = "Recent Searches ▲";
        } else {
          toggleBtn.innerText = "Recent Searches ▼";
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        localStorage.removeItem(recentSearchStorageKey());
        if (typeof displayRecentSearches === "function") {
            displayRecentSearches();
        }
      });
    }

    // Image carousel effect for analysis.html
    const carouselImages = document.querySelectorAll(".hero-image-carousel .carousel-img");
    if (carouselImages.length > 0) {
        let currentImageIndex = 0;
        
        setInterval(() => {
            carouselImages[currentImageIndex].classList.remove("active");
            currentImageIndex = (currentImageIndex + 1) % carouselImages.length;
            carouselImages[currentImageIndex].classList.add("active");
        }, 5000);
    }

    // Default India Chart
    if (typeof fetchAndRenderChart === 'function') {
        fetchAndRenderChart(20.5937, 78.9629);
    }
});

const scrollTopBtn = document.getElementById("scrollTopBtn");

if (scrollTopBtn) {
  window.addEventListener("scroll", () => {
    if (window.scrollY > 300) {
      scrollTopBtn.classList.add("show");
    } else {
      scrollTopBtn.classList.remove("show");
    }
  });

  scrollTopBtn.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  });
}

let temperatureChartInstance = null;

async function fetchAndRenderChart(lat, lon) {
    const chartUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
    try {
        const res = await fetch(chartUrl);
        const data = await res.json();
        
        // Populate default current weather if the fields are empty
        if (data.current) {
            const tempEl = document.getElementById('temperature');
            if (tempEl && (!tempEl.innerText || tempEl.innerText.trim() === "")) {
                tempEl.innerText = `${data.current.temperature_2m} °C`;
                document.getElementById('humidity').innerText = `${data.current.relative_humidity_2m} %`;
                document.getElementById('rainfall').innerText = `${data.current.precipitation} mm`;
                document.getElementById('wind').innerText = `${data.current.wind_speed_10m} km/h`;
                document.getElementById('location').innerText = 'Overall India (Default)';
                
                // Mock default risk for India (could calculate it based on above data)
                document.getElementById('flood-risk').innerText = '0.12';
                document.getElementById('heat-risk').innerText = '0.85';
            }
        }

        const dates = data.daily.time.map(d => {
            const date = new Date(d);
            return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        });
        const maxTemps = data.daily.temperature_2m_max;
        const minTemps = data.daily.temperature_2m_min;

        const ctx = document.getElementById('temperatureChart');
        if (!ctx) return;

        if (temperatureChartInstance) {
            temperatureChartInstance.destroy();
        }

        Chart.defaults.color = 'rgba(255, 255, 255, 0.7)';
        Chart.defaults.font.family = "'Poppins', sans-serif";

        temperatureChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [
                    {
                        label: 'Max Temp (°C)',
                        data: maxTemps,
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        borderWidth: 3,
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Min Temp (°C)',
                        data: minTemps,
                        borderColor: '#3b82f6',
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        tension: 0.4,
                        borderDash: [5, 5]
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    }
                },
                scales: {
                    y: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                }
            }
        });
    } catch (err) {
        console.error("Error fetching chart data:", err);
    }

function getRecentSearches() {
  return JSON.parse(localStorage.getItem(recentSearchStorageKey())) || [];
}

function recentSearchStorageKey() {
  return `recentSearches_${localStorage.getItem("disasterShieldUserId") || "guest"}`;
}

function saveRecentSearch(city, state, country) {
  if (!city || !state || !country) return;

  const newSearch = {
    city,
    state,
    country,
  };

  let searches = getRecentSearches();

  searches = searches.filter(
    (search) =>
      !(
        search.city.toLowerCase() === city.toLowerCase() &&
        search.state.toLowerCase() === state.toLowerCase() &&
        search.country.toLowerCase() === country.toLowerCase()
      ),
  );

  searches.unshift(newSearch);
  searches = searches.slice(0, 5);

  localStorage.setItem(recentSearchStorageKey(), JSON.stringify(searches));

  displayRecentSearches();
}

function displayRecentSearches() {
  const container = document.getElementById("recent-search-list");

  if (!container) return;

  container.innerHTML = "";

  const searches = getRecentSearches();

  searches.forEach((search) => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "search-chip";
    button.innerText = search.city;

    button.addEventListener("click", () => {
      document.getElementById("city").value = search.city;
      document.getElementById("state").value = search.state;
      document.getElementById("country").value = search.country;

      getWeatherData();
    });

    container.appendChild(button);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  displayRecentSearches();

  const toggleBtn = document.getElementById("toggle-history-btn");
  const wrapper = document.getElementById("recent-search-wrapper");
  const clearBtn = document.getElementById("clear-history-btn");
  
  if (toggleBtn && wrapper) {
    toggleBtn.addEventListener("click", () => {
      wrapper.classList.toggle("show-history");

      if (wrapper.classList.contains("show-history")) {
        toggleBtn.innerText = "Recent Searches ▲";
      } else {
        toggleBtn.innerText = "Recent Searches ▼";
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      localStorage.removeItem(recentSearchStorageKey());
      displayRecentSearches();
    });
  }
});
}

// Theme toggle logic is handled globally by theme.js
