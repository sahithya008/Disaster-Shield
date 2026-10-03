# 🌍 Disaster Shield

AI-driven real-time climate risk analysis platform for detecting flood and heatwave threats using live weather intelligence.

![Python](https://img.shields.io/badge/Python-3.10+-blue)
![Flask](https://img.shields.io/badge/Flask-Backend-black)
![License](https://img.shields.io/badge/License-MIT-green)
![Status](https://img.shields.io/badge/Status-Active-success)

---

# 🚀 Live Demo

🌐 https://disaster-shield.onrender.com

---

# 📌 Overview

Disaster Shield is a lightweight climate intelligence platform that combines:

- 🌦 Real-time weather monitoring
- ⚠ Flood and heatwave risk analysis
- 🤖 AI-powered climate awareness chatbot
- 📊 Modern analytics dashboard
- 🌍 Location-based weather insights

Users can enter:

- City
- State
- Country

and instantly receive:

- Live weather data
- Flood risk score
- Heatwave risk score
- Climate alerts
- Safety guidance

---

# ✨ Features

## 🌦 Real-Time Weather Monitoring

Disaster Shield fetches live weather data using the OpenWeatherMap API and displays:

- Temperature
- Humidity
- Rainfall
- Wind Speed

---

## ⚠ Climate Risk Analysis

The backend computes:

### Flood Risk

Based on:

- Rainfall
- Humidity
- Wind speed

### Heatwave Risk

Based on:

- Temperature
- Humidity

---

## 🚨 Smart Alert System

The platform automatically generates alerts such as:

- ⚠ Flood Risk Detected
- ☀ Heatwave Risk Detected
- ✅ No major climate risks detected

---

## 🤖 ClimateBot AI Assistant

Disaster Shield includes an integrated AI chatbot that provides:

- Flood awareness
- Heatwave precautions
- Cyclone safety guidance
- Climate change information
- Disaster preparedness suggestions

The chatbot is lightweight and rule-based.

---

# 🖥 Frontend

Built using:

- HTML5
- CSS3
- Vanilla JavaScript

Frontend features:

- Glassmorphism UI
- Responsive design
- Animated result cards
- Interactive chatbot widget
- Live climate analysis

---

# ⚙ Backend

Powered by:

- Python
- Flask
- Flask-CORS

Backend responsibilities:

- Weather API communication
- Risk calculations
- Climate alert generation
- Chatbot API responses
- Frontend serving

---

# 🧠 Tech Stack

| Technology         | Purpose              |
| ------------------ | -------------------- |
| Python             | Backend logic        |
| Flask              | API server           |
| Flask-CORS         | Cross-origin support |
| HTML/CSS/JS        | Frontend             |
| OpenWeatherMap API | Live weather data    |
| Render             | Deployment           |

---

## Architecture

Frontend (HTML/CSS/JavaScript)
      ↓
Flask Backend
      ↓
OpenWeatherMap API
      ↓
Risk Analysis Engine
      ↓
Climate Alerts & Chatbot

---

# 📂 Project Structure

```bash
Disaster-Shield/
├── AI-chatbot/
│   └── chatbot.py
│
├── backend/
│   └── alertsystem.py
│
├── Frontend/
│   ├── index.html
│   ├── chatbot.js
│   ├── script.js
│   ├── style.css
│   │
│   └── Analysis/
│       ├── analysis.html
│       ├── analysis.css
│       └── analysis.js
│
├── CONTRIBUTING.md
├── LICENSE
├── README.md
└── requirements.txt
```

---

# 🛠 Installation Guide

## ⭐ Star the Repository

## Prerequisites

Make sure you have the following installed before setup:

- Python 3.10 or later
- pip
- Git
- A free OpenWeatherMap API key

## 1️⃣ Clone Repository

```bash
git clone https://github.com/thetechguardians/Disaster-Shield.git
cd Disaster-Shield
```

---

## 2️⃣ Create Virtual Environment

### Windows

```bash
python -m venv venv
venv\Scripts\activate
```

### Linux / macOS

```bash
python3 -m venv venv
source venv/bin/activate
```

---

## 3️⃣ Install Dependencies

Install all backend dependencies from `requirements.txt`:

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```
> **Note:** Also install python-dotenv:
> ```bash
> pip install python-dotenv
> ```

This installs Flask, Flask-CORS, Requests, python-dotenv, and Gunicorn.

---

## 4️⃣ Configure Environment Variables

Create a `.env` file in the root directory:

```env
OPENWEATHER_API_KEY=your_api_key_here
FLASK_SECRET_KEY=generate_a_long_random_secret
```

Get your free API key from the [OpenWeatherMap API](https://openweathermap.org/api).
Accounts use email and a password of at least 10 characters. Keep `FLASK_SECRET_KEY` private and stable; changing it logs all users out. The project `.env` already has a generated local key. For HTTPS deployments, set `SESSION_COOKIE_SECURE=true` and configure `FRONTEND_ORIGINS` to the exact frontend origins. If frontend and API are on different sites, set `SESSION_COOKIE_SAMESITE=None` as well. Existing subscriptions must be saved again after an account is created so they are attached to that account.

---

## 5️⃣ Run Backend

```bash
python backend/alertsystem.py
```

Backend runs on:

```text
http://127.0.0.1:5000
```

The Flask backend serves the frontend, so open `http://127.0.0.1:5000` and create an account or log in. Weather analysis, chatbot, subscriptions, and notification logs require a signed-in account.

---

## 6️⃣ Open Frontend

Recommended local URL:

```text
http://127.0.0.1:5000
```

If you serve the frontend separately for development, keep the Flask backend running and use an allowed local origin (including VS Code Live Server on port 5500):

```text
cd Frontend
python -m http.server 8000
```

Then open `http://127.0.0.1:8000`. Opening the HTML file directly with `file://` is not supported because account sessions require HTTP cookies.

---

# 🌐 API Endpoints

## Weather Analysis

### POST `/weather`

### Request

```json
{
  "city": "Guwahati",
  "state": "Assam",
  "country": "India"
}
```

### Response

```json
{
  "success": true,
  "weather": {
    "temperature": 29,
    "humidity": 83,
    "rainfall": 5,
    "wind_speed": 12
  },
  "risks": {
    "flood_risk": 0.62,
    "heat_risk": 0.41
  },
  "alerts": ["⚠ Flood Risk Detected"]
}
```

---

## Chatbot API

### POST `/chatbot`

### Request

```json
{
  "message": "What precautions should I take during floods?"
}
```

### Response

```json
{
  "success": true,
  "response": "You should avoid low-lying areas during floods."
}
```

---

# 🚀 Deployment on Render
> **Note:** Ensure `gunicorn` is listed in `requirements.txt` before deploying.

Deploy this project as a Render Web Service.

## Required Settings

| Setting       | Value                              |
| ------------- | ---------------------------------- |
| Runtime       | Python 3                           |
| Build Command | `pip install -r requirements.txt`  |
| Start Command | `gunicorn backend.alertsystem:app` |

`gunicorn` is required for the Render start command and is already listed in `requirements.txt`. Make sure Render installs dependencies from `requirements.txt` during the build step.

## Environment Variables

Add the following environment variable in the Render dashboard:

| Variable            | Description            |
| ------------------- | ---------------------- |
| OPENWEATHER_API_KEY | OpenWeatherMap API Key |

---

# 🔐 Environment Variables

| Variable            | Description            |
| ------------------- | ---------------------- |
| OPENWEATHER_API_KEY | OpenWeatherMap API Key |

---

# 📈 Future Improvements

- 🌧 Rain prediction forecasting
- 📍 Interactive GIS climate maps
- 📲 Telegram / Email emergency alerts
- 🛰 Satellite weather integration
- 🧠 Machine learning risk prediction
- 🌎 Multi-language support

---

# 🤝 Contributing

Contributions are welcome.

Please read:

```text
CONTRIBUTING.md
```

before submitting pull requests.

---

# 🛡 License

This project is licensed under the MIT License.

---

# 👨‍💻 Authors

Developed by Team Disaster Shield.

- [@Vikrant0207](https://github.com/Vikrant0207)

---

## 📞 Support & Community

### 🆘 Need Help?

- 💬 **Discussions**:   [GitHub Discussions](https://github.com/thetechguardians/Disaster-Shield/discussions)
- 🐛 **Bug Reports**:   [Open an Issue](https://github.com/thetechguardians/Disaster-Shield/issues)
- 📧 **Discord**:       [Join Discord Server](https://discord.gg/VH5MVsFdJF)

### 🌟 Stay Connected
- 📱 **Instagram**: [@vikrant.__07](https://www.instagram.com/vikrant.__07/)
- 💼 **LinkedIn**: [Vikrant Kumar Mehta](https://www.linkedin.com/in/vikrant-kumar-mehta)
- 🐙 **GitHub**: [@Vikrant0207](https://github.com/Vikrant0207)

---

# 🌍 Vision

Disaster Shield aims to make climate risk awareness:

- Fast
- Accessible
- Intelligent
- Easy to understand

for communities, students, researchers, and emergency responders.

---

# ⭐ Show Your Support

If this project helped you, please consider:

- ⭐ **Starring** this repository
- 🍴 **Forking** it to contribute
- 📢 **Sharing** it with others
- 💖 **Following** for more amazing projects
- 🛠 **Contribute** improvements

---
"# Disaster-Shield"

## Real IMD notifications (local setup)

The alert section now stores district subscriptions in a local SQLite database and reads official IMD district warnings, subdivision warnings, and district nowcasts. Run both backend processes in separate Command Prompt windows:

```bat
venv\Scripts\activate.bat
python backend\alertsystem.py
```

```bat
venv\Scripts\activate.bat
python backend\notification_worker.py
```

The notification worker polls every five minutes by default. Register with the [IMD API portal](https://api.imd.gov.in/public/index.php), obtain access, and fill `IMD_API_KEY` in the project `.env`. The portal's credential header format must match `IMD_API_AUTH_HEADER` and `IMD_API_AUTH_PREFIX`; defaults are `Authorization` and `Bearer`. If IMD provides an `X-API-Key` style key, set the header to `X-API-Key` and clear the prefix. The worker status is shown under the subscription form.

Dashboard warnings work once the IMD feed is authorized and the worker is running. Email requires valid SMTP settings (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`). Telegram requires `TELEGRAM_BOT_TOKEN` from BotFather. Users must start a chat with your bot and provide their Telegram chat ID. Leave a channel unchecked until its provider is configured. Email and Telegram failures are recorded in the dispatch log and retried up to five times.

After a successful location search, the Analysis page plays `backend/demo_alert.mpeg` when any modeled hazard risk is Moderate or higher (0.30+). The browser must allow audio playback. Telegram alerts remain normal, non-silent messages; recipients choose their own Telegram notification tone in the app settings.

When a new subscription has Email selected, Disaster Shield emails the first location analysis at signup and schedules another analysis every five days. The worker also sends matching official IMD warning emails as they arrive (it polls every five minutes by default). After a subscription is saved in a browser, each successful location search in that browser emails the analysis to that active subscription email, even when the searched location differs from the subscribed location. Search reports require Email to be selected and valid SMTP settings. Keep `backend/notification_worker.py` running for recurring reports and official alert delivery.

On a contact's first subscription for a district and state, Disaster Shield attempts a signup confirmation by both email and Telegram, independently of the selected channels for future warning alerts. A Telegram chat ID is required. Create a bot with Telegram's BotFather, set `TELEGRAM_BOT_TOKEN` in `.env`, start the bot from your Telegram account, and obtain your chat ID (for example, from the bot's `getUpdates` response after sending it a message). The signup remains saved if one or both providers are unavailable, and the response reports the confirmation status. Re-submitting an existing email/district/state subscription updates its preferences without sending another signup confirmation.

This is a local prototype using SQLite. Before a public deployment, use shared persistent storage for subscriptions and delivery records, verify email/Telegram ownership, add rate limiting and a real unsubscribe flow, and keep provider credentials in the host's secret manager. IMD warning severities are taken from IMD feed color codes; Disaster Shield's model-based risk scores remain separate advisories.
