# 💧 Water Intake Tracker

A modern and elegant web application to track your daily water intake with real-time progress visualization and persistent data storage.

![Water Intake Tracker](./water.png)

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
- **📅 History Tracking**: View your water intake history with calendar visualization

## � Use Cases

- **📝 Obsidian Integration**: Perfect companion for health and wellness notes in Obsidian
- **🏠 Home Network Access**: Track water intake from any device in your home
- **🔒 Privacy-First**: Data stays on your local network, no cloud dependency
- **📱 Multi-Device**: Access from PC, mobile, tablet - all synced via local database
- **⚡ Always Available**: Docker ensures the app is always running and accessible

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
cd backend && npm install && cd ..

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
docker compose up --build
```

Access: 
- **Web App**: http://localhost:5173
- **API**: http://localhost:4000

### 🔗 Obsidian Integration

To use this app inside **Obsidian** (requires Docker setup above):

1. **Install Required Plugins**:
   - [Web Browser Viewer](https://obsidian.md/plugins?id=web-browser)
   - [Custom Frames](https://obsidian.md/plugins?id=obsidian-custom-frames)

2. **Add Custom Frame**:
   ```
   Frame Name: Water Tracker
   URL: http://localhost:5173
   ```

3. **Embed in Notes**:
   ```markdown
   ```custom-frames
   frame: Water Tracker
   ```
   ```

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

### Why Docker for Obsidian Integration?

**🔗 Primary Use Case**: This application was specifically designed to run inside **Obsidian** using the **Web Browser Viewer** and **Custom Frames** plugins. Docker provides the perfect solution for this integration:

**🌐 Network Flexibility**: Docker configuration allows you to:
- Keep it **localhost-only** (default: `127.0.0.1`) for privacy
- **Open to network** by changing bind addresses to `0.0.0.0`
- **Restrict access** to specific IPs using Docker networking rules
- Use the app **anywhere**: in Obsidian on PC, mobile, or any device on your network

**📱 Cross-Platform Access**: Whether you're taking notes in Obsidian on your computer or accessing from your phone, the containerized app provides consistent access to your water tracking data.

**💡 Note**: For regular development work, use `npm run dev`. Docker is primarily for Obsidian integration and production deployments.

The application follows a modern three-tier architecture:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Frontend│    │  Express Backend│    │  PostgreSQL DB  │
│   (Port 5173)   │◄──►│   (Port 4000)   │◄──►│   (Port 5432)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
            ↕
    ┌─────────────────┐
    │    Obsidian     │
    │  Web Viewer +   │
    │ Custom Frames   │
    └─────────────────┘
```

### Frontend (React + Vite)
- Modern React 19 with hooks
- Vite for fast development and building
- CSS3 animations and responsive design
- Progressive enhancement with localStorage fallback

### Backend (Node.js + Express)
- RESTful API with Express.js
- CORS enabled for cross-origin requests
- Input validation and error handling
- Database connection pooling

### Database (PostgreSQL)
- Structured data storage with relationships
- Tables: `water_intake`, `user_settings`, `daily_celebrations`
- ACID compliance for data integrity

## 📋 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/intake` | Register water intake |
| `GET` | `/api/intake` | Get daily total intake |
| `GET` | `/api/history` | Get intake history |
| `POST` | `/api/settings/target` | Set water target |
| `GET` | `/api/settings/target` | Get water target |
| `DELETE` | `/api/intake/reset` | Reset daily intake |
| `POST` | `/api/celebration/mark` | Mark celebration as seen |
| `GET` | `/api/celebration/check` | Check celebration status |

## 🛠️ Technology Stack

- **Frontend**: React 19, Vite, CSS3
- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL 15
- **DevOps**: Docker, Docker Compose
- **UI/UX**: Custom CSS with animations, responsive design

## 📁 Project Structure

```
WaterIntakeTracking/
├── src/                    # React frontend source
│   ├── App.jsx            # Main application component
│   ├── History.jsx        # History/calendar component
│   ├── App.css            # Main styles
│   └── History.css        # History styles
├── backend/               # Node.js backend
│   ├── index.js           # Express server
│   └── package.json       # Backend dependencies
├── public/                # Static assets
├── docker-compose.yml     # Container orchestration
├── Dockerfile            # Frontend container
└── README.md             # This file
```

## 🔧 Development

### Local Development
```bash
# Frontend development
npm run dev

# Backend development  
cd backend && npm run dev
```

### Building for Production
```bash
# Build frontend
npm run build

# Preview production build
npm run preview
```

## � Security Features

- **Network Isolation**: All services bind to localhost (127.0.0.1) only
- **Input Validation**: Server-side validation for all API endpoints
- **SQL Injection Prevention**: Parameterized queries with pg library
- **CORS Configuration**: Controlled cross-origin access

## 🌐 Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🎯 Future Enhancements

- [ ] User authentication and profiles
- [ ] Mobile app versions
- [ ] Export data functionality
- [ ] Reminder notifications
- [ ] Weekly/monthly statistics
- [ ] Integration with fitness trackers

---

**Stay hydrated! 💧** Made with ❤️ for better health habits.
