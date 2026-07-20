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

// 내부용 시트 컬럼: 품번(1) 이미지(2) 상품명(3) 옵션1(4) 옵션2(5) 상품설명(6) 식별코드(7) 거래처(8)
//                  원가(9) 판매가(10) 재고(11) 이미지URL(12) 등록일시(13) [배수(14) 자동계산]
var INTERNAL_HEADERS = ['품번', '이미지', '상품명', '옵션1', '옵션2', '상품설명', '식별코드', '거래처', '원가', '판매가', '재고', '이미지URL', '등록일시'];
// 셀러용 시트 컬럼: 품번(1) 이미지(2) 상품명(3) 옵션1(4) 옵션2(5) 상품설명(6) 판매가(7) 재고(8)
var SELLER_HEADERS = ['품번', '이미지', '상품명', '옵션1', '옵션2', '상품설명', '판매가', '재고'];

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
    if (body.action === 'update') return jsonOut_(updateProduct_(body));
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
  ensureMultiplierColumn_(productSheet);
  cleanupBlankInternalRows_();

  var vendorSheet = internalSs.getSheetByName(CONFIG.VENDOR_SHEET_NAME) || internalSs.insertSheet(CONFIG.VENDOR_SHEET_NAME);
  ensureHeader_(vendorSheet, ['거래처명']);

  var sellerSs = SpreadsheetApp.openById(CONFIG.SELLER_SHEET_ID);
  var sellerSheet = sellerSs.getSheetByName(CONFIG.SELLER_SHEET_NAME) || sellerSs.insertSheet(CONFIG.SELLER_SHEET_NAME);
  ensureHeader_(sellerSheet, SELLER_HEADERS);

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

// 내부용 시트 N열: 원가(I) 대비 판매가(J) 배수. 3.5배 표준이어도 값을 그대로 표시한다.
// ARRAYFORMULA가 열 전체를 스스로 채우므로, 이 열에는 절대 다른 값을 개별 setValue로 쓰면 안 됨.
function ensureMultiplierColumn_(sheet) {
  var header = sheet.getRange(1, 14).getValue();
  if (String(header).trim() === '') {
    sheet.getRange(1, 14).setValue('배수');
    sheet.getRange(2, 14).setFormula(
      '=ARRAYFORMULA(IF(I2:I="","",IF(I2:I=0,"",ROUND(J2:J/I2:I,2))))'
    );
  }
}

// A열(품번)이 비어있는 행 중 실제 마지막으로 데이터가 있는 행 번호를 반환.
// sheet.getLastRow()는 N열 ARRAYFORMULA의 스필 범위까지 "데이터 있음"으로 잡아서
// 시트 끝까지 부풀려지는 문제가 있어 대신 사용한다.
function getLastDataRow_(sheet) {
  var maxRows = sheet.getMaxRows();
  if (maxRows < 2) return 1;
  var codes = sheet.getRange(2, 1, maxRows - 1, 1).getValues();
  for (var i = codes.length - 1; i >= 0; i--) {
    if (String(codes[i][0]).trim() !== '') return i + 2;
  }
  return 1;
}

// A열(품번)이 빈 행들을 전부 삭제한다 (배수 수식 버블 등으로 생길 수 있는 빈 행 정리용, 안전하게 반복 실행 가능).
function cleanupBlankInternalRows_() {
  var ss = SpreadsheetApp.openById(CONFIG.INTERNAL_SHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.PRODUCT_SHEET_NAME);
  if (!sheet) return;
  var maxRows = sheet.getMaxRows();
  var codes = sheet.getRange(2, 1, maxRows - 1, 1).getValues();
  var deleted = 0;
  var i = codes.length - 1;
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
  var values = sheet.getRange(2, 1, lastRow - 1, 3).getValues(); // A 품번, C 상품명
  var found = false;
  var name = '';
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === code) {
      found = true;
      name = values[i][2];
    }
  }
  return { ok: true, exists: found, name: name };
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
  // A 품번, B 이미지, C 상품명, D 옵션1, E 옵션2, F 상품설명, G 식별코드, H 거래처,
  // I 원가, J 판매가, K 재고, L 이미지URL, M 등록일시, N 배수
  var values = sheet.getRange(startRow, 1, numRows, 14).getValues();
  var items = [];
  for (var i = values.length - 1; i >= 0; i--) {
    var row = values[i];
    items.push({
      row: startRow + i,
      code: row[0],
      name: row[2],
      option1: row[3] || '',
      option2: row[4] || '',
      description: row[5] || '',
      internalCode: row[6],
      vendor: row[7],
      cost: row[8],
      price: row[9],
      stock: row[10],
      imageUrl: row[11] || ''
    });
  }
  return items;
}

