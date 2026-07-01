const fs = require('fs');
const path = require('path');
const os = require('os');

const docsPath = path.join(os.homedir(), 'Documents');
const dbDir = path.join(docsPath, 'EzPrintWork_DB');

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const defaultJobs = [];
const defaultSettings = [{
    productDefinitions: {
        definitions: [
            {
                name: '명함',
                sizes: ['90x50mm(기본)', '86x52mm(신용카드)', '85x55mm', '90x55mm', '규격외'],
                paperTypes: ['스노우지(일반)', '반누보(수입지)', '휘라레', '스타드림', '크라프트지', '엑스트라매트', '마시멜로우', '띤또레또', '팝셋', '키칼라', '빌리지'],
                paperWeights: ['216g', '250g', '300g', '350g', '400g']
            },
            {
                name: '전단지',
                sizes: ['A4 (210x297)', 'A5 (148x210)', 'A3 (297x420)', 'B4 (257x364)', 'B5 (182x257)', '규격외'],
                paperTypes: ['아트지', '스노우지', '모조지'],
                paperWeights: ['80g', '100g', '120g', '150g', '180g', '250g']
            },
            {
                name: '스티커',
                sizes: ['90x55mm', '원형 50mm', '원형 40mm', '사각 50x50mm', '규격외'],
                paperTypes: ['강접 아트지', '모조지', '유포지', '투명데드롱', '은광데드롱', '크라프트지'],
                paperWeights: ['일반', '강접']
            },
            {
                name: '봉투',
                sizes: ['대봉투 (245x330)', '중봉투 (175x235)', '소봉투 (220x105)', '체크봉투'],
                paperTypes: ['모조지(백색)', '체크레자크', '줄레자크', '탄트지', '밍크지'],
                paperWeights: ['100g', '120g', '150g']
            },
            {
                name: '실사',
                sizes: ['500x90cm', '400x70cm', '60x180cm (배너)', '규격외'],
                paperTypes: ['현수막천', '부직포', '망사천', 'PET (배너)', '합성지(유포)'],
                paperWeights: ['일반']
            },
            {
                name: '카탈로그',
                sizes: ['A4 (210x297)', 'A5 (148x210)', 'B5 (182x257)', '규격외'],
                paperTypes: ['아트지', '스노우지', '모조지', '랑데뷰', '아르떼'],
                paperWeights: ['80g', '100g', '120g', '150g', '180g', '200g', '250g']
            },
            {
                name: '책자',
                sizes: ['A4 (210x297)', 'B5 (182x257)', 'A5 (148x210)', '190x260mm', '규격외'],
                paperTypes: ['모조지(백색)', '모조지(미색)', '아트지', '스노우지', '표지용 레자크지'],
                paperWeights: ['표지150g/내지80g', '표지180g/내지80g', '표지250g/내지80g', '80g', '100g', '120g', '150g']
            }
        ]
    },
    statusDefinitions: {
        definitions: [
            { key: 'QUOTE', label: '견적' },
            { key: 'RECEIVED', label: '접수' },
            { key: 'DESIGN', label: '디자인' },
            { key: 'PRINTING', label: '인쇄' },
            { key: 'POST_PROCESSING', label: '후가공' },
            { key: 'DELIVERY', label: '납품/완료' }
        ]
    },
    processingDefinitions: {
        definitions: ['유광코팅', '무광코팅', '오시', '미싱', '타공', '귀도리', '접지', '무선제본', '중철제본', '스프링제본', '박가공', '형압', '양면테이프', '도무송', '미싱(절취선)', '넘버링']
    },
    pricing: { baseLaborCost: 10000, printColorCost: 50, marginRate: 1.6 },
    companyInfo: { name: '원앤소프트 (EzPrintWork)' },
    roles: { roles: ["관리자", "디자이너", "인쇄기장", "후가공", "배송", "실장", "부장", "과장", "대리", "사원"] },
    nasConfig: { isEnabled: false, path: '' }
}];

function saveIfNotExist(fileName, data) {
    const fullPath = path.join(dbDir, fileName);
    if (!fs.existsSync(fullPath)) {
        fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');
        console.log("Created default " + fileName);
    }
}

saveIfNotExist('jobs.json', defaultJobs);
saveIfNotExist('settings.json', defaultSettings);
saveIfNotExist('staff.json', [
    { id: 'dev-admin', name: '관리자', role: 'admin', active: true, email: 'admin@ezprint.work', avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin', extensionNumber: '101' }
]);
saveIfNotExist('quotes.json', []);
saveIfNotExist('papers.json', []);
