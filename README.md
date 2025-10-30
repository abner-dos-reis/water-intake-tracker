# 💧 Water Intake Tracker

**Built with**: AI for syntax | Human for logic | Learning clean, scalable code  
All repos public to show my evolution as a developer 📈

---

A modern and elegant web application to track your daily water intake with real-time progress visualization and persistent data storage.

<p align="center">
  <img src="./water.png" alt="Water Intake Tracker" />
</p>

## 📸 Screenshots

### Main Interface
![Main Interface](./screenshots/main-interface.png)
*Clean and intuitive interface with circular progress indicator and quick-add buttons*

### Goal Celebration
![Goal Celebration](./screenshots/goal-celebration.png)
*Animated celebration with confetti when you reach your daily water intake goal*

### Custom Amounts
![Custom Amounts](./screenshots/custom-amounts.png)
*Flexible portion selection with various container types and custom amounts*

## 🌟 Features

- **💧 Smart Water Tracking**: Log water intake with predefined portions (500ml cup, 800ml bottle) or custom amounts
- **📊 Real-time Progress**: Beautiful circular progress indicator showing your daily intake percentage
- **🎯 Customizable Goals**: Set and edit your daily water intake target (default: 2000ml)
- **🎉 Goal Celebrations**: Animated celebration with confetti when you reach your daily goal
- **⏰ Automatic Reset**: Daily progress resets automatically at midnight
- **💾 Persistent Storage**: All data is saved to PostgreSQL database with localStorage fallback
- **📱 Responsive Design**: Modern dark theme interface that works on all devices
 - **🔔 Reliable Notifications**: Desktop and system notifications with host-level playback (works even when browser is closed)

## 🚀 Quick Start

### Prerequisites
- **For Local Development**: Node.js 18+ and npm
- **For Obsidian Integration**: Docker and Docker Compose

### Running the Application

#### Option 1: Local Development (npm)
```bash
# Clone this repository
git clone https://github.com/abner-dos-reis/water-intake-tracker.git
cd water-intake-tracker

# Install dependencies
npm install

# Start the application
npm run dev
```

Access: http://localhost:5173

#### Option 2: Docker (For Obsidian Integration)
```bash
# Clone this repository
git clone https://github.com/abner-dos-reis/water-intake-tracker.git
cd water-intake-tracker

# Start with Docker
docker compose up --build -d
```

Access: 
- **Web App**: http://localhost:5173
- **API**: http://localhost:4000

### 🤔 Why Docker?

