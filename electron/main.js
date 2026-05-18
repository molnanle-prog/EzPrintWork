
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// 프로토콜 등록 (ezpw://)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('ezpw', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('ezpw');
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        },
        title: "EzPrintWork",
        autoHideMenuBar: true
    });

    if (process.env.ELECTRON_START_URL) {
        win.loadURL(process.env.ELECTRON_START_URL);
    } else {
        win.loadURL('https://ez-hub.kr/ezpw/');
    }
}

// 프로토콜 파싱 및 폴더 열기 실행 함수
function handleProtocolUrl(argv) {
    const prefix = 'ezpw://open?path=';
    const arg = argv.find(a => a.startsWith(prefix) || a.startsWith('ezpw://'));
    if (!arg) return;

    try {
        let targetPath = '';
        if (arg.startsWith(prefix)) {
            targetPath = decodeURIComponent(arg.substring(prefix.length));
        } else {
            const urlObj = new URL(arg);
            targetPath = urlObj.searchParams.get('path') || '';
        }

        if (targetPath) {
            shell.openPath(targetPath);
        }
    } catch (e) {
        console.error('Protocol URL 파싱 오류:', e);
    }
}

// 싱글 인스턴스 락 설정 (중복 실행 방지 및 프로토콜 전달 연동)
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // 이미 켜진 앱이 있으면 활성화
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
        }
        // 웹 브라우저에서 보낸 주소(프로토콜) 처리
        handleProtocolUrl(commandLine);
    });

    app.whenReady().then(() => {
        createWindow();
        startLocalServer();
        // 앱이 프로토콜 호출로 처음 켜졌을 때 처리
        handleProtocolUrl(process.argv);
    });
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// --- 웹 브라우저 연동용 로컬 HTTP 서버 (127.0.0.1:23230) ---
const http = require('http');
let localServer;

function startLocalServer() {
    localServer = http.createServer(async (req, res) => {
        // CORS 헤더 및 Chrome Private Network Access(PNA) 허용 설정
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Access-Control-Allow-Private-Network', 'true'); // 중요: 크롬 브라우저의 로컬 보안(PNA) 우회 헤더

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        try {
            // URL 파싱
            const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

            if (reqUrl.pathname === '/select') {
                const { canceled, filePaths } = await dialog.showOpenDialog({
                    properties: ['openFile', 'openDirectory']
                });
                const selectedPath = canceled ? '' : filePaths[0];
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ path: selectedPath }));
            } else if (reqUrl.pathname === '/open') {
                const targetPath = reqUrl.searchParams.get('path');
                if (!targetPath) {
                    res.writeHead(400);
                    res.end('Missing path');
                    return;
                }
                await shell.openPath(targetPath);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: true }));
            } else {
                res.writeHead(404);
                res.end('Not Found');
            }
        } catch (error) {
            console.error("로컬 서버 오류:", error);
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: error.message }));
        }
    });

    localServer.listen(23230, '127.0.0.1', () => {
        console.log('Local helper server running on http://127.0.0.1:23230');
    });
}

app.on('will-quit', () => {
    if (localServer) {
        localServer.close();
    }
});

// --- IPC 핸들러 (실제 시스템 기능) ---

// 1. 폴더 선택창 열기 (NAS 설정용)
ipcMain.handle('select-directory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });
    return canceled ? null : filePaths[0];
});

// 2. 파일 또는 폴더 선택 (작업 등록용)
ipcMain.handle('select-file-or-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile', 'openDirectory']
    });
    return canceled ? null : filePaths[0];
});

// 3. 경로 열기 (탐색기 실행)
ipcMain.handle('open-path', async (event, targetPath) => {
    if (!targetPath) return false;
    try {
        // 파일이면 폴더를 열고 파일을 선택하게 하거나, 폴더면 폴더를 엶
        await shell.openPath(targetPath);
        return true;
    } catch (e) {
        console.error("경로 열기 오류:", e);
        return false;
    }
});

// 4. 파일 저장
ipcMain.handle('save-file', async (event, { path: filePath, content }) => {
    try {
        fs.writeFileSync(filePath, content, 'utf8');
        return true;
    } catch (e) {
        return false;
    }
});

// 5. 파일 읽기
ipcMain.handle('read-file', async (event, filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf8');
        }
        return null;
    } catch (e) {
        return null;
    }
});

// 6. 파일 존재 여부 확인
ipcMain.handle('exists', async (event, filePath) => {
    return fs.existsSync(filePath);
});
