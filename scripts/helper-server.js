// scripts/helper-server.js
// Standalone HTTP Helper Server for EzPrintWork Web Version
// Runs locally on http://127.0.0.1:23230

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync, exec } = require('child_process');

// --- 백그라운드 상주 모드 (콘솔 창 숨김 및 윈도우 토스트 알림) ---
const shouldHide = !process.argv.includes('--show') && !process.argv.includes('--debug');

if (shouldHide) {
    try {
        // 윈도우 알림(Toast) 메시지 출력
        const toastCmd = `
            Add-Type -AssemblyName System.Windows.Forms;
            $tb = New-Object System.Windows.Forms.NotifyIcon;
            $tb.Icon = [System.Drawing.SystemIcons]::Information;
            $tb.BalloonTipTitle = 'EzPrintWork 브라우저 연동 도우미';
            $tb.BalloonTipText = '도우미가 백그라운드(상주) 모드로 실행되었습니다. 웹 화면과 자동으로 연동됩니다.';
            $tb.Visible = $true;
            $tb.ShowBalloonTip(3000);
            Start-Sleep -s 4;
            $tb.Dispose();
        `;
        const cleanToast = toastCmd.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
        exec(`powershell -Command "${cleanToast}"`);
    } catch (e) {
        console.error('Failed to show startup notification:', e.message);
    }
}

console.log('==================================================');
console.log('   🛠️  EzPrintWork 웹 브라우저 연동 도우미 구동 중');
console.log('==================================================');

// --- 헬퍼 함수: UNC 경로 자동 변환 ---
function resolveUncPath(localPath) {
    if (!localPath) return '';
    // Z:\ 등의 로컬 매핑 경로 감지 시 UNC 주소로 자동 변환
    if (/^[A-Za-z]:\\/.test(localPath)) {
        try {
            const drive = localPath.substring(0, 2);
            const output = execSync(`net use ${drive}`, { encoding: 'utf8' });
            const match = output.match(/Remote name\s+([^\r\n]+)/i);
            if (match && match[1]) {
                const remote = match[1].trim();
                const resolved = localPath.replace(drive, remote);
                console.log(`[UNC 변환] ${localPath} -> ${resolved}`);
                return resolved;
            }
        } catch (e) {
            // net use 조회 실패 시 원본 반환
        }
    }
    return localPath;
}

// --- 헬퍼 함수: 폴더 읽기/쓰기 권한 검사 ---
function checkDirectoryStatusHelper(targetPath) {
    try {
        if (!fs.existsSync(targetPath)) {
            return { success: false, error: '경로가 존재하지 않습니다.' };
        }
        const testFile = path.join(targetPath, `.write_test_${Date.now()}.tmp`);
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        return { success: true, message: '정상 작동 (읽기/쓰기 가능)' };
    } catch (e) {
        return { success: false, error: `접근 권한이 없거나 오류가 발생했습니다: ${e.message}` };
    }
}

