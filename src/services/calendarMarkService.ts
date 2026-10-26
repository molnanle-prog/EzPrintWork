import { CalendarMark } from '../types';
import { jobArchiveService } from './jobArchiveService';

const FILE_NAME = 'calendar-marks.json';
const VERSION = 1;

interface CalendarMarkFile {
    version: number;
    tenantId: string;
    updatedAt: string;
    marks: CalendarMark[];
    deletedIds?: string[];
}

function markTime(mark: CalendarMark): number {
    const ms = Date.parse(mark.updatedAt || mark.createdAt || '');
    return Number.isFinite(ms) ? ms : 0;
}

export function mergeCalendarMarks(current: CalendarMark[], incoming: CalendarMark[]): CalendarMark[] {
    const map = new Map<string, CalendarMark>();
    for (const mark of current) {
        if (mark?.id) map.set(mark.id, mark);
    }
    for (const mark of incoming) {
        if (!mark?.id) continue;
        const prev = map.get(mark.id);
        if (!prev || markTime(mark) >= markTime(prev)) map.set(mark.id, mark);
    }
    return Array.from(map.values()).sort((a, b) => markTime(a) - markTime(b));
}

class CalendarMarkService {
    private isElectron(): boolean {
        return typeof window !== 'undefined' && !!window.electron;
    }

    private joinPath(base: string, name: string): string {
        const sep = navigator.platform.toLowerCase().includes('win') ? '\\' : '/';
        return `${base.endsWith(sep) ? base : base + sep}${name}`;
    }

    private async filePath(tenantId: string): Promise<string | null> {
        const root = await jobArchiveService.resolveArchiveRoot(tenantId);
        if (!root) return null;
        return this.joinPath(root, FILE_NAME);
    }

    async read(tenantId: string): Promise<CalendarMarkFile | null> {
        if (!tenantId || !this.isElectron()) return null;
        const path = await this.filePath(tenantId);
        if (!path) return null;
        const exists = await window.electron.exists?.(path);
        const result = await window.electron.readFile(path);
        if (!result?.success || !result.data) {
            if (exists === true) return null;
            return { version: VERSION, tenantId, updatedAt: '', marks: [] };
        }
        try {
            const parsed = JSON.parse(result.data) as CalendarMarkFile;
            const owner = typeof parsed.tenantId === 'string' ? parsed.tenantId.trim() : '';
            if (owner && owner !== tenantId) return null;
            const deleted = new Set(parsed.deletedIds || []);
            const marks = (Array.isArray(parsed.marks) ? parsed.marks : []).filter((mark) => mark?.id && !deleted.has(mark.id));
            return { ...parsed, marks, deletedIds: Array.from(deleted) };
        } catch {
            return null;
        }
    }

    async publish(tenantId: string, marks: CalendarMark[], removeIds: string[] = []): Promise<boolean> {
        if (!tenantId || !this.isElectron()) return false;
        const root = await jobArchiveService.resolveArchiveRoot(tenantId);
        if (!root) return false;
        const foreign = await jobArchiveService.findForeignFolderOwner(root, tenantId);
        if (foreign) return false;
        const path = this.joinPath(root, FILE_NAME);
        const incoming = marks.filter((mark) => !!mark?.id);

        for (let attempt = 0; attempt < 3; attempt++) {
            const current = await this.read(tenantId);
            if (!current) return false;
            const deleted = new Set([...(current.deletedIds || []), ...removeIds]);
            const merged = mergeCalendarMarks(current.marks, incoming).filter((mark) => !deleted.has(mark.id));
            const payload: CalendarMarkFile = {
                version: VERSION,
                tenantId,
                updatedAt: new Date().toISOString(),
                marks: merged,
                deletedIds: Array.from(deleted).slice(-200),
            };
            const result = await window.electron.saveFile(path, JSON.stringify(payload));
            if (!result?.success) continue;
            const verify = await this.read(tenantId);
            const held =
                incoming.every((mark) => deleted.has(mark.id) || verify?.marks.some((row) => row.id === mark.id)) &&
                removeIds.every((id) => !(verify?.marks || []).some((row) => row.id === id));
            if (held) return true;
        }
        return false;
    }
}

export const calendarMarkService = new CalendarMarkService();
