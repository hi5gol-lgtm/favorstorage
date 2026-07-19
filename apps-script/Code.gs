/**
 * 페이버주얼리 공급처 상품등록 툴 — Apps Script API 레이어
 *
 * 배포 방법:
 * 1. https://script.google.com 에서 새 프로젝트 생성 (특정 스프레드시트에 종속시키지 말 것 —
 *    독립 프로젝트로 만들어서 두 스프레드시트를 모두 openById로 열어야 함)
 * 2. 이 파일 내용을 Code.gs에 붙여넣기
 * 3. 상단 CONFIG 값 채우기 (스프레드시트 ID는 이미 기입되어 있음, DRIVE_FOLDER_ID / API_KEY만 채우면 됨)
 * 4. 배포 > 새 배포 > 유형: 웹 앱
 *    - 실행 계정: 나(담당자 본인 계정)
 *    - 액세스 권한: 아무나 (Anyone) — Vercel 서버가 호출하므로 "Google 계정 필요"로 하면 안 됨
 * 5. 배포 후 나오는 웹 앱 URL(.../exec)을 Vercel 환경변수 APPS_SCRIPT_URL 에 넣기
 * 6. API_KEY 값을 Vercel 환경변수 APPS_SCRIPT_API_KEY 에도 동일하게 넣기
 * 7. 최초 1회 setup() 함수를 스크립트 에디터에서 직접 실행 → 헤더 행 자동 생성
 */

// ===== CONFIG =====
var CONFIG = {
  INTERNAL_SHEET_ID: '1KahNqrN8-la1RCeoxtC2zVXmND5jIDAHCwXu0CJ7dIQ',
  SELLER_SHEET_ID: '1RJ1Lve-RCWL7yE6crGTpNAZMRf63zhVm8JqppGGKnT0',
  DRIVE_FOLDER_ID: '1teKo4hH6ptwLRm5dDXedWTuzNv2saSlb',
  API_KEY: 'sppJl4-i3YvSVryjmboR0xAD4z2SiLil',
  PRODUCT_SHEET_NAME: '상품',
  VENDOR_SHEET_NAME: '거래처목록',
  SELLER_SHEET_NAME: '상품',
  IMAGE_ROW_HEIGHT: 90,
  IMAGE_COL_WIDTH: 90
};

var INTERNAL_HEADERS = ['품번', '상품명', '식별코드', '거래처', '원가', '판매가', '재고', '이미지', '이미지URL', '등록일시'];
var SELLER_HEADERS = ['품번', '상품명', '판매가', '재고', '이미지', '상품설명'];

// ===== ENTRY POINTS =====

