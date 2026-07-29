# EzPrintWork Cloud Functions (코페이 결제)

## 환경변수

```bash
cp .env.example .env
# .env 에 MID / MKEY / FUNCTIONS_PUBLIC_URL 입력
```

`FUNCTIONS_PUBLIC_URL` 예:
`https://asia-northeast3-gen-lang-client-0746903005.cloudfunctions.net`

## 운영(배포) 환경변수 반영

이 프로젝트의 Cloud Functions 코드는 `process.env`에서 아래 값을 읽습니다.
- `KORPAY_MERCHANT_ID` (MID)
- `KORPAY_MKEY` (M-key)
- `KORPAY_CONFIRM_URL` 또는 `FUNCTIONS_PUBLIC_URL` (returnUrl 생성용)

`functions/.env`는 로컬에서만 쓰기 위한 파일이며(배포 시 자동 주입되지 않음), 운영(Cloud Functions) 환경변수 쪽에서도 위 키들이 동일한 값으로 설정되어 있어야 결제가 정상 동작합니다.

운영 환경변수 설정 후에는 `UpgradeModal`에서 소액(테스트) 결제 1회를 진행해 `korpayCreatePayment` → `korpayConfirm` 흐름이 에러 없이 끝나는지 확인하세요.

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

## 정기 점검(매달 1회)

아래를 매달 1회 확인하는 것을 권장합니다.
- 운영 Cloud Functions 환경변수의 `KORPAY_MERCHANT_ID` / `KORPAY_MKEY`가 최신인지
- `korpayCreatePayment` 호출 시 `failed-precondition`(결제 설정 없음) 또는 해시 검증/승인 오류 로그가 없는지
- 소액(테스트) 결제 1회가 정상 승인/완료로 연결되는지
