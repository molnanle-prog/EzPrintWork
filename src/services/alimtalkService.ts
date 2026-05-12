import { Job, SmsConfig } from '../types';

export const sendAlimtalk = async (job: Job, config: SmsConfig, newStatusKey: string, statusLabel: string) => {
    // Basic validation
    if (!config.useAlimtalk || !config.pfId || !config.apiKey || !config.apiSecret || !job.clientPhone || !config.senderNumber) {
        return { success: false, message: '알림톡 설정이 누락되었거나 수신자 번호가 없습니다.' };
    }

    const templateCode = config.alimtalkTemplates?.[newStatusKey];
    if (!templateCode) {
        return { success: false, message: '해당 상태에 매핑된 템플릿 코드가 없습니다.' };
    }

    console.log(`[AlimTalk API Mock] Sending to ${job.clientPhone} for job ${job.id} (Status: ${statusLabel}, Template: ${templateCode})`);

    // TODO: Real API Implementation using crypto-js for HMAC signature
    // Here we simulate a successful API call for demonstration of the flow

    return new Promise<{ success: boolean, message: string }>((resolve) => {
        setTimeout(() => {
            console.log(`[AlimTalk API Mock] Successfully dispatched!`);
            resolve({ success: true, message: '알림톡 발송 완료 (MOCK)' });
        }, 800);
    });
};
