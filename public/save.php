
/**
 * ======================================================================================
 * [EzImpo & EzPrintWork License Server - v9.6 Integrated]
 * 
 * 🚨🚨 [필독: 배포 방법] 🚨🚨
 * 코드 수정 후 반드시 우측 상단 [배포] -> [관리] -> [새 버전 만들기] -> [배포]를 클릭해야 적용됩니다.
 * 단순히 저장(Ctrl+S)만 해서는 라이브 서버에 반영되지 않습니다!
 * 
 * [Update v9.6]
 * 1. InstallLogs 컬럼 순서 수정: Contact 추가 (Timestamp | CompanyName | UserName | Contact | MachineID | ActionType | Result | IP | Version | ProductName)
 * ======================================================================================
 */

const SECURITY_TOKEN = "EzImpo_Secure_Handshake_Token_v3_X9Z"; 
const MAX_LOG_ROWS = 3000; 
const ARCHIVE_BATCH_SIZE = 2000; 
const TIME_ZONE = "GMT+9"; 
const DATE_FORMAT = "yyyy-MM-dd HH:mm:ss"; 

// [EzImpo Legacy Version Info]
const EZIMPO_LATEST_VERSION = "3.3.5"; 
const EZIMPO_DOWNLOAD_URL = "https://naver.me/Fm3SGglJ"; 

// [EzPrintWork Version Info]
const EZPRINT_LATEST_VERSION = "1.2.0";
const EZPRINT_DOWNLOAD_URL = ""; 

const UPDATE_NOTICE = "필수 보안 패치 및 성능 향상이 포함되어 있습니다."; 

function setup() {
  const doc = SpreadsheetApp.getActiveSpreadsheet();
  
  let sheet = doc.getSheetByName("Licenses");
  if (!sheet) {
    sheet = doc.insertSheet("Licenses");
    sheet.appendRow([
      "License Key",      // A
      "PIN",              // B
      "Company Name",     // C
      "Name / Position",  // D
      "Machine ID",       // E
      "Expiry Date",      // F
      "Status",           // G
      "Payment",          // H
      "Last Check-in",    // I
      "Last Reset",       // J
      "Product Name",     // K
      "Version",          // L
      "Product ID",       // M
      "Created At",       // N
      "Request ID",       // O
      "Contact Info",     // P
      "ID",               // Q 
      "Max Users"         // R 
    ]);
    sheet.getRange(1, 1, 1, 18).setFontWeight("bold").setBackground("#f3f4f6");
    sheet.setFrozenRows(1);
  }

  let logSheet = doc.getSheetByName("InstallLogs");
  if (!logSheet) {
    logSheet = doc.insertSheet("InstallLogs");
    // [Updated Column Order v9.6]
    logSheet.appendRow(["Timestamp", "CompanyName", "UserName", "Contact", "MachineID", "ActionType", "Result", "IP", "Version", "ProductName"]);
  }

  let reqSheet = doc.getSheetByName("PurchaseRequests");
  if (!reqSheet) {
    reqSheet = doc.insertSheet("PurchaseRequests");
    reqSheet.appendRow(["Timestamp", "Status", "CompanyName", "Depositor", "Contact", "MachineID", "Pending Product", "Version", "ID"]);
    reqSheet.getRange(1, 1, 1, 9).setFontWeight("bold").setBackground("#fce5cd");
    reqSheet.setFrozenRows(1);
  }
}

function doPost(e) {
  return handleRequest(e);
}

function doGet(e) {
  return ContentService.createTextOutput("EzSoft Integrated License Server v9.6 Running...");
}