function doGet(e) {
  try {
    var action = e.parameter.action;
    if (!checkKey_(e.parameter.apiKey)) return jsonOut_({ ok: false, error: 'unauthorized' });

    if (action === 'vendors') return jsonOut_({ ok: true, vendors: getVendors_() });
    if (action === 'checkDuplicate') return jsonOut_(checkDuplicate_(e.parameter.code));
    if (action === 'list') return jsonOut_({ ok: true, items: listProducts_(Number(e.parameter.limit) || 100) });

    return jsonOut_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (!checkKey_(body.apiKey)) return jsonOut_({ ok: false, error: 'unauthorized' });

    if (body.action === 'save') return jsonOut_(saveProduct_(body));
    if (body.action === 'addVendor') return jsonOut_({ ok: true, vendors: addVendorIfMissing_(body.vendor) });
    if (body.action === 'updateImage') return jsonOut_(updateImage_(body));
    if (body.action === 'delete') return jsonOut_(deleteProduct_(body));

    return jsonOut_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

// ===== SETUP (최초 1회 수동 실행) =====

function setup() {
  var internalSs = SpreadsheetApp.openById(CONFIG.INTERNAL_SHEET_ID);
  var productSheet = internalSs.getSheetByName(CONFIG.PRODUCT_SHEET_NAME) || internalSs.insertSheet(CONFIG.PRODUCT_SHEET_NAME);
  ensureHeader_(productSheet, INTERNAL_HEADERS);

  var vendorSheet = internalSs.getSheetByName(CONFIG.VENDOR_SHEET_NAME) || internalSs.insertSheet(CONFIG.VENDOR_SHEET_NAME);
  ensureHeader_(vendorSheet, ['거래처명']);

  // K/L열 배수 수식 복구 + 품번 빈 유령 행 삭제 (몇 번을 다시 실행해도 안전함)
  fixInternalMultiplierColumns_();
  cleanupBlankInternalRows_();
  ensureDescriptionColumn_(productSheet);

  var sellerSs = SpreadsheetApp.openById(CONFIG.SELLER_SHEET_ID);
  var sellerSheet = sellerSs.getSheetByName(CONFIG.SELLER_SHEET_NAME) || sellerSs.insertSheet(CONFIG.SELLER_SHEET_NAME);
  ensureHeader_(sellerSheet, SELLER_HEADERS);
  ensureColumnHeader_(sellerSheet, 6, '상품설명');

  Logger.log('setup 완료');
}

function ensureHeader_(sheet, headers) {
  var firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var hasHeader = firstRow.some(function (v) { return String(v).trim() !== ''; });
  if (!hasHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

// 내부용 시트 K열: 원가 대비 판매가 배수 (3.5배 표준에서 벗어난 경우만 표시)
// ARRAYFORMULA가 열 전체를 스스로 채우므로, 이 열에는 절대 다른 값을 개별 setValue로 쓰면 안 됨
// (수식과 충돌해서 재계산 시 덮어써짐 — 상품설명이 M열로 분리된 이유)
function ensureMultiplierColumn_(sheet) {
  var header = sheet.getRange(1, 11).getValue();
  if (String(header).trim() === '') {
    sheet.getRange(1, 11).setValue('배수');
    sheet.getRange(2, 11).setFormula(
      '=ARRAYFORMULA(IF(E2:E="","",IF(E2:E=0,"",IF(ROUND(F2:F/E2:E,2)=3.5,"",ROUND(F2:F/E2:E,2)))))'
    );
  }
}

// 내부용 시트 M열: 상품설명 (K열 배수 수식과 겹치지 않도록 별도 열 사용)
function ensureDescriptionColumn_(sheet) {
  var header = sheet.getRange(1, 13).getValue();
  if (String(header).trim() === '') {
    sheet.getRange(1, 13).setValue('상품설명');
  }
}

// 시트의 특정 헤더 칸이 비어있을 때만 라벨을 채움 (이미 데이터가 있는 기존 시트에 새 컬럼을 추가할 때 사용)
function ensureColumnHeader_(sheet, col, label) {
  var header = sheet.getRange(1, col).getValue();
  if (String(header).trim() === '') {
    sheet.getRange(1, col).setValue(label);
  }
}

// 일회성 정리: 이전 배포에서 상품설명을 K/L열(배수 수식 영역)에 잘못 쓴 흔적을 지우고
// 배수 수식을 K열 하나로 복구한다. Apps Script 에디터에서 이 함수를 한 번 수동 실행할 것.
function fixInternalMultiplierColumns_() {
  var ss = SpreadsheetApp.openById(CONFIG.INTERNAL_SHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.PRODUCT_SHEET_NAME);
  if (!sheet) return;
  var maxRows = sheet.getMaxRows();
  sheet.getRange(1, 11, maxRows, 2).clearContent(); // K, L열 전체 초기화
  ensureMultiplierColumn_(sheet);
  Logger.log('K/L열 정리 완료');
}

// A열(품번)이 비어있는 행 중 실제 마지막으로 데이터가 있는 행 번호를 반환.
// sheet.getLastRow()는 K열 ARRAYFORMULA의 스필 범위까지 "데이터 있음"으로 잡아서
// 시트 끝까지(약 1000행) 부풀려지는 문제가 있어 대신 사용한다.
function getLastDataRow_(sheet) {
  var maxRows = sheet.getMaxRows();
  if (maxRows < 2) return 1;
  var codes = sheet.getRange(2, 1, maxRows - 1, 1).getValues();
  for (var i = codes.length - 1; i >= 0; i--) {
    if (String(codes[i][0]).trim() !== '') return i + 2;
  }
  return 1;
}

// 일회성 정리: K열 ARRAYFORMULA 버블로 인해 저장 위치가 밀리면서 생긴,
// A열(품번)이 빈 행들을 전부 삭제한다. Apps Script 에디터에서 한 번 수동 실행할 것.
function cleanupBlankInternalRows_() {
  var ss = SpreadsheetApp.openById(CONFIG.INTERNAL_SHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.PRODUCT_SHEET_NAME);
  if (!sheet) return;
  var maxRows = sheet.getMaxRows();
  var codes = sheet.getRange(2, 1, maxRows - 1, 1).getValues();
  var deleted = 0;
  var i = codes.length - 1;
  // 연속된 빈 행 구간을 찾아 deleteRows로 한 번에 삭제 (deleteRow를 개별 호출하면
  // 900번 가까운 API 호출이 발생해 몇 분 넘게 걸리고 6분 실행 제한에 걸릴 수 있음)
  while (i >= 0) {
    if (String(codes[i][0]).trim() === '') {
      var end = i;
      while (i >= 0 && String(codes[i][0]).trim() === '') i--;
      var start = i + 1;
      var count = end - start + 1;
      sheet.deleteRows(start + 2, count);
      deleted += count;
    } else {
      i--;
    }
  }
  Logger.log('빈 행 ' + deleted + '개 삭제 완료');
}

// ===== VENDORS =====

function getVendors_() {
  var ss = SpreadsheetApp.openById(CONFIG.INTERNAL_SHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.VENDOR_SHEET_NAME);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  return values.map(function (r) { return String(r[0]).trim(); }).filter(function (v) { return v !== ''; });
}

function addVendorIfMissing_(vendorName) {
  var name = String(vendorName || '').trim();
  if (!name) return getVendors_();
  var ss = SpreadsheetApp.openById(CONFIG.INTERNAL_SHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.VENDOR_SHEET_NAME) || ss.insertSheet(CONFIG.VENDOR_SHEET_NAME);
  ensureHeader_(sheet, ['거래처명']);
  var existing = getVendors_();
  if (existing.indexOf(name) === -1) {
    sheet.appendRow([name]);
    existing.push(name);
  }
  return existing;
}

// ===== DUPLICATE CHECK =====

function checkDuplicate_(code) {
  code = String(code || '').trim();
  if (!code) return { ok: true, exists: false };
  var ss = SpreadsheetApp.openById(CONFIG.INTERNAL_SHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.PRODUCT_SHEET_NAME);
  if (!sheet) return { ok: true, exists: false };
  var lastRow = getLastDataRow_(sheet);
  if (lastRow < 2) return { ok: true, exists: false };
  var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues(); // 품번, 상품명
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === code) {
      return { ok: true, exists: true, name: values[i][1] };
    }
  }
  return { ok: true, exists: false };
}

// ===== LIST =====

function listProducts_(limit) {
  var ss = SpreadsheetApp.openById(CONFIG.INTERNAL_SHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.PRODUCT_SHEET_NAME);
  if (!sheet) return [];
  var lastRow = getLastDataRow_(sheet);
  if (lastRow < 2) return [];
  var startRow = Math.max(2, lastRow - limit + 1);
  var numRows = lastRow - startRow + 1;
  // A 품번, B 상품명, C 식별코드, D 거래처, E 원가, F 판매가, G 재고, H 이미지, I 이미지URL, J 등록일시, K 배수, M 상품설명
  var values = sheet.getRange(startRow, 1, numRows, 13).getValues();
  var items = [];
  for (var i = values.length - 1; i >= 0; i--) {
    var row = values[i];
    items.push({
      row: startRow + i,
      code: row[0],
      name: row[1],
      internalCode: row[2],
      vendor: row[3],
      cost: row[4],
      price: row[5],
      stock: row[6],
      imageUrl: row[8] || '',
      description: row[12] || ''
    });
  }
  return items;
}

// ===== SAVE =====

function saveProduct_(body) {
  var productCode = String(body.productCode || '').trim();
  var productName = String(body.productName || '').trim();
  var internalCode = String(body.internalCode || '').trim();
  var vendor = String(body.vendor || '').trim();
  var cost = Number(body.cost) || 0;
  var price = Number(body.price) || 0;
  var stock = Number(body.stock) || 0;
  var productDescription = String(body.productDescription || '').trim();

  if (!productCode || !productName) {
    return { ok: false, error: '품번/상품명은 필수입니다.' };
  }

  // 거래처 목록에 없으면 자동 추가
  if (vendor) addVendorIfMissing_(vendor);

  var imageUrl = '';
  var driveFile = null;
  if (body.imageBase64) {
    driveFile = saveImageToDrive_(body.imageBase64, body.imageMimeType || 'image/jpeg', productCode);
    imageUrl = driveFile.url;
  }

  var now = new Date();

  // ---- 내부용 시트 ----
  var internalSs = SpreadsheetApp.openById(CONFIG.INTERNAL_SHEET_ID);
  var internalSheet = internalSs.getSheetByName(CONFIG.PRODUCT_SHEET_NAME) || internalSs.insertSheet(CONFIG.PRODUCT_SHEET_NAME);
  ensureHeader_(internalSheet, INTERNAL_HEADERS);
  ensureMultiplierColumn_(internalSheet);
  ensureDescriptionColumn_(internalSheet);
  var internalRow = getLastDataRow_(internalSheet) + 1;
  internalSheet.getRange(internalRow, 1, 1, 7).setValues([[productCode, productName, internalCode, vendor, cost, price, stock]]);
  internalSheet.getRange(internalRow, 9).setValue(imageUrl);
  internalSheet.getRange(internalRow, 10).setValue(now);
  internalSheet.getRange(internalRow, 13).setValue(productDescription);
  if (imageUrl) setCellImage_(internalSheet, internalRow, 8, imageUrl);
  internalSheet.setRowHeight(internalRow, CONFIG.IMAGE_ROW_HEIGHT);
  internalSheet.setColumnWidth(8, CONFIG.IMAGE_COL_WIDTH);

  // ---- 셀러용 시트 ----
  var sellerSs = SpreadsheetApp.openById(CONFIG.SELLER_SHEET_ID);
  var sellerSheet = sellerSs.getSheetByName(CONFIG.SELLER_SHEET_NAME) || sellerSs.insertSheet(CONFIG.SELLER_SHEET_NAME);
  ensureHeader_(sellerSheet, SELLER_HEADERS);
  ensureColumnHeader_(sellerSheet, 6, '상품설명');
  var sellerRow = sellerSheet.getLastRow() + 1;
  sellerSheet.getRange(sellerRow, 1, 1, 4).setValues([[productCode, productName, price, stock]]);
  sellerSheet.getRange(sellerRow, 6).setValue(productDescription);
  if (imageUrl) setCellImage_(sellerSheet, sellerRow, 5, imageUrl);
  sellerSheet.setRowHeight(sellerRow, CONFIG.IMAGE_ROW_HEIGHT);
  sellerSheet.setColumnWidth(5, CONFIG.IMAGE_COL_WIDTH);

  return { ok: true };
}

// ===== UPDATE IMAGE (기존 행에 사진만 추가/교체) =====

function updateImage_(body) {
  var productCode = String(body.productCode || '').trim();
  var row = Number(body.row) || 0;
  if (!productCode || !row) return { ok: false, error: 'row/productCode가 필요합니다.' };
  if (!body.imageBase64) return { ok: false, error: '이미지가 없습니다.' };

  var internalSs = SpreadsheetApp.openById(CONFIG.INTERNAL_SHEET_ID);
  var internalSheet = internalSs.getSheetByName(CONFIG.PRODUCT_SHEET_NAME);
  if (!internalSheet) return { ok: false, error: '내부용 시트를 찾을 수 없습니다.' };

  var rowCode = String(internalSheet.getRange(row, 1).getValue()).trim();
  if (rowCode !== productCode) {
    return { ok: false, error: '품번이 일치하지 않습니다. (해당 행이 이미 변경되었을 수 있습니다)' };
  }

  var driveFile = saveImageToDrive_(body.imageBase64, body.imageMimeType || 'image/jpeg', productCode);

  internalSheet.getRange(row, 9).setValue(driveFile.url);
  setCellImage_(internalSheet, row, 8, driveFile.url);
  internalSheet.setRowHeight(row, CONFIG.IMAGE_ROW_HEIGHT);
  internalSheet.setColumnWidth(8, CONFIG.IMAGE_COL_WIDTH);

  // 셀러용 시트: 같은 품번의 가장 마지막(최근) 행을 찾아 갱신
  var sellerSs = SpreadsheetApp.openById(CONFIG.SELLER_SHEET_ID);
  var sellerSheet = sellerSs.getSheetByName(CONFIG.SELLER_SHEET_NAME);
  if (sellerSheet) {
    var lastRow = sellerSheet.getLastRow();
    if (lastRow >= 2) {
      var codes = sellerSheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = codes.length - 1; i >= 0; i--) {
        if (String(codes[i][0]).trim() === productCode) {
          var sellerRow = i + 2;
          setCellImage_(sellerSheet, sellerRow, 5, driveFile.url);
          sellerSheet.setRowHeight(sellerRow, CONFIG.IMAGE_ROW_HEIGHT);
          sellerSheet.setColumnWidth(5, CONFIG.IMAGE_COL_WIDTH);
          break;
        }
      }
    }
  }

  return { ok: true, imageUrl: driveFile.url };
}

// ===== DELETE =====

function deleteProduct_(body) {
  var productCode = String(body.productCode || '').trim();
  var row = Number(body.row) || 0;
  if (!productCode || !row) return { ok: false, error: 'row/productCode가 필요합니다.' };

  var internalSs = SpreadsheetApp.openById(CONFIG.INTERNAL_SHEET_ID);
  var internalSheet = internalSs.getSheetByName(CONFIG.PRODUCT_SHEET_NAME);
  if (!internalSheet) return { ok: false, error: '내부용 시트를 찾을 수 없습니다.' };

  var rowCode = String(internalSheet.getRange(row, 1).getValue()).trim();
  if (rowCode !== productCode) {
    return { ok: false, error: '품번이 일치하지 않습니다. (해당 행이 이미 변경되었을 수 있습니다. 새로고침 후 다시 시도해주세요)' };
  }

  var imageUrl = String(internalSheet.getRange(row, 9).getValue() || '');
  internalSheet.deleteRow(row);
  deleteDriveFileByUrl_(imageUrl);

  // 셀러용 시트: 같은 품번의 가장 마지막(최근) 행 삭제
  var sellerSs = SpreadsheetApp.openById(CONFIG.SELLER_SHEET_ID);
  var sellerSheet = sellerSs.getSheetByName(CONFIG.SELLER_SHEET_NAME);
  if (sellerSheet) {
    var lastRow = sellerSheet.getLastRow();
    if (lastRow >= 2) {
      var codes = sellerSheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = codes.length - 1; i >= 0; i--) {
        if (String(codes[i][0]).trim() === productCode) {
          sellerSheet.deleteRow(i + 2);
          break;
        }
      }
    }
  }

  return { ok: true };
}

