export const APP_PRODUCT_NAME = "EzPrintWork";
export const TRIAL_PERIOD_DAYS = 30;
export const GAS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbyv8iMZs_3Pb-Dk3gJO7YEeFAOPA_DzD93YPHxyMHMQXN5-Xt0iQnRe1AoJiSY8EPuE/exec";

/** 웹 기본값 true — Electron 또는 ezpw_saas_only_mode=false 로 하이브리드 모드 활성화 */
export const SAAS_ONLY_MODE_DEFAULT =
  typeof import.meta.env.VITE_SAAS_ONLY_MODE === 'string'
    ? import.meta.env.VITE_SAAS_ONLY_MODE !== 'false'
    : true;
