const { app, Tray, Menu, shell, ipcMain, BrowserWindow, dialog } = require('electron');
const { spawn, execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');

let updateAvailable = false;
let updateChecking = false;

const CURRENT_VERSION = app.getVersion();
const GITHUB_REPO = 'pianistprogrammer/mlx-server';

function checkForUpdate(silent = true) {
    if (updateChecking) return;
    updateChecking = true;
    const options = {
        hostname: 'api.github.com',
        path: `/repos/${GITHUB_REPO}/releases/latest`,
        headers: { 'User-Agent': 'MLX-Server-Menu' }
    };
    const req = https.get(options, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            updateChecking = false;
            try {
                const release = JSON.parse(data);
                const latest = release.tag_name?.replace(/^v/, '');
                if (latest && latest !== CURRENT_VERSION) {
                    updateAvailable = true;
                    rebuildMenu();
                }
            } catch(e) {}
        });
    });
    req.on('error', () => { updateChecking = false; });
}

function restartToUpdate() {
    dialog.showMessageBox({
        type: 'info',
        title: 'Updating MLX Server',
        message: 'The app will update and restart.',
        buttons: ['Update & Restart', 'Cancel']
    }).then(({ response }) => {
        if (response !== 0) return;
        const updateScript = `
pip install -U mlx-lm mlx-vlm 2>&1
cd "${path.join(__dirname, '../../..')}" && git pull 2>&1
open -a "MLX Server"
        `.trim();
        exec(updateScript, { shell: '/bin/zsh' }, () => {
            stopServer();
            app.relaunch();
            app.exit(0);
        });
    });
}

let tray = null;
let serverProcess = null;
let chatWindow = null;
let settingsWindow = null;
let serverStatus = 'stopped'; // stopped | loading | running
let runningModel = '';
let iconPath = path.join(__dirname, 'mlx-icon@2x.png');

const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
    try {
        return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch(e) {
        return { port: 8080, expose: false, modelPath: '/Volumes/AI/LLMS', contextLength: 65536 };
    }
}

function saveSettings(s) {
    fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2));
}

let settings = loadSettings();

function getPort() { return settings.port || 8080; }
function getHost() { return settings.expose ? '0.0.0.0' : '127.0.0.1'; }

// ── Model discovery ──────────────────────────────────────────────────────────
function getModels() {
    const home = process.env.HOME;
    const rootPaths = [
        settings.modelPath || '/Volumes/AI/LLMS',
        path.join(home, '.cache/mlx/models'),
    ];
    let models = [];
    rootPaths.forEach(root => {
        if (!fs.existsSync(root)) return;
        fs.readdirSync(root).forEach(org => {
            if (org.startsWith('.')) return;
            const orgPath = path.join(root, org);
            if (!fs.statSync(orgPath).isDirectory()) return;
            if (fs.existsSync(path.join(orgPath, 'config.json')) && !org.match(/gguf|diffusion/i)) {
                models.push(orgPath); return;
            }
            fs.readdirSync(orgPath).forEach(model => {
                if (model.startsWith('.') || model.match(/gguf|diffusion/i)) return;
                const modelPath = path.join(orgPath, model);
                if (fs.statSync(modelPath).isDirectory()) models.push(modelPath);
            });
        });
    });
    return models;
}

// ── Status ───────────────────────────────────────────────────────────────────
function getStatusText() {
    if (serverStatus === 'loading') return `Loading: ${path.basename(runningModel)}...`;
    if (serverStatus === 'running') return `Running: ${path.basename(runningModel)}`;
    return 'Stopped';
}

// ── Menu ─────────────────────────────────────────────────────────────────────
function createMenu() {
    const items = [
        { label: `Server: ${getStatusText()}`, enabled: false },
        { type: 'separator' },
        { label: 'Open', click: () => openChat() },
        { label: 'Settings', click: () => openSettings() },
        { type: 'separator' },
    ];

    if (updateAvailable) {
        items.push({ label: 'Restart to Update', click: () => restartToUpdate() });
        items.push({ type: 'separator' });
    }

    items.push({ label: 'Quit', click: () => { stopServer(); app.quit(); } });
    return Menu.buildFromTemplate(items);
}

function rebuildMenu() {
    if (tray) {
        tray.setContextMenu(createMenu());
        tray.setToolTip(`MLX: ${getStatusText()}`);
    }
    if (chatWindow && !chatWindow.isDestroyed()) {
        chatWindow.webContents.send('model-changed', runningModel);
        chatWindow.webContents.send('server-status', serverStatus);
    }
}

