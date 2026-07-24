import { getEffectiveArchiveRootPath } from './archiveStorage';
import { JOB_NOTEBOOK_FOLDER, NOTEBOOK_CONTENT_FILE } from './jobNotebook';

function joinPath(...parts: string[]): string {
    return parts
        .map((p, i) => (i === 0 ? String(p || '').replace(/[\\/]+$/, '') : String(p || '').replace(/^[\\/]+|[\\/]+$/g, '')))
        .filter(Boolean)
        .join('\\');
}

/** NAS: memo/clients/{clientId}/content.txt */
export function getClientNotebookDirRelative(clientId: string): string {
    return joinPath(JOB_NOTEBOOK_FOLDER, 'clients', clientId);
}

export function getClientNotebookContentRelativePath(clientId: string): string {
    return joinPath(getClientNotebookDirRelative(clientId), NOTEBOOK_CONTENT_FILE);
}

function resolveAbsolute(relativePath: string): string | null {
    const root = getEffectiveArchiveRootPath();
    if (!root?.trim() || !relativePath?.trim()) return null;
    return joinPath(root.trim(), relativePath.replace(/\//g, '\\'));
}

async function ensureClientNotebookDir(clientId: string): Promise<{ absDir: string } | { error: string }> {
    const root = getEffectiveArchiveRootPath();
    if (!root?.trim()) {
        return { error: '회사 NAS(데이터 폴더) 경로가 없습니다. 설정에서 NAS를 연결해 주세요.' };
    }
    const absDir = joinPath(root.trim(), getClientNotebookDirRelative(clientId));
    if (window.electron?.ensureDir) {
        const ensured = await window.electron.ensureDir(absDir);
        if (!ensured.success) {
            return { error: ensured.error || '거래처 memo 폴더 생성 실패' };
        }
    }
    return { absDir };
}

export async function persistClientNotebookText(
    clientId: string,
    text: string
): Promise<{ ok: boolean; relativePath?: string; error?: string }> {
    if (!window.electron?.saveFile) {
        return { ok: false, error: 'PC 앱에서만 NAS 파일 저장이 가능합니다.' };
    }
    if (!clientId?.trim()) {
        return { ok: false, error: '거래처를 먼저 저장한 뒤 메모장을 사용해 주세요.' };
    }
    const dir = await ensureClientNotebookDir(clientId);
    if ('error' in dir) return { ok: false, error: dir.error };

    const relativePath = getClientNotebookContentRelativePath(clientId);
    const abs = resolveAbsolute(relativePath);
    if (!abs) return { ok: false, error: 'NAS 경로를 확인할 수 없습니다.' };

    const result = await window.electron.saveFile(abs, text ?? '');
    if (!result.success) {
        return { ok: false, error: result.error || 'content.txt 저장 실패' };
    }
    return { ok: true, relativePath };
}

export async function openClientNotebookFolder(clientId: string): Promise<boolean> {
    const abs = resolveAbsolute(getClientNotebookDirRelative(clientId));
    if (!abs || !window.electron?.openPath) return false;
    if (window.electron.ensureDir) {
        await window.electron.ensureDir(abs);
    }
    return window.electron.openPath(abs);
}
