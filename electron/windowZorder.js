const { spawn } = require('child_process');

const HWND_BOTTOM = 1;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;
const SWP_FLAGS = SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE;

let ps = null;
let psReady = false;
let psQueue = [];

function readHwnd(buf) {
  if (!buf || !Buffer.isBuffer(buf)) return null;
  if (buf.length >= 8) return buf.readBigUInt64LE(0).toString();
  if (buf.length >= 4) return String(buf.readUInt32LE(0));
  return null;
}

function startPowerShellHelper() {
  if (process.platform !== 'win32') return;
  if (ps && !ps.killed) return;
  psReady = false;
  ps = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-STA', '-Command', '-'],
    { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] }
  );
  ps.on('exit', () => {
    ps = null;
    psReady = false;
  });
  ps.stdin.write(
    'Add-Type @"\n' +
      'using System;\n' +
      'using System.Runtime.InteropServices;\n' +
      'public class EzPwZOrder {\n' +
      '  [DllImport("user32.dll")]\n' +
      '  public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);\n' +
      '}\n' +
      '"@\n'
  );
  psReady = true;
  for (const hwnd of psQueue.splice(0)) sendHwnd(hwnd);
}

function sendHwnd(hwndNum) {
  if (!hwndNum) return;
  if (!ps || !psReady || ps.killed) {
    psQueue.push(hwndNum);
    startPowerShellHelper();
    return;
  }
  try {
    ps.stdin.write(
      `[EzPwZOrder]::SetWindowPos([IntPtr]${hwndNum}, [IntPtr]${HWND_BOTTOM}, 0, 0, 0, 0, ${SWP_FLAGS})\n`
    );
  } catch {
    ps = null;
    psReady = false;
  }
}

function sendWindowToBack(win) {
  if (!win || win.isDestroyed()) return;
  try {
    win.setAlwaysOnTop(false);
  } catch {
    /* ignore */
  }
  try {
    const hwnd = readHwnd(win.getNativeWindowHandle());
    if (hwnd) sendHwnd(hwnd);
  } catch (err) {
    console.warn('[windowZorder] native handle 실패:', err && err.message);
  }
  try {
    win.blur();
  } catch {
    /* ignore */
  }
}

module.exports = { sendWindowToBack };
