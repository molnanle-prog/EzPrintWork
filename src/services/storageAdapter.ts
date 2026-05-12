
/**
 * StorageAdapter
 * 목적: 웹 브라우저 환경과 Electron 데스크탑 환경을 투명하게 연결합니다.
 * - 웹: localStorage 사용
 * - 앱: Electron IPC를 통해 실제 JSON 파일 저장
 */

interface StorageResult<T> {
    success: boolean;
    data?: T;
    error?: string;
}

class StorageAdapter {
    private isElectron: boolean;

    constructor() {
        // window.electron 객체가 존재하면 데스크탑 앱으로 판단
        this.isElectron = typeof window !== 'undefined' && !!window.electron;
        if (this.isElectron) {
            console.log("StorageAdapter: Running in Electron Mode 🖥️");
        } else {
            console.log("StorageAdapter: Running in Web Mode 🌐");
        }
    }

    // 데이터 저장
    async save<T>(key: string, data: T): Promise<StorageResult<void>> {
        const jsonString = JSON.stringify(data, null, 2);

        if (this.isElectron && window.electron) {
            // Electron: 파일로 저장 (이제 key가 full path이므로 그대로 전달)
            try {
                const result = await window.electron.saveFile(key, jsonString);
                if (!result.success) throw new Error(result.error);
                return { success: true };
            } catch (e: any) {
                console.error(`[Electron] Failed to save ${key}:`, e);
                return { success: false, error: e.message };
            }
        } else {
            // Web: LocalStorage 저장
            try {
                localStorage.setItem(key, jsonString);
                return { success: true };
            } catch (e: any) {
                console.error(`[Web] Failed to save ${key}:`, e);
                return { success: false, error: e.message };
            }
        }
    }

    // 데이터 불러오기
    async load<T>(key: string): Promise<StorageResult<T>> {
        if (this.isElectron && window.electron) {
            // Electron: 파일에서 읽기 (이제 key가 full path이므로 그대로 전달)
            try {
                const result = await window.electron.readFile(key);
                if (!result.success || !result.data) {
                    // ENOENT (File Not Found)는 정상적인 실패일 수 있으므로 에러 로그에서 제외
                    if (result.error && !result.error.includes('ENOENT')) {
                       console.error(`[Electron] Failed to load ${key}:`, result.error);
                    }
                    return { success: false, error: result.error || 'No data' };
                }
                const parsed = JSON.parse(result.data) as T;
                return { success: true, data: parsed };
            } catch (e: any) {
                return { success: false, error: e.message };
            }
        } else {
            // Web: LocalStorage 읽기
            try {
                const item = localStorage.getItem(key);
                if (!item) return { success: false, error: 'Not found' };
                const parsed = JSON.parse(item) as T;
                return { success: true, data: parsed };
            } catch (e: any) {
                return { success: false, error: e.message };
            }
        }
    }
}

export const storage = new StorageAdapter();
