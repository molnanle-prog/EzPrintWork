/** PC 설치 프로그램 — GitHub Releases (Firebase Spark는 exe 호스팅 불가) */
export const GITHUB_RELEASE_OWNER = 'molnanle-prog';
export const GITHUB_RELEASE_REPO = 'EzPrintWork';
export const DESKTOP_SETUP_FILENAME = 'EzPrintWork-Setup.exe';

/** releases/latest/download — 새 Release마다 URL 변경 없음 */
export const DESKTOP_SETUP_DOWNLOAD_URL =
    `https://github.com/${GITHUB_RELEASE_OWNER}/${GITHUB_RELEASE_REPO}/releases/latest/download/${DESKTOP_SETUP_FILENAME}`;

export const GITHUB_RELEASE_LATEST =
    `https://github.com/${GITHUB_RELEASE_OWNER}/${GITHUB_RELEASE_REPO}/releases/latest`;

export function getGithubReleaseDownloadUrl(version: string): string {
    return `https://github.com/${GITHUB_RELEASE_OWNER}/${GITHUB_RELEASE_REPO}/releases/download/v${version}/${DESKTOP_SETUP_FILENAME}`;
}

/** 클릭 시 GitHub에서 설치 exe 다운로드/실행 */
export function triggerDesktopSetupDownload(): void {
    window.location.href = DESKTOP_SETUP_DOWNLOAD_URL;
}

/** @deprecated 홈페이지 로컬 경로 — Spark에서 exe 불가, GitHub URL 사용 */
export const DESKTOP_SETUP_PATH = DESKTOP_SETUP_DOWNLOAD_URL;
