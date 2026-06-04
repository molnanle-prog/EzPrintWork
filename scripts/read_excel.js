const xlsx = require('xlsx');

try {
    const workbook = xlsx.readFile('C:\\Users\\CEO\\Desktop\\원앤소프트거래처_0604.xlsx');
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { defval: '' });
    
    console.log("Total rows:", data.length);
    console.log("Columns:", Object.keys(data[0]));
    console.log("First row data:", data[0]);
} catch (e) {
    console.error("Error reading file:", e);
}
