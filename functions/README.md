# EzPrintWork Cloud Functions (코페이 결제)

## 환경변수

```bash
cp .env.example .env
# .env 에 MID / MKEY / FUNCTIONS_PUBLIC_URL 입력
```

`FUNCTIONS_PUBLIC_URL` 예:
`https://asia-northeast3-gen-lang-client-0746903005.cloudfunctions.net`

## 로컬 의존성

```bash
cd functions
npm install
```

## 배포

프로젝트 루트에서:

```bash
firebase deploy --only functions
```

배포 후 엔드포인트:
- Callable: `korpayCreatePayment`
- HTTP POST: `korpayConfirm` (코페이 returnUrl)

## 프론트

`UpgradeModal` → `createKorpayPayment` → `@korpay/sdk` 결제창 → `korpayConfirm` 승인 → `/#/payment/success`
