# MLX Menu Bar App - Installation Guide

## 🚀 Quick Start

Run this command to start the app:
```bash
cd /Users/YOUR_USERNAME/mlx-menu-app
npm start
```

Or use the provided script:
```bash
./start.sh
```

## 📁 What Was Created

```
/Users/YOUR_USERNAME/mlx-menu-app/
├── main.js           → Main Electron app with menu bar
├── settings.html     → Settings page
├── package.json      → App configuration
├── mlx-icon.png      → Menu bar icon
├── README.md         → Full documentation
├── INSTALL.md        → This quick start guide
└── start.sh          → One-click starting script
```

## 🖥️ How The Menu Bar Works

### Menu Bar Icon Features
1. **Click the icon** → Opens a dropdown menu
2. **See server status** → Shows which model is running
3. **Click model name** → Select from available MLX models
4. **Restart Server** → Restarts with selected model
5. **Stop Server** → Stops the current server
6. **Open MLX Server** → Opens browser to localhost:8080
7. **Model Directory** → Shows where models are stored

### Quick Actions
- **Double-click icon** → Opens the MLX server web interface
- **Select model** → Choose from auto-detected models
- **One-click start/stop** → Control your server from menu

## 📋 Model Detection

The app automatically finds models in these locations:
- `~/.cache/mlx/models/`
- `~/models/`

**Add new models:**
```bash
mkdir -p ~/models
# Download your MLX model here
# Models with names like: openelm-, llama-, mistral-, gemma-, phi-
```

## 🔧 Customize (Optional)

### Change model name pattern
Edit `main.js` line ~8:
```javascript
// Add more patterns to detect your models
if (f.includes('mlx') || f.includes('llama') ...) {
```

### Change server port
Edit `main.js` line ~10:
```javascript
let serverPort = 8080;  // Change to your port
```

### Auto-start on app launch
Edit `main.js` last lines:
```javascript
// Uncomment to auto-start:
// startServer();
```

## 🎯 Next Steps

1. **Run `npm start`** to launch the menu bar app
2. **The icon appears** in your top-right menu bar
3. **Select a model** from the dropdown
4. **Click "Restart Server"** to start
5. **Double-click icon** to open the web interface

## 🐛 Troubleshooting

**Model not detected?**
```bash
python3 -m mlx_lm.server --model <your-model-name>
```

**Server won't start?**
```bash
# Check if port is available
lsof -i :8080
# If busy, kill it or use a different port
```

**Icon missing?**
- Make sure `mlx-icon.png` exists in the app folder
- Or provide your own icon file

## ✅ Success!

You now have a menu bar app for MLX server just like Ollama!

The menu bar icon shows your server status and lets you control it without needing a separate window.

**The app runs in the background** - just look at the top-right of your screen!

---
**Questions?** See README.md for full details.
