import React, { useState, useEffect, useCallback } from 'react';
import { ActivationScreen } from './ActivationScreen';

// License status types
type LicenseStatus = 'VALID' | 'EXPIRED' | 'INVALID' | 'TRIAL' | 'NONE';

interface LicenseInfo {
    status: LicenseStatus;
    message: string;
    data?: any;
}

export const LicenseGuard = ({ children }: { children: React.ReactNode }) => {
    const [licenseInfo, setLicenseInfo] = useState<LicenseInfo>({ status: 'NONE', message: '라이선스 확인 중...' });

    const verify = useCallback(async () => {
        let status: LicenseStatus = 'INVALID';
        let message = '알 수 없는 상태';
        let data = null;

        if (window.electron) {
            const result = await window.electron.verifyLicense();
            if (result.isValid) {
                status = 'VALID';
                message = '정식 인증되었습니다.';
                data = result.data;
            } else {
                if (result.msg?.includes('만료')) {
                    status = 'EXPIRED';
                    message = '라이선스 기간이 만료되었습니다. 새로운 키를 입력해주세요.';
                } else {
                    status = 'INVALID';
                    message = result.msg || '라이선스가 유효하지 않습니다.';
                }
            }
        } else {
            const localLicense = localStorage.getItem('pm_web_license');
            if (localLicense) {
                const parsed = JSON.parse(localLicense);
                if (parsed.expiry && Date.now() > parsed.expiry) {
                    status = 'EXPIRED';
                    message = '[웹] 라이선스 기간이 만료되었습니다.';
                } else {
                    status = parsed.key === 'TRIAL' ? 'TRIAL' : 'VALID';
                    message = `[웹] ${status === 'TRIAL' ? '체험판' : '정식'} 라이선스 사용 중`;
                    data = parsed;
                }
            } else {
                status = 'NONE';
                message = '라이선스 정보가 없습니다. 인증을 진행해주세요.';
            }
        }
        setLicenseInfo({ status, message, data });
    }, []);

    useEffect(() => {
        verify();
    }, [verify]);

    if (licenseInfo.status === 'VALID' || licenseInfo.status === 'TRIAL') {
        return <>{children}</>;
    }

    return <ActivationScreen licenseInfo={licenseInfo} onActivationSuccess={verify} />;
};
