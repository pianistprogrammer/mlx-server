# MLX Server

A native macOS menu bar app for running and chatting with local AI models via [mlx-lm](https://github.com/ml-explore/mlx-lm) and [mlx-vlm](https://github.com/Blaizzy/mlx-vlm). Built with Electron.

![MLX Server](mlx-icon.png)

## Features

- **Menu bar icon** — always accessible from your status bar, no dock clutter
- **Chat interface** — clean, ChatGPT-style UI with conversation history
- **Model selector** — auto-discovers all MLX models in your configured directory
- **Download models** — pull any Hugging Face model directly from the app
- **Server status** — live indicator showing stopped / loading / running
- **Collapsible sidebar** — toggle chat history on/off
- **Settings** — configure server port, network exposure, model directory, and context length
- **Auto-launch** — chat window opens on startup; menu bar persists when window is closed
- **Apple Silicon only** — optimised for M-series Macs running mlx

## Requirements

| Requirement | Version |
|---|---|
| macOS | 12 Monterey or later |
| Apple Silicon | M1 / M2 / M3 / M4 |
| Python | 3.11 or 3.12 |
| mlx-lm | latest |
| mlx-vlm | latest |
| Node.js | 18 or later |

## Installation

### 1. Install Python 3.11 or 3.12

Download from [python.org](https://www.python.org/downloads/) — the standard installer is recommended.

### 2. Install MLX packages

```bash
pip3 install -U mlx-lm mlx-vlm
```

### 3. Install the app

Download the latest `.dmg` from [Releases](../../releases), open it, and drag **MLX Server** to your Applications folder.

### Or run from source

```bash
git clone https://github.com/pianistprogrammer/mlx-server
cd mlx-server-menu
npm install
npm start
```

## Building from source

```bash
npm run build
```

This produces a signed `.app` and `.dmg` in `dist/`. For notarization you will need an Apple Developer account — set up a keychain profile named `MLX-Notary` or update `scripts/notarize.js` with your own profile name.

> **Note:** The `identity` field in `package.json` is set to `null` by default (unsigned build). Set it to your Apple Developer identity string to produce a distribution-signed build.

## Usage

1. Launch **MLX Server** — the chat window opens and the  icon appears in your menu bar
2. Click **Download Model** in the sidebar to pull a model from Hugging Face
3. Select a model from the dropdown in the chat input bar
4. The server starts automatically and the status indicator turns green when ready
5. Start chatting

### Keyboard shortcuts

| Action | Shortcut |
|---|---|
| Send message | `Enter` |
| New line | `Shift + Enter` |

### Supported models

Any MLX-compatible model from [mlx-community](https://huggingface.co/mlx-community) on Hugging Face. Recommended starting points:

- `mlx-community/gemma-3-12b-it-4bit`
- `mlx-community/Llama-3.2-3B-Instruct-4bit`
- `mlx-community/Mistral-7B-Instruct-v0.3-4bit`
- `mlx-community/Phi-3.5-mini-instruct-4bit`

## Configuration

Open **Settings** from the sidebar to configure:

| Setting | Default | Description |
|---|---|---|
| Server port | `8080` | Port the MLX server listens on |
| Expose to network | Off | Allow other devices on your LAN to connect |
| Model location | `/Volumes/AI/LLMS` | Root directory where models are stored |
| Context length | `64k` | How much conversation history the model sees |

## Project structure

```
mlx-server-menu/
├── main.js          # Electron main process — tray, server, IPC
├── chat.html        # Chat window UI
├── settings.html    # Settings window
├── download.html    # Model download window
├── setup.html       # First-run dependency check
├── preload.js       # Electron preload script
├── scripts/
│   └── notarize.js  # macOS notarization hook
├── entitlements.plist
└── package.json
```

## Troubleshooting

**Setup screen says Python not found**
The app only looks for Python 3.11 and 3.12. Make sure you installed from python.org (not Homebrew's default `python3`) and that `mlx-lm` / `mlx-vlm` are installed in that environment.

**Server won't start**
Check that port 8080 isn't in use:
```bash
lsof -i :8080
```
You can change the port in Settings.

**Model not appearing in the list**
Make sure your model directory in Settings points to the folder that *contains* your model folders, not the model folder itself.

**App slow to open**
The dependency check runs in the background after the window appears — normal on first launch.

## Contributing

Pull requests are welcome. For major changes please open an issue first to discuss what you'd like to change.

## License

MIT
