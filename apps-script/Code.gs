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

// 거래처별 품번 시작값 — 거래처 선택 시 해당 범위 안에서 다음 순번을 자동으로 매긴다.
// 목록에 없는 거래처(직접입력 포함)는 DEFAULT_CODE_START부터 시작.
var VENDOR_CODE_START = { '루하': 2001, '실버베스트': 3001, '페이버': 5001 };
var DEFAULT_CODE_START = 9001;
var DEFAULT_VENDOR = '페이버'; // 거래처 미선택 시 자사 재고로 간주

// 내부용 시트 컬럼: 품번(1) 이미지(2) 상품명(3) 옵션1(4) 옵션2(5) 거래처(6) 제작가(7)
//                  원가(8) 판매가(9) 재고(10) 상품설명(11) 큐레이션팁(12)
//                  [배수(13) 자동계산] 이미지URL(14, 기술용 — 앱 미리보기/파일정리용)
var INTERNAL_HEADERS = [
  '품번', '이미지', '상품명', '옵션1', '옵션2', '거래처', '제작가',
  '원가', '판매가', '재고', '상품설명', '큐레이션팁'
];
var INTERNAL_MULTIPLIER_COL = 13;
var INTERNAL_IMAGE_URL_COL = 14;
// 셀러용 시트 컬럼: 품번(1) 이미지(2) 상품명(3) 옵션1(4) 옵션2(5) 판매가(6) 재고(7) 상품설명(8)
var SELLER_HEADERS = ['품번', '이미지', '상품명', '옵션1', '옵션2', '판매가', '재고', '상품설명'];

// ===== ENTRY POINTS =====

