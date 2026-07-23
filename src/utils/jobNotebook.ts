import { JobNotebook, JobNotebookAttachment } from '../types';
import { getEffectiveArchiveRootPath } from './archiveStorage';

/** 회사 NAS 데이터 폴더 아래 메모장 본문(content.txt) 전용 루트 */
export const JOB_NOTEBOOK_FOLDER = 'memo';
export const NOTEBOOK_CONTENT_FILE = 'content.txt';

export function emptyNotebook(): JobNotebook {
    return { text: '', attachments: [] };
}

export function normalizeNotebook(nb?: JobNotebook | null): JobNotebook {
    return {
        text: nb?.text || '',
        attachments: Array.isArray(nb?.attachments)
            ? nb!.attachments.map((a) => ({
                  id: a.id,
                  fileName: a.fileName,
                  filePath: a.filePath || '',
                  // 구버전 NAS 복사본 호환
                  relativePath: a.relativePath,
              }))
            : [],
    };
}

export function notebookHasContent(nb?: JobNotebook | null): boolean {
    if (!nb) return false;
    if ((nb.text || '').trim()) return true;
    return (nb.attachments || []).length > 0;
}

function joinPath(...parts: string[]): string {
    return parts
        .map((p, i) => (i === 0 ? String(p || '').replace(/[\\/]+$/, '') : String(p || '').replace(/^[\\/]+|[\\/]+$/g, '')))
        .filter(Boolean)
        .join('\\');
}

export function getNotebookDirRelative(jobId: string, subJobId: string): string {
    return joinPath(JOB_NOTEBOOK_FOLDER, jobId, subJobId);
}

export function getNotebookContentRelativePath(jobId: string, subJobId: string): string {
    return joinPath(getNotebookDirRelative(jobId, subJobId), NOTEBOOK_CONTENT_FILE);
}

export function resolveNotebookAbsolutePath(relativePath: string): string | null {
    const root = getEffectiveArchiveRootPath();
    if (!root?.trim() || !relativePath?.trim()) return null;
    return joinPath(root.trim(), relativePath.replace(/\//g, '\\'));
}

async function ensureNotebookDir(jobId: string, subJobId: string): Promise<{ absDir: string; relDir: string } | { error: string }> {
    const root = getEffectiveArchiveRootPath();
    if (!root?.trim()) {
        return { error: '회사 NAS(데이터 폴더) 경로가 없습니다. 설정에서 NAS를 연결해 주세요.' };
    }
    const relDir = getNotebookDirRelative(jobId, subJobId);
    const absDir = joinPath(root.trim(), relDir);
    if (window.electron?.ensureDir) {
        const ensured = await window.electron.ensureDir(absDir);
        if (!ensured.success) {
            return { error: ensured.error || 'memo 폴더 생성 실패' };
        }
    }
    return { absDir, relDir };
}

/** 메모장 본문을 NAS memo/.../content.txt 로 저장 */
export async function persistNotebookText(
    jobId: string,
    subJobId: string,
    text: string
): Promise<{ ok: boolean; relativePath?: string; error?: string }> {
    if (!window.electron?.saveFile) {
        return { ok: false, error: 'PC 앱에서만 NAS 파일 저장이 가능합니다.' };
    }
    const dir = await ensureNotebookDir(jobId, subJobId);
    if ('error' in dir) return { ok: false, error: dir.error };

    const relativePath = getNotebookContentRelativePath(jobId, subJobId);
    const abs = resolveNotebookAbsolutePath(relativePath);
    if (!abs) return { ok: false, error: 'NAS 경로를 확인할 수 없습니다.' };

    const result = await window.electron.saveFile(abs, text ?? '');
    if (!result.success) {
        return { ok: false, error: result.error || 'content.txt 저장 실패' };
    }
    return { ok: true, relativePath };
}

/**
 * 첨부: NAS 복사 없이 원본 절대경로만 기록
 */
export function attachNotebookFilesFromPaths(sourcePaths: string[]): JobNotebookAttachment[] {
    return (sourcePaths || [])
        .map((source) => {
            const filePath = String(source || '').trim();
            if (!filePath) return null;
            const fileName = filePath.split(/[/\\]/).pop() || filePath;
            return {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                fileName,
                filePath,
            } as JobNotebookAttachment;
        })
        .filter(Boolean) as JobNotebookAttachment[];
}

/** 저장된 위치(원본 경로)를 탐색기에서 열기 — 구버전 relativePath 호환 */
export async function openNotebookAttachment(att: JobNotebookAttachment): Promise<boolean> {
    const electron = window.electron;
    if (!electron) return false;
    const direct = (att.filePath || '').trim();
    const target =
        direct ||
        (att.relativePath ? resolveNotebookAbsolutePath(att.relativePath) : null);
    if (!target) return false;
    if (electron.revealInFolder) {
        return electron.revealInFolder(target);
    }
    return electron.openPath ? electron.openPath(target) : false;
}

/** NAS memo 품목 폴더 열기 (본문 content.txt 위치) */
export async function openNotebookFolder(jobId: string, subJobId: string): Promise<boolean> {
    const abs = resolveNotebookAbsolutePath(getNotebookDirRelative(jobId, subJobId));
    if (!abs || !window.electron?.openPath) return false;
    if (window.electron.ensureDir) {
        await window.electron.ensureDir(abs);
    }
    return window.electron.openPath(abs);
}

export function isImageAttachment(fileName: string): boolean {
    return /\.(jpe?g|png|gif|webp|bmp)$/i.test(fileName || '');
}