The main purpose of using **Docker** in this project is to enable **direct integration with Obsidian** through the **Web Browser Viewer** (and also **[Custom Frames](https://obsidian.md/plugins?id=obsidian-custom-frames)** plugin).

With Docker, the app runs as a local web service, which allows:

- **Seamless Obsidian integration**: The tracker opens inside Obsidian as if it were part of the note, without relying on external services.  
- **Isolated and standardized environment**: Prevents dependency conflicts on your system.  
- **Easy access**: Runs on **localhost** by default, but can also be opened on your home network or restricted to specific IPs.  
- **Always available**: The container ensures the app runs continuously without manual startup each time.  

👉 In short: **Docker makes it possible to use this app as a water intake tracker fully integrated with Obsidian**, accessible via the **Web Browser Viewer** + **Custom Frames** plugin and ready to use across multiple devices.


### 🌐 Network Configuration

**Default (Localhost Only)**:
```yaml
ports:
  - "127.0.0.1:5173:5173"  # Only accessible from this computer
```

**Open to Network** (edit `docker-compose.yml`):
```yaml
ports:
  - "0.0.0.0:5173:5173"    # Accessible from any device on network
```

**Restrict to Specific IPs**:
```yaml
ports:
  - "192.168.1.100:5173:5173"  # Only accessible from specific IP
```

## 🏗️ Architecture

The application follows a modern three-tier architecture:

```text
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ React Frontend  │    │ Express Backend │    │  PostgreSQL DB  │
│   (Port 5173)   │◄──►│   (Port 4000)   │◄──►│   (Port 5432)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Frontend (React + Vite)
- Modern React 19 with hooks
- Vite for fast development and building
- CSS3 animations and responsive design
- Progressive enhancement with localStorage fallback

## 🔔 Notification System (Host + Browser)

This project includes a robust notification system to remind you to drink water. It uses a small host-side notifier to show native OS notifications and play an audio file even when the browser is closed.

How it works
- Frontend: schedules hourly reminders (every 60 minutes) while the web app is open. When it needs to notify, it attempts a real-time signal to the backend (`persist:false`). If the host notifier is available it will play the system sound; otherwise the frontend will play a fallback sound.
- Backend: accepts notification requests and can either emit a Postgres NOTIFY with a JSON payload (real-time, `persist:false`) or persist a durable pending notification row (for hosts currently offline). It exposes endpoints for queueing, consuming, and acknowledging notifications.
- Host-notifier: a small Node script (`tools/host-notifier/notifier.js`) that LISTENs to Postgres `notifications` and also polls the backend periodically as a backup. It plays the configured `SOUND_PATH` via `mpg123` and POSTs an ack so the frontend won't play a duplicate sound.

Key endpoints
- `POST /api/notifications` — send a notification. Use `persist:false` in the JSON body to signal real-time delivery to host-notifier (no row persisted). Example payload: `{"user_id":"default","title":"Time To Drink Water","message":"Recommendation: 300ml","persist":false}`.
- `GET /api/notifications/pending` — host-notifier fetches and consumes pending notifications.
- `POST /api/notifications/ack` — host-notifier posts here after playing sound (used by frontend to avoid fallback playback).
- `GET /api/notifications/last-ack` — frontend polls this to check if host played the notification.

Server-side scheduling (new)

To make scheduling consistent whether the app is open or closed, the backend now centralizes the next-notify logic. Important notes:

- `POST /api/intake` records water intake and also records a `last_drink` timestamp on the backend. This endpoint will emit a NOTIFY so host-notifier can reschedule immediately.
- `GET /api/last-drink?user_id=...` returns the timestamp of the most recent drink.
- `GET /api/next-notify?user_id=...` computes the next notification timestamp according to the following rules:
  - If the user already reached their daily target, `next` is null (no more notifications).
  - If the user drank after the last notification ack, the next notify is exactly 60 minutes after that drink.
  - Otherwise, the next notify is 60 minutes after the last ack (or 60 minutes from now if none exists).
  - If the computed next time falls between 00:00 and 00:59, it is moved to 01:00 (no notifications between midnight and 01:00).

Host-notifier behavior

- On startup and whenever it receives a `last_drink` NOTIFY, the host-notifier now calls `GET /api/next-notify` and schedules the next system notification exactly at that timestamp. This guarantees that, even if the browser is closed, the next reminder will fire 60 minutes after the user's last drink (unless the target is already reached).
- The host-notifier still performs periodic polling (`POLL_MINUTES`) as a backup, and includes dedupe protections to avoid repeated plays.

Quick test commands

- Register a drink (simulate user drinking):

```sh
curl -s -X POST http://localhost:4000/api/intake \
  -H "Content-Type: application/json" \
  -d '{"user_id":"default","date":"'$(date +%F)'","amount":300}'
```

- Ask backend when the next notification should be:

```sh
curl -s http://localhost:4000/api/next-notify?user_id=default | jq .
```

Notes

- This approach centralizes timing rules in the backend so both frontend and host-notifier behave the same way.
- If you prefer a different policy (for example, allow notifications during 00:00-01:00 or use a different interval), these rules are implemented in `backend/index.js` and can be adjusted there.

Host notifier (systemd user service)
1. Install `mpg123` on your host (used to play audio):

```sh
sudo apt install mpg123
```

2. Create a systemd user unit at `~/.config/systemd/user/water-notifier.service` with contents similar to:

```ini
[Unit]
Description=Water Intake Host Notifier
After=network.target

[Service]
Type=simple
EnvironmentFile=%h/.config/water-notifier/env
ExecStart=/usr/bin/node /home/<your-user>/Docker/WaterIntakeTracking/tools/host-notifier/notifier.js
WorkingDirectory=/home/<your-user>/Docker/WaterIntakeTracking/tools/host-notifier
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

3. Create an environment file `~/.config/water-notifier/env`:

```ini
API_URL="http://localhost:4000"
PG_CONN="postgresql://postgres:postgres@127.0.0.1:5432/waterdb"
SOUND_PATH="/home/<your-user>/Docker/WaterIntakeTracking/public/sound.mp3"
POLL_MINUTES=60
USER_ID=default
```

4. Enable and start the service:

```sh
systemctl --user daemon-reload
systemctl --user enable --now water-notifier.service
journalctl --user -u water-notifier.service -f
```

Notes
- The host-notifier plays sound first then shows the desktop notification to align audio with the UI. The notifier includes small dedupe protections to avoid duplicate plays.
- If the backend or DB are not yet available at startup, the notifier will retry; consider using systemd unit ordering or a small wrapper to wait for the backend to be healthy before starting the notifier.

If you'd like, I can add an optional admin endpoint to clear old pending notifications or extend the notifier with an explicit healthcheck/wait wrapper.

### Backend (Node.js + Express)
- RESTful API with Express.js
- CORS enabled for cross-origin requests
- Input validation and error handling
- Database connection pooling

### Database (PostgreSQL)
- Structured data storage with relationships
- Tables: `water_intake`, `user_settings`, `daily_celebrations`
- ACID compliance for data integrity

## 🛠️ Technology Stack

- **Frontend**: React 19, Vite, CSS3
- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL 15
- **DevOps**: Docker, Docker Compose
- **UI/UX**: Custom CSS with animations, responsive design

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Stay hydrated! 💧** Made with ❤️ for better health habits.