function doGet(e) {
  try {
    var action = e.parameter.action;
    if (!checkKey_(e.parameter.apiKey)) return jsonOut_({ ok: false, error: 'unauthorized' });

    if (action === 'vendors') return jsonOut_({ ok: true, vendors: getVendors_() });
    if (action === 'nextCode') return jsonOut_({ ok: true, code: getNextCode_(e.parameter.vendor) });
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
    if (body.action === 'setVendors') return jsonOut_({ ok: true, vendors: setVendorList_(body.vendors) });
    if (body.action === 'sortByCode') return jsonOut_(sortByCode_());
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
  ensureColumnHeader_(productSheet, INTERNAL_IMAGE_URL_COL, '이미지URL');
  ensureFilter_(productSheet, INTERNAL_IMAGE_URL_COL);
  cleanupBlankInternalRows_();

  var vendorSheet = internalSs.getSheetByName(CONFIG.VENDOR_SHEET_NAME) || internalSs.insertSheet(CONFIG.VENDOR_SHEET_NAME);
  ensureHeader_(vendorSheet, ['거래처명']);

  var sellerSs = SpreadsheetApp.openById(CONFIG.SELLER_SHEET_ID);
  var sellerSheet = sellerSs.getSheetByName(CONFIG.SELLER_SHEET_NAME) || sellerSs.insertSheet(CONFIG.SELLER_SHEET_NAME);
  ensureHeader_(sellerSheet, SELLER_HEADERS);

  Logger.log('setup 완료');
}

// 컬럼 구조를 새로 바꿀 때 1회만 수동 실행 — 두 시트의 기존 내용을 전부 지우고 새 헤더로 재생성한다.
// 되돌릴 수 없으므로 스크립트 에디터에서 직접 선택해 실행할 것 (원격 doGet/doPost로는 노출하지 않음).
function resetProductSheets() {
  var internalSs = SpreadsheetApp.openById(CONFIG.INTERNAL_SHEET_ID);
  var internalSheet = internalSs.getSheetByName(CONFIG.PRODUCT_SHEET_NAME) || internalSs.insertSheet(CONFIG.PRODUCT_SHEET_NAME);
  internalSheet.clear();
  internalSheet.getRange(1, 1, 1, INTERNAL_HEADERS.length).setValues([INTERNAL_HEADERS]);
  internalSheet.setFrozenRows(1);
  ensureMultiplierColumn_(internalSheet);
  ensureColumnHeader_(internalSheet, INTERNAL_IMAGE_URL_COL, '이미지URL');
  ensureFilter_(internalSheet, INTERNAL_IMAGE_URL_COL);

  var sellerSs = SpreadsheetApp.openById(CONFIG.SELLER_SHEET_ID);
  var sellerSheet = sellerSs.getSheetByName(CONFIG.SELLER_SHEET_NAME) || sellerSs.insertSheet(CONFIG.SELLER_SHEET_NAME);
  sellerSheet.clear();
  sellerSheet.getRange(1, 1, 1, SELLER_HEADERS.length).setValues([SELLER_HEADERS]);
  sellerSheet.setFrozenRows(1);

  Logger.log('시트 초기화 완료 (새 컬럼 구조 적용)');
}

// 내부용 시트 헤더 행에 구글 시트 필터를 걸어준다 — 거래처별로 걸러보거나 판매가 등 원하는
// 컬럼 기준으로 오름차순/내림차순 정렬해볼 수 있음(시트 상단 헤더 화살표 클릭). 셀러용에는 적용 안 함.
function ensureFilter_(sheet, numCols) {
  var existing = sheet.getFilter();
  if (existing) existing.remove();
  var numRows = Math.max(sheet.getMaxRows(), 2);
  sheet.getRange(1, 1, numRows, numCols).createFilter();
}

// 상품 사진 드라이브 폴더(DRIVE_FOLDER_ID) 안의 파일을 전부 휴지통으로 보낸다.
// resetProductSheets()와 짝을 이루는 1회성 정리 함수 — 시트만 지우면 사진 파일은 그대로 남기 때문.
// 휴지통 이동이라 구글 드라이브에서 약 30일간 복구 가능. 스크립트 에디터에서 직접 실행할 것.
function clearProductImages() {
  var folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  var files = folder.getFiles();
  var count = 0;
  while (files.hasNext()) {
    var file = files.next();
    file.setTrashed(true);
    count++;
  }
  Logger.log('사진 ' + count + '개 휴지통으로 이동 완료');
}

function ensureHeader_(sheet, headers) {
  var firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var hasHeader = firstRow.some(function (v) { return String(v).trim() !== ''; });
  if (!hasHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

// 기존 헤더 행 끝에 컬럼을 하나 덧붙일 때 사용 (기존 컬럼 위치/수식은 건드리지 않음).
function ensureColumnHeader_(sheet, col, headerText) {
  var header = sheet.getRange(1, col).getValue();
  if (String(header).trim() === '') {
    sheet.getRange(1, col).setValue(headerText);
  }
}

// 내부용 시트 M열: 원가(H) 대비 판매가(I) 배수. 3.5배 표준이어도 값을 그대로 표시한다.
// ARRAYFORMULA가 열 전체를 스스로 채우므로, 이 열에는 절대 다른 값을 개별 setValue로 쓰면 안 됨.
function ensureMultiplierColumn_(sheet) {
  var header = sheet.getRange(1, INTERNAL_MULTIPLIER_COL).getValue();
  if (String(header).trim() === '') {
    sheet.getRange(1, INTERNAL_MULTIPLIER_COL).setValue('배수');
    sheet.getRange(2, INTERNAL_MULTIPLIER_COL).setFormula(
      '=ARRAYFORMULA(IF(H2:H="","",IF(H2:H=0,"",ROUND(I2:I/H2:H,2))))'
    );
  }
}

// A열(품번)이 비어있는 행 중 실제 마지막으로 데이터가 있는 행 번호를 반환.
// sheet.getLastRow()는 배수열 ARRAYFORMULA의 스필 범위까지 "데이터 있음"으로 잡아서
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
// 구글 시트는 고정된 행(헤더)을 제외한 행을 전부 지울 수 없으므로, 데이터 영역에 최소 1행은 항상 남긴다.
function cleanupBlankInternalRows_() {
  var ss = SpreadsheetApp.openById(CONFIG.INTERNAL_SHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.PRODUCT_SHEET_NAME);
  if (!sheet) return;
  var maxRows = sheet.getMaxRows();
  if (maxRows < 3) return; // 헤더 + 최소 1행을 남길 여유가 없으면 건너뜀
  var codes = sheet.getRange(2, 1, maxRows - 1, 1).getValues();
  var deleted = 0;
  var maxDeletable = maxRows - 2; // 헤더 1행 + 데이터 영역 최소 1행은 항상 유지
  var i = codes.length - 1;
  while (i >= 0 && deleted < maxDeletable) {
    if (String(codes[i][0]).trim() === '') {
      var end = i;
      while (i >= 0 && String(codes[i][0]).trim() === '') i--;
      var start = i + 1;
      var count = end - start + 1;
      if (deleted + count > maxDeletable) count = maxDeletable - deleted;
      if (count > 0) {
        sheet.deleteRows(start + 2, count);
        deleted += count;
      }
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

// 거래처 목록 전체를 주어진 순서/구성으로 통째로 덮어쓴다 (순서 변경, 삭제 등).
function setVendorList_(vendorList) {
  var names = (vendorList || [])
    .map(function (v) { return String(v || '').trim(); })
    .filter(function (v) { return v !== ''; });
  var ss = SpreadsheetApp.openById(CONFIG.INTERNAL_SHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.VENDOR_SHEET_NAME) || ss.insertSheet(CONFIG.VENDOR_SHEET_NAME);
  sheet.clear();
  sheet.getRange(1, 1).setValue('거래처명');
  sheet.setFrozenRows(1);
  if (names.length > 0) {
    sheet.getRange(2, 1, names.length, 1).setValues(names.map(function (n) { return [n]; }));
  }
  return names;
}

// ===== NEXT CODE (거래처별 품번 자동 채번) =====

// 내부용 시트에서 해당 거래처의 기존 품번 중 최댓값+1을 반환. 거래처에 등록된 상품이 아직 없으면
// VENDOR_CODE_START(없으면 DEFAULT_CODE_START)를 시작값으로 사용. 저장 시점에 다시 계산하므로
// (saveProduct_ 참고) 폼에 보여주는 값은 어디까지나 미리보기이고, 최종 번호는 서버가 확정한다.
function getNextCode_(vendor) {
  vendor = String(vendor || '').trim() || DEFAULT_VENDOR;
  var start = VENDOR_CODE_START[vendor] || DEFAULT_CODE_START;

  var ss = SpreadsheetApp.openById(CONFIG.INTERNAL_SHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.PRODUCT_SHEET_NAME);
  if (!sheet) return start;
  var lastRow = getLastDataRow_(sheet);
  if (lastRow < 2) return start;

  var values = sheet.getRange(2, 1, lastRow - 1, 6).getValues(); // A 품번 ~ F 거래처
  var max = 0;
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][5]).trim() !== vendor) continue;
    var num = Number(values[i][0]);
    if (!isNaN(num) && num > max) max = num;
  }
  return max >= start ? max + 1 : start;
}

// ===== SORT (품번 오름차순 재정렬) =====

// 거래처를 번갈아가며 등록하면 행 순서가 품번 순서와 어긋나므로, 등록을 어느 정도 마친 뒤
// 품번 오름차순으로 행을 재배치한다. 내부용/셀러용을 항상 같은 순서로 같이 재배치해서
// 두 시트의 행 번호 1:1 정렬을 유지한다. 배수(M열)는 수식 전용이라 건드리지 않음 — 값이 아니라
// 위치가 바뀐 각 행의 H/I열 기준으로 자동 재계산된다.
function sortByCode_() {
  var internalSs = SpreadsheetApp.openById(CONFIG.INTERNAL_SHEET_ID);
  var internalSheet = internalSs.getSheetByName(CONFIG.PRODUCT_SHEET_NAME);
  if (!internalSheet) return { ok: false, error: '내부용 시트를 찾을 수 없습니다.' };

  var lastRow = getLastDataRow_(internalSheet);
  if (lastRow < 2) return { ok: true, sorted: 0 };
  var count = lastRow - 1;

  var internalLeft = internalSheet.getRange(2, 1, count, 12).getValues(); // A~L (배수 제외)
  var internalRight = internalSheet.getRange(2, INTERNAL_IMAGE_URL_COL, count, 1).getValues(); // 이미지URL

  var sellerSs = SpreadsheetApp.openById(CONFIG.SELLER_SHEET_ID);
  var sellerSheet = sellerSs.getSheetByName(CONFIG.SELLER_SHEET_NAME);
  var sellerValues = sellerSheet ? sellerSheet.getRange(2, 1, count, 8).getValues() : null;

  var indices = internalLeft.map(function (_, i) { return i; });
  indices.sort(function (a, b) { return Number(internalLeft[a][0]) - Number(internalLeft[b][0]); });

  internalSheet.getRange(2, 1, count, 12).setValues(indices.map(function (i) { return internalLeft[i]; }));
  internalSheet.getRange(2, INTERNAL_IMAGE_URL_COL, count, 1).setValues(indices.map(function (i) { return internalRight[i]; }));

  if (sellerSheet && sellerValues) {
    sellerSheet.getRange(2, 1, count, 8).setValues(indices.map(function (i) { return sellerValues[i]; }));
  }

  return { ok: true, sorted: count };
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
  // A 품번, B 이미지, C 상품명, D 옵션1, E 옵션2, F 거래처, G 제작가,
  // H 원가, I 판매가, J 재고, K 상품설명, L 큐레이션팁, M 배수, N 이미지URL
  var values = sheet.getRange(startRow, 1, numRows, INTERNAL_IMAGE_URL_COL).getValues();
  var items = [];
  for (var i = values.length - 1; i >= 0; i--) {
    var row = values[i];
    items.push({
      row: startRow + i,
      code: row[0],
      name: row[2],
      option1: row[3] || '',
      option2: row[4] || '',
      vendor: row[5],
      productionCost: row[6],
      cost: row[7],
      price: row[8],
      stock: row[9],
      description: row[10] || '',
      curationTip: row[11] || '',
      imageUrl: row[INTERNAL_IMAGE_URL_COL - 1] || ''
    });
  }
  return items;
}

// ===== SAVE =====

function saveProduct_(body) {
  var productName = String(body.productName || '').trim();
  var option1 = String(body.productOption1 || '').trim();
  var option2 = String(body.productOption2 || '').trim();
  var vendor = String(body.vendor || '').trim() || DEFAULT_VENDOR;
  var productionCost = Number(body.productionCost) || 0;
  var cost = Number(body.cost) || 0;
  var price = Number(body.price) || 0;
  var stock = Number(body.stock) || 0;
  var productDescription = String(body.productDescription || '').trim();
  var curationTip = String(body.curationTip || '').trim();

  if (!productName) {
    return { ok: false, error: '상품명은 필수입니다.' };
  }

  // 거래처 목록에 없으면 자동 추가
  addVendorIfMissing_(vendor);

  // 품번은 항상 서버가 거래처 기준으로 새로 계산한다 (클라이언트가 보낸 값은 미리보기일 뿐 신뢰하지 않음).
  var productCode = getNextCode_(vendor);

  var imageUrl = '';
  var driveFile = null;
  if (body.imageBase64) {
    driveFile = saveImageToDrive_(body.imageBase64, body.imageMimeType || 'image/jpeg', String(productCode));
    imageUrl = driveFile.url;
  }

  // ---- 내부용 시트 ----
  var internalSs = SpreadsheetApp.openById(CONFIG.INTERNAL_SHEET_ID);
  var internalSheet = internalSs.getSheetByName(CONFIG.PRODUCT_SHEET_NAME) || internalSs.insertSheet(CONFIG.PRODUCT_SHEET_NAME);
  ensureHeader_(internalSheet, INTERNAL_HEADERS);
  ensureMultiplierColumn_(internalSheet);
  ensureColumnHeader_(internalSheet, INTERNAL_IMAGE_URL_COL, '이미지URL');
  var newRow = getLastDataRow_(internalSheet) + 1;

  internalSheet.getRange(newRow, 1).setValue(productCode);
  internalSheet.getRange(newRow, 3).setValue(productName);
  internalSheet.getRange(newRow, 4).setValue(option1);
  internalSheet.getRange(newRow, 5).setValue(option2);
  internalSheet.getRange(newRow, 6).setValue(vendor);
  internalSheet.getRange(newRow, 7).setValue(productionCost);
  internalSheet.getRange(newRow, 8).setValue(cost);
  internalSheet.getRange(newRow, 9).setValue(price);
  internalSheet.getRange(newRow, 10).setValue(stock);
  internalSheet.getRange(newRow, 11).setValue(productDescription);
  internalSheet.getRange(newRow, 12).setValue(curationTip);
  internalSheet.getRange(newRow, INTERNAL_IMAGE_URL_COL).setValue(imageUrl);
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
  sellerSheet.getRange(sellerRow, 6).setValue(price);
  sellerSheet.getRange(sellerRow, 7).setValue(stock);
  sellerSheet.getRange(sellerRow, 8).setValue(productDescription);
  if (imageUrl) setCellImage_(sellerSheet, sellerRow, 2, imageUrl);
  sellerSheet.setRowHeight(sellerRow, CONFIG.IMAGE_ROW_HEIGHT);
  sellerSheet.setColumnWidth(2, CONFIG.IMAGE_COL_WIDTH);

  return { ok: true, productCode: productCode };
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
  var vendor = String(body.vendor || '').trim();
  var productionCost = Number(body.productionCost) || 0;
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
  internalSheet.getRange(row, 6).setValue(vendor);
  internalSheet.getRange(row, 7).setValue(productionCost);
  internalSheet.getRange(row, 8).setValue(cost);
  internalSheet.getRange(row, 9).setValue(price);
  internalSheet.getRange(row, 10).setValue(stock);
  internalSheet.getRange(row, 11).setValue(productDescription);

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
      sellerSheet.getRange(row, 6).setValue(price);
      sellerSheet.getRange(row, 7).setValue(stock);
      sellerSheet.getRange(row, 8).setValue(productDescription);
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

  internalSheet.getRange(row, INTERNAL_IMAGE_URL_COL).setValue(driveFile.url);
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

  var imageUrl = String(internalSheet.getRange(row, INTERNAL_IMAGE_URL_COL).getValue() || '');
  ensureSpareRow_(internalSheet);
  internalSheet.deleteRow(row);
  deleteDriveFileByUrl_(imageUrl);

  // 셀러용 시트: 내부용과 같은 행 번호를 사용 (품번이 옵션끼리 같을 수 있어 품번만으로 찾으면 엉뚱한 옵션이 지워질 수 있음)
  var sellerSs = SpreadsheetApp.openById(CONFIG.SELLER_SHEET_ID);
  var sellerSheet = sellerSs.getSheetByName(CONFIG.SELLER_SHEET_NAME);
  if (sellerSheet) {
    var sellerRowCode = String(sellerSheet.getRange(row, 1).getValue()).trim();
    if (sellerRowCode === productCode) {
      ensureSpareRow_(sellerSheet);
      sellerSheet.deleteRow(row);
    }
  }

  return { ok: true };
}

// 구글 시트는 고정된 행(헤더)을 제외한 행을 전부 지울 수 없다 — 남은 데이터가 1행뿐일 때
// 그 행을 지우면 이 제약에 걸리므로, 지우기 전에 여분의 빈 행을 하나 만들어둔다.
function ensureSpareRow_(sheet) {
  if (sheet.getMaxRows() <= sheet.getFrozenRows() + 1) {
    sheet.insertRowAfter(sheet.getMaxRows());
  }
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
  // uc?id= 형식은 <img> 태그로 직접 임베드할 때 브라우저에서 차단되어 미리보기가 깨짐 (스프레드시트 셀
  // 이미지는 서버 쪽에서 가져오므로 영향 없음). thumbnail 엔드포인트를 써야 앱 화면에서 정상 표시됨.
  var url = 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000';
  return { id: file.getId(), url: url };
}

// ===== UTIL =====

function checkKey_(key) {
  return String(key || '') === String(CONFIG.API_KEY || '');
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