// ── Server ───────────────────────────────────────────────────────────────────
function pollUntilReady() {
    const http = require('http');
    const req = http.get(`http://127.0.0.1:${getPort()}/v1/models`, (res) => {
        if (res.statusCode === 200) {
            serverStatus = 'running';
            rebuildMenu();
        } else {
            setTimeout(pollUntilReady, 2000);
        }
    });
    req.on('error', () => {
        if (serverProcess && !serverProcess.killed) setTimeout(pollUntilReady, 2000);
    });
    req.setTimeout(2000, () => req.destroy());
}

function getModelType(modelPath) {
    try {
        const config = JSON.parse(fs.readFileSync(path.join(modelPath, 'config.json'), 'utf8'));
        return config.model_type || '';
    } catch(e) { return ''; }
}

function startServer() {
    if (!runningModel) return;

    if (serverProcess && !serverProcess.killed) {
        serverProcess.removeAllListeners('exit');
        serverProcess.kill('SIGTERM');
        serverProcess = null;
    }

    serverStatus = 'loading';
    rebuildMenu();

    const logPath = path.join(process.env.HOME, 'mlx-server.log');
    const logFd = fs.openSync(logPath, 'a');

    const modelType = getModelType(runningModel);
    const useVlm = modelType === 'gemma4_unified' || modelType.includes('vision') || modelType.includes('vlm');
    const module = useVlm ? 'mlx_vlm.server' : 'mlx_lm.server';

    const args = ['-m', module, '--model', runningModel, '--port', String(getPort()), '--host', getHost()];
    if (settings.contextLength && !useVlm) args.push('--max-tokens', String(settings.contextLength));

    serverProcess = spawn(pythonPath || 'python3', args, { stdio: ['ignore', logFd, logFd], env: process.env });

    serverProcess.on('exit', () => {
        fs.closeSync(logFd);
        serverStatus = 'stopped';
        serverProcess = null;
        rebuildMenu();
    });

    pollUntilReady();
}

function stopServer() {
    if (!serverProcess || serverProcess.killed) return;
    serverProcess.removeAllListeners('exit');
    serverProcess.kill('SIGTERM');
    serverProcess = null;
    serverStatus = 'stopped';
    rebuildMenu();
}

// ── Windows ──────────────────────────────────────────────────────────────────
function getBgColor() {
    const { nativeTheme } = require('electron');
    return nativeTheme.shouldUseDarkColors ? '#111111' : '#f5f5f5';
}