function normalizeKey(key) {
    if (!key) return "";
    return String(key).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function normalizeHeader(h) {
    return String(h || "").toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
}

function formatTime(dateObj) {
    if (!dateObj) return "";
    return Utilities.formatDate(dateObj, TIME_ZONE, DATE_FORMAT);
}

function formatForSheet(value) {
    if (!value) return "";
    const strVal = String(value).trim();
    if (strVal.startsWith("'")) return strVal;
    return "'" + strVal;
}

function handleRequest(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000); 
  } catch (e) {
    return responseJSON({ result: "error", msg: "서버 혼잡. 잠시 후 시도해주세요." });
  }

  try {
    if (!e || !e.parameter) return responseJSON({ result: "error", msg: "잘못된 요청입니다." });

    const params = e.parameter;
    if (params.token !== SECURITY_TOKEN) {
      return responseJSON({ result: "error", msg: "보안 토큰 불일치. 앱 업데이트가 필요합니다." });
    }

    const action = params.action;
    
    const rawInputKey = String(params.key || "").trim();
    const inputKeyClean = normalizeKey(rawInputKey);
    const inputMachineId = String(params.machineId || "").trim();
    const inputCompany = String(params.company || "").trim();
    const inputUser = String(params.userName || "").trim(); 
    const inputProgName = String(params.progName || "").trim(); 
    const inputProgVer = String(params.progVer || "").trim();
    const inputExtraContact = String(params.contact || "").trim();

    const doc = SpreadsheetApp.getActiveSpreadsheet();
    
    let sheet = doc.getSheetByName("Licenses");
    let logSheet = doc.getSheetByName("InstallLogs");
    let reqSheet = doc.getSheetByName("PurchaseRequests");

    if (!sheet || !logSheet || !reqSheet) {
        setup();
        SpreadsheetApp.flush();
        sheet = doc.getSheetByName("Licenses");
        logSheet = doc.getSheetByName("InstallLogs");
        reqSheet = doc.getSheetByName("PurchaseRequests");
    }
    
    // [구매 요청 처리]
    if (action === "request_purchase") {
        const inputDepositor = String(params.depositor || "").trim();
        const finalContact = inputExtraContact || String(params.contact || "").trim();

        if (inputCompany === "" || inputDepositor === "" || finalContact === "") {
            return responseJSON({ result: "error", msg: "필수 정보(상호, 입금자, 연락처)가 누락되었습니다." });
        }
        
        const timeStr = formatTime(new Date());
        const uniqueId = "REQ-" + Utilities.formatDate(new Date(), TIME_ZONE, "yyyyMMdd") + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();

        reqSheet.appendRow([
            timeStr, 
            "대기중 (Pending)", 
            inputCompany, 
            inputDepositor, 
            formatForSheet(finalContact), 
            inputMachineId, 
            inputProgName || "EzPrintWork", 
            inputProgVer || "1.2.0", 
            uniqueId
        ]);
        
        // [Log Update] Order: Timestamp, Company, User(Depositor), Contact, MachineID, Action, Result, IP(Empty), Version, ProductName
        logToSheet(doc, logSheet, [ 
            timeStr, 
            inputCompany, 
            inputDepositor, 
            formatForSheet(finalContact), 
            inputMachineId, 
            "Purchase Req", 
            "Saved (ID:" + uniqueId + ")", 
            "", 
            inputProgVer, 
            inputProgName 
        ]);
        
        return responseJSON({ result: "success", msg: "구매 요청이 정상적으로 접수되었습니다. (ID: " + uniqueId + ")" });
    }

    const data = sheet.getDataRange().getDisplayValues();
    const headers = data[0];
    
    let colKey = -1, colPin = -1, colCompany = -1, colMachine = -1;
    let colNamePos = -1, colExpiry = -1, colStatus = -1, colLastReset = -1, colLastCheck = -1;
    let colContact = -1, colProduct = -1, colVersion = -1, colPayment = -1;
    let colCreatedAt = -1, colMaxUsers = -1;

    for (let i = 0; i < headers.length; i++) {
        const h = normalizeHeader(headers[i]);
        if (colKey === -1 && (h.includes("licensekey") || h === "key")) { if (!h.includes("pin")) colKey = i; }
        if (colPin === -1 && (h.includes("pin"))) colPin = i;
        if (colCompany === -1 && (h.includes("company"))) colCompany = i;
        if (colNamePos === -1 && (h.includes("name") || h.includes("user")) && !h.includes("company") && !h.includes("max")) colNamePos = i;
        if (colMachine === -1 && (h.includes("machine") || h.includes("device"))) colMachine = i;
        if (colExpiry === -1 && (h.includes("expiry"))) colExpiry = i;
        if (colStatus === -1 && (h.includes("status"))) colStatus = i;
        if (colLastReset === -1 && (h.includes("reset"))) colLastReset = i;
        if (colLastCheck === -1 && (h.includes("check"))) colLastCheck = i;
        if (colContact === -1 && (h.includes("contact"))) colContact = i;
        if (colPayment === -1 && (h.includes("payment"))) colPayment = i;
        if (colProduct === -1 && (h.includes("product") || h.includes("program")) && !h.includes("id")) colProduct = i;
        if (colVersion === -1 && (h.includes("version") || h.includes("ver"))) colVersion = i;
        if (colCreatedAt === -1 && (h.includes("created"))) colCreatedAt = i;
        if (colMaxUsers === -1 && h.includes("max") && h.includes("user")) colMaxUsers = i;
    }

    if (colKey === -1) colKey = 0; 
    if (colPin === -1) colPin = 1;
    if (colCompany === -1) colCompany = 2;
    if (colMachine === -1) colMachine = 4;

    const isEzPrintWork = (inputProgName && inputProgName.toUpperCase().includes("EZPRINT"));
    const currentLatestVer = isEzPrintWork ? EZPRINT_LATEST_VERSION : EZIMPO_LATEST_VERSION;
    const currentDownloadUrl = isEzPrintWork ? EZPRINT_DOWNLOAD_URL : EZIMPO_DOWNLOAD_URL;

    // [ACTION: checkStatusAndVersion]
    if (action === "checkStatusAndVersion") {
        let licenseValid = false;
        let message = "";
        let foundRowIndex = -1;
        let maxUsers = 1;
        
        for (let i = 1; i < data.length; i++) {
            const rowKeyRaw = String(data[i][colKey]);
            const rowKeyClean = normalizeKey(rowKeyRaw);
            
            if (rowKeyClean === inputKeyClean && inputKeyClean.length > 3) {
                const rowMachine = (colMachine !== -1) ? String(data[i][colMachine]).trim() : "";
                
                // Allow "TEST" or "TRIAL" logic
                if (rowKeyClean === "TEST" || rowKeyClean === "TRIAL") {
                    if (rowMachine === inputMachineId) { foundRowIndex = i; break; }
                } else {
                    if (rowMachine === inputMachineId) { foundRowIndex = i; break; }
                    if (rowMachine === "") { foundRowIndex = i; break; }
                }
            }
        }

        if (foundRowIndex !== -1) {
            const rowKeyClean = normalizeKey(String(data[foundRowIndex][colKey]));

            if (rowKeyClean !== "TEST" && rowKeyClean !== "TRIAL" && colProduct !== -1) {
                const registeredProduct = String(data[foundRowIndex][colProduct] || "").replace(/^'/, '').trim();
                if (registeredProduct !== "" && inputProgName !== "" && registeredProduct.toUpperCase() !== inputProgName.toUpperCase()) {
                    licenseValid = false;
                    message = "이 라이선스는 '" + registeredProduct + "' 전용입니다.";
                    return responseJSON({ result: "success", licenseValid: false, message: message });
                }
            }

            if (colMaxUsers !== -1) {
                const val = data[foundRowIndex][colMaxUsers];
                if (val && !isNaN(val)) maxUsers = parseInt(val);
            }

            if (rowKeyClean === "TEST" || rowKeyClean === "TRIAL") {
                const rowExpiry = (colExpiry !== -1) ? data[foundRowIndex][colExpiry] : "";
                if (rowExpiry) {
                    const expDate = new Date(rowExpiry);
                    if (!isNaN(expDate.getTime()) && new Date().getTime() > expDate.getTime()) {
                        licenseValid = false; 
                        message = "테스트 기간이 만료되었습니다.";
                    } else {
                        licenseValid = true;
                    }
                } else {
                    licenseValid = true; 
                }
            } else {
                const rowMachine = (colMachine !== -1) ? String(data[foundRowIndex][colMachine]).trim() : "";
                if (rowMachine === inputMachineId) {
                    licenseValid = true;
                }
            }

            if (licenseValid) {
                if (colLastCheck !== -1) {
                    const timeStr = formatTime(new Date());
                    sheet.getRange(foundRowIndex + 1, colLastCheck + 1).setValue(timeStr);
                }
                if (colProduct !== -1 && inputProgName) {
                    sheet.getRange(foundRowIndex + 1, colProduct + 1).setValue(formatForSheet(inputProgName));
                }
            }
        }
        
        return responseJSON({ 
            result: "success",
            licenseValid: licenseValid,
            message: message,
            latestVersion: currentLatestVer, 
            downloadUrl: currentDownloadUrl,
            notice: UPDATE_NOTICE,
            data: { maxUsers: maxUsers }
        });
    }

    // [ACTION: verify]
    if (action === "verify") {
      const inputPin = String(params.pin || "").trim();
      const timeStr = formatTime(new Date());
      let maxUsers = 1;
      
      // TRIAL / TEST Key Logic
      if (inputKeyClean === "TRIAL" || inputKeyClean === "TEST") {
          let foundRowIndex = -1;
          for (let i = 1; i < data.length; i++) {
              const rowKey = normalizeKey(String(data[i][colKey]));
              const rowMachine = String(data[i][colMachine]).trim();
              
              // Check for existing TRIAL or TEST entry for this machine
              if ((rowKey === "TRIAL" || rowKey === "TEST") && rowMachine === inputMachineId) { 
                  foundRowIndex = i; 
                  break; 
              }
          }

          if (foundRowIndex !== -1) {
              // Existing trial found
              const rowExpiry = (colExpiry !== -1) ? data[foundRowIndex][colExpiry] : "";
              let expiryTs = null;
              if (rowExpiry) {
                  const expDate = new Date(rowExpiry);
                  if (!isNaN(expDate.getTime())) {
                      expiryTs = expDate.getTime();
                      if (new Date().getTime() > expiryTs) {
                          return responseJSON({ result: "error", msg: "체험판 기간이 만료되었습니다." });
                      }
                  }
              }
              if (colProduct !== -1 && inputProgName) sheet.getRange(foundRowIndex + 1, colProduct + 1).setValue(formatForSheet(inputProgName));
              
              // [Log Update]
              logToSheet(doc, logSheet, [
                  timeStr, 
                  inputCompany, 
                  inputUser, 
                  formatForSheet(inputExtraContact), // Contact Added
                  inputMachineId, 
                  "Verify(TRIAL)", 
                  "Success", 
                  "", 
                  inputProgVer, 
                  inputProgName
              ]);
              
              return responseJSON({ result: "success", data: { company: inputCompany, expiryDate: expiryTs, key: "TRIAL", maxUsers: 1 } });
          } 
          else {
              // New trial registration
              const now = new Date();
              const expiryDate = new Date(now.getTime() + (50 * 24 * 60 * 60 * 1000));
              const expiryStr = formatTime(expiryDate);
              
              const newRow = new Array(headers.length).fill("");
              if (colKey !== -1) newRow[colKey] = "TRIAL"; // Use TRIAL as the standard key
              if (colPin !== -1) newRow[colPin] = formatForSheet(inputPin);
              if (colCompany !== -1) newRow[colCompany] = formatForSheet(inputCompany);
              if (colNamePos !== -1) newRow[colNamePos] = formatForSheet(inputUser);
              if (colMachine !== -1) newRow[colMachine] = inputMachineId;
              if (colExpiry !== -1) newRow[colExpiry] = expiryStr;
              if (colStatus !== -1) newRow[colStatus] = "ACTIVE";
              if (colLastCheck !== -1) newRow[colLastCheck] = timeStr;
              if (colProduct !== -1) newRow[colProduct] = formatForSheet(inputProgName);
              if (colVersion !== -1) newRow[colVersion] = formatForSheet(inputProgVer);
              if (colCreatedAt !== -1) newRow[colCreatedAt] = timeStr;
              if (colContact !== -1) newRow[colContact] = formatForSheet(inputExtraContact);
              if (colPayment !== -1) newRow[colPayment] = "'무료사용";
              if (colMaxUsers !== -1) newRow[colMaxUsers] = "1";

              sheet.appendRow(newRow);
              if (colPin !== -1) sheet.getRange(sheet.getLastRow(), colPin + 1).setNumberFormat("@");

              // [Log Update]
              logToSheet(doc, logSheet, [
                  timeStr, 
                  inputCompany, 
                  inputUser, 
                  formatForSheet(inputExtraContact), // Contact Added
                  inputMachineId, 
                  "Verify(New TRIAL)", 
                  "Success", 
                  "", 
                  inputProgVer, 
                  inputProgName
              ]);
              
              return responseJSON({ result: "success", data: { company: inputCompany, expiryDate: expiryDate.getTime(), key: "TRIAL", maxUsers: 1 } });
          }
      }
      
      // Regular Key Logic
      for (let i = 1; i < data.length; i++) {
        const rowKeyRaw = String(data[i][colKey]);
        const rowKeyClean = normalizeKey(rowKeyRaw);
        
        if (rowKeyClean === inputKeyClean && inputKeyClean.length > 5) {
          let rowCompany = (colCompany !== -1) ? String(data[i][colCompany]).trim() : "";
          const rowPin = String(data[i][colPin]).trim(); 
          const rowMachine = (colMachine !== -1) ? String(data[i][colMachine]).trim() : "";
          const rowExpiry = (colExpiry !== -1) ? data[i][colExpiry] : "";
          const rowStatus = (colStatus !== -1) ? data[i][colStatus] : "";
          const rowLastReset = (colLastReset !== -1) ? data[i][colLastReset] : "";
          
          if (colProduct !== -1) {
              const registeredProduct = String(data[i][colProduct] || "").replace(/^'/, '').trim();
              if (registeredProduct !== "" && inputProgName !== "") {
                  if (registeredProduct.toUpperCase() !== inputProgName.toUpperCase()) {
                      return responseJSON({ result: "error", msg: `본 키는 [${registeredProduct}] 전용입니다. 현재 프로그램(${inputProgName})에서는 사용할 수 없습니다.` });
                  }
              }
          }

          if (colMaxUsers !== -1) {
              const val = data[i][colMaxUsers];
              if (val && !isNaN(val)) maxUsers = parseInt(val);
          }

          if (rowPin === "") {
             if (inputPin.length < 4) return responseJSON({ result: "error", msg: "PIN은 4자리 이상이어야 합니다." });
             sheet.getRange(i + 1, colPin + 1).setNumberFormat("@").setValue(formatForSheet(inputPin));
          } else {
             if (rowPin !== inputPin) return responseJSON({ result: "error", msg: "PIN 불일치." });
          }
          if (rowStatus === "REVOKED") return responseJSON({ result: "error", msg: "정지된 라이선스." });

          if (colCompany !== -1 && inputCompany && inputCompany !== rowCompany) { sheet.getRange(i + 1, colCompany + 1).setValue(formatForSheet(inputCompany)); rowCompany = inputCompany; }
          if (colNamePos !== -1 && inputUser) { sheet.getRange(i + 1, colNamePos + 1).setValue(formatForSheet(inputUser)); }
          if (colContact !== -1 && inputExtraContact) { sheet.getRange(i + 1, colContact + 1).setValue(formatForSheet(inputExtraContact)); }
          
          if (colProduct !== -1 && inputProgName) {
              sheet.getRange(i + 1, colProduct + 1).setValue(formatForSheet(inputProgName)); 
          }
          if (colVersion !== -1 && inputProgVer) sheet.getRange(i + 1, colVersion + 1).setValue(formatForSheet(inputProgVer));

          if (colMachine !== -1) {
              if (rowMachine !== "" && rowMachine !== inputMachineId) {
                 const now = new Date();
                 const resetTime = rowLastReset ? new Date(rowLastReset) : new Date(0); 
                 const oneDay = 24 * 60 * 60 * 1000; 
                 if (now.getTime() - resetTime.getTime() < oneDay) {
                     return responseJSON({ result: "error", msg: `기기 변경 24시간 제한.` });
                 } else {
                     sheet.getRange(i + 1, colMachine + 1).setValue(inputMachineId);
                     if (colLastReset !== -1) sheet.getRange(i + 1, colLastReset + 1).setValue(timeStr); 
                 }
              }
              else if (rowMachine === "") {
                 sheet.getRange(i + 1, colMachine + 1).setValue(inputMachineId);
                 if (colLastReset !== -1) sheet.getRange(i + 1, colLastReset + 1).setValue(timeStr); 
                 if (colLastCheck !== -1) sheet.getRange(i + 1, colLastCheck + 1).setValue(timeStr); 
                 if (colCreatedAt !== -1) {
                     const currentCreated = String(data[i][colCreatedAt]).trim();
                     if (!currentCreated) sheet.getRange(i + 1, colCreatedAt + 1).setValue(timeStr);
                 }
              }
          }

          let expiryTs = null;
          if (rowExpiry) { const expDate = new Date(rowExpiry); if (!isNaN(expDate.getTime())) { expiryTs = expDate.getTime(); if (new Date().getTime() > expiryTs) return responseJSON({ result: "error", msg: "기간 만료" }); } }

          if (colStatus !== -1 && rowStatus !== "ACTIVE") sheet.getRange(i + 1, colStatus + 1).setValue("ACTIVE");
          if (colLastCheck !== -1) sheet.getRange(i + 1, colLastCheck + 1).setValue(timeStr);

          // [Log Update]
          logToSheet(doc, logSheet, [
              timeStr, 
              rowCompany, 
              inputUser, 
              formatForSheet(inputExtraContact), // Contact Added
              inputMachineId, 
              "Verify(Active)", 
              "Success", 
              "", 
              inputProgVer, 
              inputProgName
          ]);

          return responseJSON({ result: "success", data: { company: rowCompany, expiryDate: expiryTs, key: rowKeyRaw, maxUsers: maxUsers } });
        }
      }
      return responseJSON({ result: "error", msg: "유효하지 않은 라이선스 키." });
    }

    return responseJSON({ result: "error", msg: "알 수 없는 요청." });

  } catch (e) {
    return responseJSON({ result: "error", msg: "서버 오류: " + e.toString() });
  } finally {
    lock.releaseLock();
  }
}

function logToSheet(doc, sheet, rowData) {
  if (sheet) {
    try {
      sheet.appendRow(rowData);
      if (sheet.getLastRow() > MAX_LOG_ROWS) {
        archiveOldLogs(doc, sheet);
      }
    } catch(e) {}
  }
}

function archiveOldLogs(doc, sourceSheet) { 
    const timestamp = Utilities.formatDate(new Date(), "GMT+9", "yyyyMMdd_HHmmss"); 
    const archiveName = "InstallLogs_Archive_" + timestamp; 
    let archiveSheet = doc.insertSheet(archiveName); 
    const headers = sourceSheet.getRange(1, 1, 1, sourceSheet.getLastColumn()).getValues(); 
    archiveSheet.getRange(1, 1, 1, sourceSheet.getLastColumn()).setValues(headers); 
    
    const dataToMove = sourceSheet.getRange(2, 1, ARCHIVE_BATCH_SIZE, sourceSheet.getLastColumn()); 
    const values = dataToMove.getValues(); 
    
    archiveSheet.getRange(2, 1, ARCHIVE_BATCH_SIZE, sourceSheet.getLastColumn()).setValues(values); 
    sourceSheet.deleteRows(2, ARCHIVE_BATCH_SIZE); 
}

function responseJSON(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