// ===== SAVE =====

function saveProduct_(body) {
  var productCode = String(body.productCode || '').trim();
  var productName = String(body.productName || '').trim();
  var option1 = String(body.productOption1 || '').trim();
  var option2 = String(body.productOption2 || '').trim();
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
  var newRow = getLastDataRow_(internalSheet) + 1;

  internalSheet.getRange(newRow, 1).setValue(productCode);
  internalSheet.getRange(newRow, 3).setValue(productName);
  internalSheet.getRange(newRow, 4).setValue(option1);
  internalSheet.getRange(newRow, 5).setValue(option2);
  internalSheet.getRange(newRow, 6).setValue(productDescription);
  internalSheet.getRange(newRow, 7).setValue(internalCode);
  internalSheet.getRange(newRow, 8).setValue(vendor);
  internalSheet.getRange(newRow, 9).setValue(cost);
  internalSheet.getRange(newRow, 10).setValue(price);
  internalSheet.getRange(newRow, 11).setValue(stock);
  internalSheet.getRange(newRow, 12).setValue(imageUrl);
  internalSheet.getRange(newRow, 13).setValue(now);
  if (imageUrl) setCellImage_(internalSheet, newRow, 2, imageUrl);
  internalSheet.setRowHeight(newRow, CONFIG.IMAGE_ROW_HEIGHT);
  internalSheet.setColumnWidth(2, CONFIG.IMAGE_COL_WIDTH);

  // ---- 셀러용 시트: 내부용과 항상 같은 행 번호를 써서 두 시트가 1:1로 정렬되게 유지한다 ----
  var sellerSs = SpreadsheetApp.openById(CONFIG.SELLER_SHEET_ID);
  var sellerSheet = sellerSs.getSheetByName(CONFIG.SELLER_SHEET_NAME) || sellerSs.insertSheet(CONFIG.SELLER_SHEET_NAME);
  ensureHeader_(sellerSheet, SELLER_HEADERS);
  var sellerRow = newRow;

  sellerSheet.getRange(sellerRow, 1).setValue(productCode);
  sellerSheet.getRange(sellerRow, 3).setValue(productName);
  sellerSheet.getRange(sellerRow, 4).setValue(option1);
  sellerSheet.getRange(sellerRow, 5).setValue(option2);
  sellerSheet.getRange(sellerRow, 6).setValue(productDescription);
  sellerSheet.getRange(sellerRow, 7).setValue(price);
  sellerSheet.getRange(sellerRow, 8).setValue(stock);
  if (imageUrl) setCellImage_(sellerSheet, sellerRow, 2, imageUrl);
  sellerSheet.setRowHeight(sellerRow, CONFIG.IMAGE_ROW_HEIGHT);
  sellerSheet.setColumnWidth(2, CONFIG.IMAGE_COL_WIDTH);

  return { ok: true };
}

// ===== UPDATE (등록된 상품 목록 화면에서 필드 직접 수정) =====
// 이미지는 다루지 않는다 — 사진 교체는 updateImage_ 전용 흐름 사용.