function openChat() {
    if (chatWindow && !chatWindow.isDestroyed()) { chatWindow.focus(); return; }
    chatWindow = new BrowserWindow({
        width: 900, height: 680,
        minWidth: 600, minHeight: 400,
        titleBarStyle: 'hiddenInset',
        backgroundColor: getBgColor(),
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    chatWindow.loadFile(path.join(__dirname, 'chat.html'));
    chatWindow.on('closed', () => { chatWindow = null; });
}

let downloadWindow = null;
function openDownload() {
    if (downloadWindow && !downloadWindow.isDestroyed()) { downloadWindow.focus(); return; }
    downloadWindow = new BrowserWindow({
        width: 480, height: 400,
        resizable: false,
        titleBarStyle: 'hiddenInset',
        backgroundColor: '#1a1a1a',
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    downloadWindow.loadFile(path.join(__dirname, 'download.html'));
    downloadWindow.on('closed', () => { downloadWindow = null; });
}

function openSettings() {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.focus(); return;
    }
    settingsWindow = new BrowserWindow({
        width: 520, height: 580,
        resizable: false,
        titleBarStyle: 'hiddenInset',
        backgroundColor: '#1a1a1a',
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
    settingsWindow.on('closed', () => { settingsWindow = null; });
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('open-download', () => openDownload());
ipcMain.handle('download-model', (_, { repo, savePath }) => {
    const modelName = repo.split('/').pop();
    const destDir = path.join(savePath, repo.split('/')[0], modelName);
    const script = `python3 -c "
from huggingface_hub import snapshot_download
import sys
snapshot_download(repo_id='${repo}', local_dir='${destDir}')
print('DONE')
"`;
    const proc = exec(script, { shell: '/bin/zsh' });
    let output = '';
    const send = (log) => { if (downloadWindow && !downloadWindow.isDestroyed()) downloadWindow.webContents.send('download-progress', { log }); };
    const sendPct = (percent, file) => { if (downloadWindow && !downloadWindow.isDestroyed()) downloadWindow.webContents.send('download-progress', { percent, file }); };

    let fileCount = 0, doneCount = 0;
    proc.stdout.on('data', d => {
        output += d;
        const lines = d.toString().split('\n').filter(Boolean);
        lines.forEach(line => {
            send(line);
            const m = line.match(/(\d+)%/);
            if (m) sendPct(parseInt(m[1]), line.split('%')[1]?.trim());
            if (line.includes('Fetching')) { const fm = line.match(/(\d+) files/); if (fm) fileCount = parseInt(fm[1]); }
            if (line.includes('it/s') || line.includes('s/it')) { doneCount++; if (fileCount) sendPct(Math.min(99, Math.round(doneCount/fileCount*100)), line); }
        });
    });
    proc.stderr.on('data', d => send(d.toString()));
    proc.on('exit', code => {
        const ok = code === 0 || output.includes('DONE');
        if (downloadWindow && !downloadWindow.isDestroyed()) {
            downloadWindow.webContents.send('download-done', { ok, error: ok ? null : 'Download failed. Check the log.' });
            if (ok) { sendPct(100, 'Complete'); rebuildMenu(); }
        }
    });
});
ipcMain.handle('get-model', () => runningModel);
ipcMain.handle('get-port', () => getPort());
ipcMain.handle('get-settings', () => settings);
ipcMain.handle('get-models', () => getModels());
ipcMain.handle('get-server-status', () => serverStatus);
ipcMain.handle('select-model', (_, modelPath) => { runningModel = modelPath; startServer(); rebuildMenu(); });
ipcMain.handle('stop-server', () => stopServer());
ipcMain.handle('open-settings', () => openSettings());
ipcMain.handle('save-settings', (_, s) => {
    const contextChanged = s.contextLength !== settings.contextLength;
    const portChanged = s.port !== settings.port || s.expose !== settings.expose;
    settings = s;
    saveSettings(s);
    rebuildMenu();

    if (serverStatus === 'stopped') return;

    if (contextChanged) {
        // Context length requires full model reload
        stopServer();
        setTimeout(() => startServer(), 500);
    } else if (portChanged) {
        // Port change: restart server on new port, model stays in memory via same process
        stopServer();
        setTimeout(() => startServer(), 500);
    }
    // All other setting changes (modelPath, expose off→on without port change, etc.) — no restart
});
ipcMain.handle('browse-dir', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
});

// ── Setup / dependency check ──────────────────────────────────────────────────
let setupWindow = null;

function findPython() {
    const candidates = [
        '/Library/Frameworks/Python.framework/Versions/3.12/bin/python3',
        '/Library/Frameworks/Python.framework/Versions/3.11/bin/python3',
        '/opt/homebrew/opt/python@3.12/bin/python3.12',
        '/opt/homebrew/opt/python@3.11/bin/python3.11',
        `${process.env.HOME}/Library/Python/3.12/bin/python3`,
        `${process.env.HOME}/Library/Python/3.11/bin/python3`,
    ];
    for (const p of candidates) {
        try {
            const result = execSync(`${p} -c "import mlx_lm; import mlx_vlm; print('ok')" 2>/dev/null`).toString().trim();
            if (result === 'ok') return p;
        } catch(e) {}
    }
    for (const p of candidates) {
        try {
            const v = execSync(`${p} --version 2>&1`).toString().trim();
            if (v.startsWith('Python 3')) return p;
        } catch(e) {}
    }
    return 'python3';
}

let pythonPath = null;

function runChecks() {
    const results = { silicon: false, python: false, pythonVersion: '', mlxLm: false, mlxLmVersion: '', mlxVlm: false, mlxVlmVersion: '' };
    try { results.silicon = execSync('uname -m').toString().trim() === 'arm64'; } catch(e) {}
    const candidates = [
        '/Library/Frameworks/Python.framework/Versions/3.12/bin/python3',
        '/Library/Frameworks/Python.framework/Versions/3.11/bin/python3',
        '/opt/homebrew/opt/python@3.12/bin/python3.12',
        '/opt/homebrew/opt/python@3.11/bin/python3.11',
        `${process.env.HOME}/Library/Python/3.12/bin/python3`,
        `${process.env.HOME}/Library/Python/3.11/bin/python3`,
    ];
    for (const p of candidates) {
        try {
            const v = execSync(`${p} --version 2>&1`).toString().trim();
            if (!v.startsWith('Python 3')) continue;
            results.python = true;
            results.pythonVersion = v.replace('Python ', '');
            try { const lm = execSync(`${p} -c "import mlx_lm; print(mlx_lm.__version__)" 2>/dev/null`).toString().trim(); results.mlxLm = true; results.mlxLmVersion = lm; } catch(e) {}
            try { const vlm = execSync(`${p} -c "import mlx_vlm; print(mlx_vlm.__version__)" 2>/dev/null`).toString().trim(); results.mlxVlm = true; results.mlxVlmVersion = vlm; } catch(e) {}
            if (results.mlxLm && results.mlxVlm) { pythonPath = p; break; }
            if (!pythonPath) pythonPath = p;
        } catch(e) {}
    }
    return results;
}

function runChecksAsync() {
    return new Promise(resolve => {
        const results = { silicon: false, python: false, pythonVersion: '', mlxLm: false, mlxLmVersion: '', mlxVlm: false, mlxVlmVersion: '' };
        try { results.silicon = execSync('uname -m').toString().trim() === 'arm64'; } catch(e) {}

        const candidates = [
            '/Library/Frameworks/Python.framework/Versions/3.12/bin/python3',
            '/Library/Frameworks/Python.framework/Versions/3.11/bin/python3',
            '/opt/homebrew/opt/python@3.12/bin/python3.12',
            '/opt/homebrew/opt/python@3.11/bin/python3.11',
            `${process.env.HOME}/Library/Python/3.12/bin/python3`,
            `${process.env.HOME}/Library/Python/3.11/bin/python3`,
        ];

        // Write check script to a temp file to avoid shell-escaping issues
        const scriptPath = path.join(app.getPath('temp'), 'mlx_check.py');
        const script = [
            'import sys, json',
            'r = {"python": "%d.%d.%d" % sys.version_info[:3], "mlxLm": None, "mlxVlm": None}',
            'try:',
            '    import mlx_lm; r["mlxLm"] = mlx_lm.__version__',
            'except: pass',
            'try:',
            '    import mlx_vlm; r["mlxVlm"] = mlx_vlm.__version__',
            'except: pass',
            'print(json.dumps(r))',
        ].join('\n');
        try { fs.writeFileSync(scriptPath, script); } catch(e) { return resolve(results); }

        const tryNext = (i) => {
            if (i >= candidates.length) return resolve(results);
            exec(`"${candidates[i]}" "${scriptPath}"`, { timeout: 8000 }, (err, stdout) => {
                if (!err && stdout.trim()) {
                    try {
                        const r = JSON.parse(stdout.trim());
                        results.python = true;
                        results.pythonVersion = r.python || '';
                        if (r.mlxLm)  { results.mlxLm = true;  results.mlxLmVersion = r.mlxLm; }
                        if (r.mlxVlm) { results.mlxVlm = true; results.mlxVlmVersion = r.mlxVlm; }
                        pythonPath = candidates[i];
                        return resolve(results);
                    } catch(e) {}
                }
                tryNext(i + 1);
            });
        };
        tryNext(0);
    });
}

function openSetup() {
    setupWindow = new BrowserWindow({
        width: 500, height: 480,
        resizable: false,
        titleBarStyle: 'hiddenInset',
        backgroundColor: '#1a1a1a',
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    setupWindow.loadFile(path.join(__dirname, 'setup.html'));
}

ipcMain.handle('setup-check', async () => {
    const results = await runChecksAsync();
    setupWindow?.webContents.send('check-result', results);
    return results;
});

ipcMain.handle('setup-install', () => {
    return new Promise(resolve => {
        const pip = pythonPath ? `${pythonPath} -m pip` : 'pip3';
        exec(`${pip} install -U mlx-lm mlx-vlm`, { shell: '/bin/zsh' }, (err) => {
            resolve({ ok: !err });
        });
    });
});

ipcMain.handle('setup-skip', () => { setupWindow?.close(); setupWindow = null; });
ipcMain.handle('setup-done', () => { setupWindow?.close(); setupWindow = null; openChat(); });

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
    try { execSync('pkill -f "mlx_lm.server"'); } catch(e) {}
    try { execSync('pkill -f "mlx_vlm.server"'); } catch(e) {}

    const { nativeImage } = require('electron');
    const icon = nativeImage.createFromPath(iconPath);
    icon.setTemplateImage(true);
    tray = new Tray(icon);

    rebuildMenu();

    tray.on('double-click', () => openChat());
    tray.on('click', () => tray.popUpContextMenu());

    // Open chat immediately so the app feels instant
    openChat();

    // Run dependency checks async — show setup only if something is missing
    runChecksAsync().then(checks => {
        if (!checks.silicon || !checks.python || !checks.mlxLm || !checks.mlxVlm) {
            openSetup();
        }
    });

    // Check for updates on launch (after 3s) then every 6 hours
    setTimeout(() => checkForUpdate(), 3000);
    setInterval(() => checkForUpdate(), 6 * 60 * 60 * 1000);
});

app.on('window-all-closed', () => {});
app.on('will-quit', () => stopServer());
app.on('activate', () => {});