// --- HTTP 서버 생성 ---
const server = http.createServer(async (req, res) => {
    // CORS 헤더 및 Chrome Private Network Access(PNA) 허용
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Private-Network', 'true'); // 중요: 크롬 브라우저의 로컬 보안(PNA) 우회 헤더

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    try {
        const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

        // 1. 폴더 선택 (PowerShell GUI 호출)
        if (reqUrl.pathname === '/select') {
            console.log('[API] /select 호출됨 (PowerShell 폴더 대화상자 부팅)');
            let selectedPath = '';
            try {
                // PowerShell을 사용하여 시스템의 FolderBrowserDialog를 띄움
                const psCmd = `
                    Add-Type -AssemblyName System.Windows.Forms;
                    $f = New-Object System.Windows.Forms.FolderBrowserDialog;
                    $f.Description = "EzPrintWork 데이터베이스 폴더를 선택하세요";
                    $f.ShowNewFolderButton = $true;
                    if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
                        $f.SelectedPath
                    }
                `;
                // 개행 문자 및 띄어쓰기 정제
                const cleanCmd = psCmd.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
                selectedPath = execSync(`powershell -Command "${cleanCmd}"`, { encoding: 'utf8' }).trim();
            } catch (err) {
                console.error('[오류] 폴더 선택창 실행 실패:', err.message);
            }

            const resolved = resolveUncPath(selectedPath);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ path: resolved }));
        }
        
        // 2. 폴더 열기 (윈도우 탐색기 실행)
        else if (reqUrl.pathname === '/open') {
            const targetPath = reqUrl.searchParams.get('path');
            console.log(`[API] /open 호출됨: ${targetPath}`);
            if (!targetPath) {
                res.writeHead(400);
                res.end('Missing path');
                return;
            }
            try {
                execSync(`start explorer.exe "${targetPath}"`);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: true }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        }
        
        // 3. 파일 읽기
        else if (reqUrl.pathname === '/read-file') {
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
                // 자가 치유: 확장자 없는 레거시 파일 마이그레이션
                const noExtPath = targetPath.slice(0, -5);
                if (fs.existsSync(noExtPath)) {
                    console.log(`[Self-Healing] Migrating extensionless file: ${noExtPath} -> ${targetPath}`);
                    try {
                        const stats = fs.statSync(noExtPath);
                        data = fs.readFileSync(noExtPath, 'utf8');
                        fs.writeFileSync(targetPath, data, 'utf8');
                        mtime = stats.mtimeMs;
                    } catch (err) {
                        console.error(`[Self-Healing] Migration failed:`, err);
                    }
                }
            }

            if (data !== null) {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: true, data, mtime }));
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: false, error: 'ENOENT' }));
            }
        }
        
        // 4. 파일 저장
        else if (reqUrl.pathname === '/save-file') {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
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
        }
        
        // 5. 디렉토리 연결성 및 권한 검사
        else if (reqUrl.pathname === '/check-directory') {
            const targetPath = reqUrl.searchParams.get('path');
            if (!targetPath) {
                res.writeHead(400);
                res.end('Missing path');
                return;
            }
            const status = checkDirectoryStatusHelper(targetPath);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(status));
        }
        
        // 6. 기본 문서 폴더 경로 획득
        else if (reqUrl.pathname === '/get-documents-path') {
            const userProfile = process.env.USERPROFILE || process.env.HOMEPATH || '';
            const docPath = path.join(userProfile, 'Documents');
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ path: docPath }));
        }

        // 7. 도우미 종료
        else if (reqUrl.pathname === '/exit') {
            console.log('[API] /exit 호출 (도우미 프로그램 종료)');
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: true, message: '도우미가 성공적으로 종료되었습니다.' }));
            
            // 윈도우 알림(Toast) 메시지 출력 (종료됨 알림)
            try {
                const exitToastCmd = `
                    Add-Type -AssemblyName System.Windows.Forms;
                    $tb = New-Object System.Windows.Forms.NotifyIcon;
                    $tb.Icon = [System.Drawing.SystemIcons]::Information;
                    $tb.BalloonTipTitle = 'EzPrintWork 브라우저 연동 도우미';
                    $tb.BalloonTipText = '도우미 프로그램이 정상적으로 종료되었습니다.';
                    $tb.Visible = $true;
                    $tb.ShowBalloonTip(3000);
                    Start-Sleep -s 3;
                    $tb.Dispose();
                `;
                const cleanExitToast = exitToastCmd.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
                exec(`powershell -Command "${cleanExitToast}"`);
            } catch (e) {}

            setTimeout(() => {
                process.exit(0);
            }, 1000);
        }
        
        // 그 외 에러 처리
        else {
            res.writeHead(404);
            res.end('Not Found');
        }
    } catch (error) {
        console.error('[에러] 요청 처리 실패:', error.message);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: error.message }));
    }
});

// 포트 23230 리슨
const PORT = 23230;
server.listen(PORT, '127.0.0.1', () => {
    console.log(`\n🎉 로컬 도우미 서버가 정상 가동되었습니다!`);
    console.log(`👉 연동 주소: http://127.0.0.1:${PORT}`);
    if (shouldHide) {
        console.log(`💡 백그라운드 모드로 작동 중입니다. 종료하려면 웹 브라우저나 시스템 작업 관리자에서 종료하십시오.\n`);
    } else {
        console.log(`💡 이 창을 켜둔 상태에서 브라우저의 EzPrintWork를 사용하시면 됩니다.\n`);
    }
});