function updateProduct_(body) {
  var row = Number(body.row) || 0;
  var originalCode = String(body.originalCode || '').trim();
  if (!row || !originalCode) return { ok: false, error: 'row/originalCode가 필요합니다.' };

  var internalSs = SpreadsheetApp.openById(CONFIG.INTERNAL_SHEET_ID);
  var internalSheet = internalSs.getSheetByName(CONFIG.PRODUCT_SHEET_NAME);
  if (!internalSheet) return { ok: false, error: '내부용 시트를 찾을 수 없습니다.' };

  var rowCode = String(internalSheet.getRange(row, 1).getValue()).trim();
  if (rowCode !== originalCode) {
    return { ok: false, error: '품번이 일치하지 않습니다. (해당 행이 이미 변경되었을 수 있습니다. 새로고침 후 다시 시도해주세요)' };
  }

  var productCode = String(body.productCode || '').trim();
  var productName = String(body.productName || '').trim();
  var option1 = String(body.productOption1 || '').trim();
  var option2 = String(body.productOption2 || '').trim();
  var productDescription = String(body.productDescription || '').trim();
  var internalCode = String(body.internalCode || '').trim();
  var vendor = String(body.vendor || '').trim();
  var cost = Number(body.cost) || 0;
  var price = Number(body.price) || 0;
  var stock = Number(body.stock) || 0;

  if (!productCode || !productName) {
    return { ok: false, error: '품번/상품명은 필수입니다.' };
  }
  if (vendor) addVendorIfMissing_(vendor);

  internalSheet.getRange(row, 1).setValue(productCode);
  internalSheet.getRange(row, 3).setValue(productName);
  internalSheet.getRange(row, 4).setValue(option1);
  internalSheet.getRange(row, 5).setValue(option2);
  internalSheet.getRange(row, 6).setValue(productDescription);
  internalSheet.getRange(row, 7).setValue(internalCode);
  internalSheet.getRange(row, 8).setValue(vendor);
  internalSheet.getRange(row, 9).setValue(cost);
  internalSheet.getRange(row, 10).setValue(price);
  internalSheet.getRange(row, 11).setValue(stock);

  // 셀러용 시트: 내부용과 같은 행 번호 사용 (saveProduct_와 동일한 1:1 정렬 원칙)
  var sellerSs = SpreadsheetApp.openById(CONFIG.SELLER_SHEET_ID);
  var sellerSheet = sellerSs.getSheetByName(CONFIG.SELLER_SHEET_NAME);
  if (sellerSheet) {
    var sellerRowCode = String(sellerSheet.getRange(row, 1).getValue()).trim();
    if (sellerRowCode === originalCode) {
      sellerSheet.getRange(row, 1).setValue(productCode);
      sellerSheet.getRange(row, 3).setValue(productName);
      sellerSheet.getRange(row, 4).setValue(option1);
      sellerSheet.getRange(row, 5).setValue(option2);
      sellerSheet.getRange(row, 6).setValue(productDescription);
      sellerSheet.getRange(row, 7).setValue(price);
      sellerSheet.getRange(row, 8).setValue(stock);
    }
  }

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

  internalSheet.getRange(row, 12).setValue(driveFile.url);
  setCellImage_(internalSheet, row, 2, driveFile.url);
  internalSheet.setRowHeight(row, CONFIG.IMAGE_ROW_HEIGHT);
  internalSheet.setColumnWidth(2, CONFIG.IMAGE_COL_WIDTH);

  // 셀러용 시트: 내부용과 같은 행 번호를 사용 (품번이 옵션끼리 같을 수 있어 품번만으로 찾으면 엉뚱한 옵션이 바뀔 수 있음)
  var sellerSs = SpreadsheetApp.openById(CONFIG.SELLER_SHEET_ID);
  var sellerSheet = sellerSs.getSheetByName(CONFIG.SELLER_SHEET_NAME);
  if (sellerSheet) {
    var sellerRowCode = String(sellerSheet.getRange(row, 1).getValue()).trim();
    if (sellerRowCode === productCode) {
      setCellImage_(sellerSheet, row, 2, driveFile.url);
      sellerSheet.setRowHeight(row, CONFIG.IMAGE_ROW_HEIGHT);
      sellerSheet.setColumnWidth(2, CONFIG.IMAGE_COL_WIDTH);
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

  var imageUrl = String(internalSheet.getRange(row, 12).getValue() || '');
  internalSheet.deleteRow(row);
  deleteDriveFileByUrl_(imageUrl);

  // 셀러용 시트: 내부용과 같은 행 번호를 사용 (품번이 옵션끼리 같을 수 있어 품번만으로 찾으면 엉뚱한 옵션이 지워질 수 있음)
  var sellerSs = SpreadsheetApp.openById(CONFIG.SELLER_SHEET_ID);
  var sellerSheet = sellerSs.getSheetByName(CONFIG.SELLER_SHEET_NAME);
  if (sellerSheet) {
    var sellerRowCode = String(sellerSheet.getRange(row, 1).getValue()).trim();
    if (sellerRowCode === productCode) {
      sellerSheet.deleteRow(row);
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
