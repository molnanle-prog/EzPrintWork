const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, execSync } = require('child_process');

function resolveUncPath(uncPath) {
    if (!uncPath) return '';
    return uncPath.replace(/\//g, '\\');
}

function selectDirectory() {
    // Shell.Application COM 개체를 이용해 스레드 모델(STA) 제약 없이 안정적으로 폴더 선택창 호출
    const cmd = `powershell -Command "$app = New-Object -ComObject Shell.Application; $folder = $app.BrowseForFolder(0, '저장할 폴더를 선택해 주세요.', 0, 17); if ($folder) { $folder.Self.Path } else { '' }"`;
    try {
        const result = execSync(cmd).toString().trim();
        return result;
    } catch(e) {
        console.error("PowerShell Folder Browser Error:", e);
        return '';
    }
}

async function checkDirectoryStatusHelper(dirPath) {
    if (!dirPath) return { success: false, error: '경로가 비어 있습니다.' };
    try {
        if (!fs.existsSync(dirPath)) {
            return { success: false, error: '경로가 존재하지 않습니다.' };
        }
        const tempFile = path.join(dirPath, `.write_test_${Date.now()}`);
        fs.writeFileSync(tempFile, 'test', 'utf8');
        fs.unlinkSync(tempFile);
        return { success: true, message: '정상 작동 (읽기/쓰기 가능)' };
    } catch (e) {
        return { success: false, error: `접근 권한이 없거나 오류가 발생했습니다: ${e.message}` };
    }
}

const localServer = http.createServer(async (req, res) => {
    // CORS 및 PNA 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    try {
        const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

        if (reqUrl.pathname === '/select') {
            const selectedPath = selectDirectory();
            const resolved = resolveUncPath(selectedPath);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ path: resolved }));
        } else if (reqUrl.pathname === '/open') {
            const targetPath = reqUrl.searchParams.get('path');
            if (!targetPath) {
                res.writeHead(400);
                res.end('Missing path');
                return;
            }
            exec(`explorer "${resolveUncPath(targetPath)}"`);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: true }));
        } else if (reqUrl.pathname === '/read-file') {
            const targetPath = reqUrl.searchParams.get('path');
            if (!targetPath) {
                res.writeHead(400);
                res.end('Missing path');
                return;
            }
            let data = null;
            let mtime = null;
            if (fs.existsSync(targetPath)) {
                const stats = fs.statSync(targetPath);
                data = fs.readFileSync(targetPath, 'utf8');
                mtime = stats.mtimeMs;
            } else if (targetPath.endsWith('.json')) {
                const noExtPath = targetPath.slice(0, -5);
                if (fs.existsSync(noExtPath)) {
                    try {
                        const stats = fs.statSync(noExtPath);
                        data = fs.readFileSync(noExtPath, 'utf8');
                        fs.writeFileSync(targetPath, data, 'utf8');
                        mtime = stats.mtimeMs;
                    } catch (err) {}
                }
            }

            if (data !== null) {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: true, data, mtime }));
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: false, error: 'ENOENT' }));
            }
        } else if (reqUrl.pathname === '/save-file') {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', () => {
                try {
                    const { path: filePath, content } = JSON.parse(body);
                    if (!filePath) {
                        res.writeHead(400);
                        res.end('Missing path');
                        return;
                    }
                    const dir = path.dirname(filePath);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }
                    fs.writeFileSync(filePath, content, 'utf8');
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: true }));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });
            return;
        } else if (reqUrl.pathname === '/check-directory') {
            const targetPath = reqUrl.searchParams.get('path');
            if (!targetPath) {
                res.writeHead(400);
                res.end('Missing path');
                return;
            }
            const status = await checkDirectoryStatusHelper(targetPath);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(status));
        } else if (reqUrl.pathname === '/get-documents-path') {
            const docPath = path.join(os.homedir(), 'Documents');
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ path: docPath }));
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    } catch (error) {
        console.error("Helper Error:", error);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: error.message }));
    }
});

localServer.listen(23230, '127.0.0.1', () => {
    console.log('EzPrintWork Light Helper running on http://127.0.0.1:23230');
});
