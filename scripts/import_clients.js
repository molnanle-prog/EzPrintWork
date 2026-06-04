const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const os = require('os');

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

try {
    const excelPath = 'C:\\Users\\CEO\\Desktop\\원앤소프트거래처_0604.xlsx';
    console.log("Reading Excel from:", excelPath);
    const workbook = xlsx.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { defval: '' });
    
    console.log(`Parsed ${data.length} rows.`);

    const clients = data.map(row => {
        const name = row['거래처명'] || row['전화번호'] || '이름 없음';
        const address = [row['주소'], row['상세주소']].filter(Boolean).join(' ');
        const memo = [row['참고사항1'], row['참고사항2']].filter(Boolean).join('\n');

        return {
            id: generateId(),
            name: name,
            contactPerson: row['대표자명'] || '',
            phone: row['전화번호'] || '',
            mobile: row['휴대번호'] || '',
            email: row['이메일'] || '',
            fax: row['팩스번호'] || '',
            address: address,
            businessNumber: row['사업자NO'] || '',
            businessType: row['업태'] || '',
            businessItem: row['종목'] || '',
            memo: memo,
            createdAt: row['등록일자'] ? new Date(row['등록일자']).toISOString() : new Date().toISOString()
        };
    });

    const docsPath = path.join(os.homedir(), 'Documents');
    const dbDir = path.join(docsPath, 'EzPrintWork_DB');
    
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    const clientsFilePath = path.join(dbDir, 'clients.json');
    let existingClients = [];
    
    if (fs.existsSync(clientsFilePath)) {
        const existingData = fs.readFileSync(clientsFilePath, 'utf8');
        try {
            existingClients = JSON.parse(existingData);
        } catch(e) {}
    }

    // Merge or overwrite (we'll just append for now, assuming initial import)
    const finalClients = [...existingClients, ...clients];
    
    fs.writeFileSync(clientsFilePath, JSON.stringify(finalClients, null, 2), 'utf8');
    console.log(`Successfully imported ${clients.length} clients into ${clientsFilePath}`);
} catch (e) {
    console.error("Error during import:", e);
}
