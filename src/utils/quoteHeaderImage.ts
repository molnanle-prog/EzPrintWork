import type { QuoteTemplateSettings } from '../types';

export const QUOTE_HEADER_FILE_BASE = 'quote-header';
export const QUOTE_HEADER_EXTS = ['png', 'jpg', 'jpeg', 'webp'] as const;
export const QUOTE_HEADER_MAX_BYTES = 12 * 1024 * 1024;

export function joinArchiveFile(root: string, fileName: string): string {
    const base = root.replace(/[\\/]+$/, '');
    return `${base}\\${fileName}`;
}

export function quoteHeaderFileName(ext: string): string {
    return `${QUOTE_HEADER_FILE_BASE}.${ext}`;
}

export function normalizeQuoteHeaderExt(file: File): string {
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    return (QUOTE_HEADER_EXTS as readonly string[]).includes(ext) ? ext : 'png';
}

export function mimeFromQuoteHeaderExt(ext: string): string {
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    return 'image/jpeg';
}

export function isRemoteHeaderUrl(url?: string): boolean {
    const value = String(url || '').trim();
    return /^https?:\/\//i.test(value);
}

export function hasQuoteHeaderConfigured(template: QuoteTemplateSettings | null | undefined): boolean {
    if (!template) return false;
    if (template.headerImageFile?.trim()) return true;
    if (template.headerImageUrl?.trim()) return true;
    return false;
}

export function quoteHeaderCandidateNames(template?: QuoteTemplateSettings | null): string[] {
    const names: string[] = [];
    const configured = template?.headerImageFile?.trim();
    if (configured) names.push(configured);
    for (const ext of QUOTE_HEADER_EXTS) {
        const name = quoteHeaderFileName(ext);
        if (!names.includes(name)) names.push(name);
    }
    return names;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('이미지를 읽지 못했습니다.'));
        reader.readAsDataURL(blob);
    });
}