function deleteDriveFileByUrl_(url) {
  try {
    if (!url) return;
    var match = String(url).match(/[?&]id=([a-zA-Z0-9_-]+)/) || String(url).match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) return;
    DriveApp.getFileById(match[1]).setTrashed(true);
  } catch (err) {
    // 이미지 삭제 실패는 무시 (시트 행 삭제는 이미 완료된 상태)
  }
}

function setCellImage_(sheet, row, col, url) {
  try {
    var image = SpreadsheetApp.newCellImage().setSourceUrl(url).build();
    sheet.getRange(row, col).setValue(image);
  } catch (err) {
    // newCellImage가 지원되지 않는 계정/시트인 경우를 대비한 폴백: URL 텍스트라도 남김
    sheet.getRange(row, col).setValue(url);
  }
}

function saveImageToDrive_(base64, mimeType, productCode) {
  var folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  var bytes = Utilities.base64Decode(base64);
  var ext = mimeType.indexOf('png') > -1 ? 'png' : 'jpg';
  var fileName = productCode + '_' + new Date().getTime() + '.' + ext;
  var blob = Utilities.newBlob(bytes, mimeType, fileName);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var url = 'https://drive.google.com/uc?id=' + file.getId();
  return { id: file.getId(), url: url };
}

// ===== UTIL =====

function checkKey_(key) {
  return String(key || '') === String(CONFIG.API_KEY || '');
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
