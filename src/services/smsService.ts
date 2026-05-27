import { Job, SmsConfig } from '../types';

/**
 * Web Crypto API를 사용한 HMAC-SHA256 시그니처 생성기 (의존성 없음)
 */
async function getSolapiSignature(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: { name: "SHA-256" } },
    false,
    ["sign"]
  );
  const signature = await window.crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(message)
  );
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 문자 메시지 본문 내 변수를 실제 값으로 치환합니다.
 */
export const replaceTemplateVariables = (template: string, job: Job, companyName: string): string => {
  if (!template) return '';
  return template
    .replace(/{고객명}/g, job.contactPerson || job.clientName || '')
    .replace(/{거래처}/g, job.clientName || '')
    .replace(/{주문명}/g, job.title || '')
    .replace(/{회사명}/g, companyName || '')
    .replace(/{연락처}/g, job.clientPhone || '');
};

/**
 * 솔라피 API를 활용한 문자 발송 로직
 */
export const sendSmsViaSolapi = async (
  to: string,
  text: string,
  config: SmsConfig
): Promise<{ success: boolean; message: string }> => {
  const apiKey = config.apiKey;
  const apiSecret = config.apiSecret;
  const senderNumber = config.senderNumber;

  if (!apiKey || !apiSecret || !senderNumber) {
    return {
      success: false,
      message: '솔라피 API Key, API Secret Key, 발신번호를 모두 입력해 주세요.'
    };
  }

  const cleanTo = to.replace(/\D/g, "");
  const cleanFrom = senderNumber.replace(/\D/g, "");

  if (!cleanTo) {
    return { success: false, message: '수신인 연락처가 유효하지 않습니다.' };
  }

  const date = new Date().toISOString();
  const salt = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  
  try {
    const signature = await getSolapiSignature(apiSecret, date + salt);
    const response = await fetch('https://api.solapi.com/messages/v4/send-many', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`
      },
      body: JSON.stringify({
        messages: [
          {
            to: cleanTo,
            from: cleanFrom,
            text: text
          }
        ]
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.errorMessage || `HTTP Error ${response.status}`);
    }

    if (result.failedMessageCount > 0) {
      const errorMsg = result.failedList?.[0]?.errorMessage || '발송 실패';
      throw new Error(errorMsg);
    }

    return { success: true, message: '문자가 성공적으로 전송되었습니다!' };
  } catch (err: any) {
    console.error('Solapi SMS sending failed:', err);
    return { success: false, message: `문자 발송 실패: ${err.message}` };
  }
};

/**
 * 완료 알림 문자 공통 발송 트리거
 */
export const sendCompleteSms = async (
  job: Job,
  config: SmsConfig,
  companyName: string
): Promise<{ success: boolean; message: string; sentContent: string }> => {
  const phone = job.clientPhone || '';
  if (!phone) {
    return { success: false, message: '고객 연락처가 등록되어 있지 않습니다.', sentContent: '' };
  }

  // 기본 템플릿 정의
  const template = config.completedMessageTemplate || 
    `[{회사명}] {고객명}님, 주문하신 '{주문명}' 제품의 인쇄/작업이 완료되었습니다. 물건을 찾으러 내방해 주시기 바랍니다. 감사합니다.`;
  const messageBody = replaceTemplateVariables(template, job, companyName);

  if (config.mode === 'app') {
    // Windows 휴대폰과 연결 (앱 연동) 모드
    try {
      // 1. 클립보드 복사 지원
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(messageBody);
      }
      
      // 2. sms 프로토콜 호출
      const cleanPhone = phone.replace(/\D/g, "");
      const smsUrl = `sms:${cleanPhone}?body=${encodeURIComponent(messageBody)}`;
      window.open(smsUrl, '_blank');
      
      return { 
        success: true, 
        message: '클립보드에 문자 내용이 복사되었으며, 휴대폰 연결 문자 발송 창이 열렸습니다.', 
        sentContent: messageBody 
      };
    } catch (e: any) {
      return { 
        success: false, 
        message: `휴대폰 연동 실행 중 오류: ${e.message}`, 
        sentContent: messageBody 
      };
    }
  } else {
    // API 연동 모드
    if (config.provider === 'solapi') {
      const res = await sendSmsViaSolapi(phone, messageBody, config);
      return {
        success: res.success,
        message: res.message,
        sentContent: messageBody
      };
    } else {
      // 기존 CoolSMS/알리고/문자바이브/가비아 모의(Mock) 전송 처리
      console.log(`[SMS API Mock - ${config.provider}] Sending to ${phone}: ${messageBody}`);
      const providerNames: Record<string, string> = {
        coolsms: 'CoolSMS',
        aligo: '알리고',
        munjavibe: '문자바이브 (Munja Vibe)',
        gabia: '가비아 (Gabia) SMS'
      };
      const providerName = providerNames[config.provider] || config.provider;
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            success: true,
            message: `${providerName} 문자 발송 완료 (MOCK)`,
            sentContent: messageBody
          });
        }, 800);
      });
    }
  }
};
