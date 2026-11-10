// 상세 루트를 한글(HWPX) 문서로 만들어 내려받기
// HWPX = XML 파일 여러 개를 묶은 zip. 고정 파일은 /hwpx/ 템플릿을 쓰고, 본문(section0.xml)만 여기서 만듭니다.
// 템플릿 header.xml은 python-hwpx(Apache-2.0)의 기본 스켈레톤에 루트용 스타일(글자 7~12, 문단 20~24, 테두리 3~4)을 더한 것입니다.

const JSZIP_URL = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
const TEMPLATE_FILES = ["version.xml", "settings.xml", "META-INF/container.xml", "META-INF/container.rdf", "META-INF/manifest.xml", "Contents/header.xml"];

const NS = 'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>';

// header.xml에 정의된 스타일 번호
const CHAR = { base: 0, title: 7, dayHead: 8, body: 9, muted: 10, th: 11, strong: 12 };
const PARA = { body: 20, dayHead: 21, cell: 22, cellCenter: 23, title: 24 };
const FILL = { cell: 3, th: 4 };

// A4, 좌우 여백 30mm → 본문 폭 42520 HWPUNIT(1mm ≈ 283.46)
const TEXT_WIDTH = 42520;
const COLS = [{ title: "시간", width: 6000, center: true }, { title: "장소 · 활동", width: 22520 }, { title: "이동", width: 14000 }];
const CELL_MARGIN = '<hp:cellMargin left="510" right="510" top="283" bottom="283"/>';

/** XML 특수문자 이스케이프 + XML에 쓸 수 없는 제어문자 제거, 줄바꿈은 공백으로 */
const xml = (s) => String(s ?? "")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
  .replace(/\s*\n\s*/g, " ")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SEC_PR = '<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0"><hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/><hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/><hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/><hp:pagePr landscape="WIDELY" width="59528" height="84186" gutterType="LEFT_ONLY"><hp:margin header="4252" footer="4252" gutter="0" left="8504" right="8504" top="5668" bottom="4252"/></hp:pagePr><hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr><hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr><hp:pageBorderFill type="BOTH" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill><hp:pageBorderFill type="EVEN" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill><hp:pageBorderFill type="ODD" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill></hp:secPr><hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>';

/** 본문(section0.xml) 생성. runs: [[charPr, text], ...] */
export function buildSection(route, { link = "" } = {}) {
  let pid = 0;
  const run = (char, text) => `<hp:run charPrIDRef="${char}"><hp:t>${xml(text)}</hp:t></hp:run>`;
  const para = (paraPr, runs, prefix = "") =>
    `<hp:p id="${pid++}" paraPrIDRef="${paraPr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${prefix}${runs.map(([c, t]) => run(c, t)).join("")}</hp:p>`;

  const cell = (col, row, fill, paras) => `<hp:tc name="" header="${row === 0 ? 1 : 0}" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="${fill}">`
    + `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${row === 0 ? "CENTER" : "TOP"}" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${paras.join("")}</hp:subList>`
    + `<hp:cellAddr colAddr="${col}" rowAddr="${row}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${COLS[col].width}" height="1000"/>${CELL_MARGIN}</hp:tc>`;

  const table = (schedule) => {
    const head = `<hp:tr>${COLS.map((c, i) => cell(i, 0, FILL.th, [para(c.center ? PARA.cellCenter : PARA.cell, [[CHAR.th, c.title]])])).join("")}</hp:tr>`;
    const rows = schedule.map((s, r) => `<hp:tr>${[
      cell(0, r + 1, FILL.cell, [para(PARA.cellCenter, [[CHAR.strong, s.time]])]),
      cell(1, r + 1, FILL.cell, [para(PARA.cell, [[CHAR.strong, s.place]]), ...(s.activity ? [para(PARA.cell, [[CHAR.body, s.activity]])] : [])]),
      cell(2, r + 1, FILL.cell, [para(PARA.cell, [[CHAR.muted, s.transport || "-"]])]),
    ].join("")}</hp:tr>`).join("");
    const rowCnt = schedule.length + 1;
    return `<hp:tbl id="${1000 + pid}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${rowCnt}" colCnt="${COLS.length}" cellSpacing="0" borderFillIDRef="${FILL.cell}" noAdjust="0">`
      + `<hp:sz width="${TEXT_WIDTH}" widthRelTo="ABSOLUTE" height="${rowCnt * 1000}" heightRelTo="ABSOLUTE" protect="0"/>`
      // treatAsChar="0": 글자처럼 취급하지 않아야 한글이 표를 쪽 경계에서 행 단위로 나눠 다음 쪽으로 이어 줍니다.
      // (글자처럼 취급하면 표 전체가 한 덩어리라 통째로 다음 쪽으로 밀리거나 아래가 잘립니다.)
      // pageBreak="CELL"은 행 중간이 아니라 행 사이에서 나누고, repeatHeader="1"은 다음 쪽에 머리글 행을 반복합니다.
      + '<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'
      + '<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="283" bottom="283"/>'
      + head + rows + "</hp:tbl>";
  };

  const out = [];
  // 첫 문단에는 용지 설정(secPr)이 반드시 들어가야 합니다
  out.push(para(PARA.title, [[CHAR.title, route.title]], `<hp:run charPrIDRef="${CHAR.base}">${SEC_PR}</hp:run>`));
  out.push(para(PARA.body, [[CHAR.muted, `${route.days.length}일 여행 루트 · ${route.regions.join(" → ")}`]]));
  if (route.overview) out.push(para(PARA.body, [[CHAR.body, route.overview]]));

  for (const day of route.days) {
    out.push(para(PARA.dayHead, [[CHAR.dayHead, `DAY ${day.day}  ${day.theme}`]]));
    if (day.schedule.length) {
      const tblRun = `<hp:run charPrIDRef="${CHAR.body}">${table(day.schedule)}<hp:t/></hp:run>`;
      out.push(`<hp:p id="${pid++}" paraPrIDRef="${PARA.body}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${tblRun}</hp:p>`);
    }
    out.push(para(PARA.body, [[CHAR.strong, "숙박  "], [CHAR.body, day.accommodation]]));
  }

  if (route.tips?.length) {
    out.push(para(PARA.dayHead, [[CHAR.dayHead, "여행 팁"]]));
    for (const t of route.tips) out.push(para(PARA.body, [[CHAR.body, `• ${t}`]]));
  }
  out.push(para(PARA.body, [[CHAR.muted, `tripmate에서 만든 여행 루트${link ? ` · ${link}` : ""}`]]));

  return `${XML_HEAD}<hs:sec ${NS}>${out.join("")}</hs:sec>`;
}

function buildContentHpf(title) {
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  return `${XML_HEAD}<opf:package ${NS} version="" unique-identifier="" id=""><opf:metadata><opf:title>${xml(title)}</opf:title><opf:language>ko</opf:language>`
    + `<opf:meta name="creator" content="text">tripmate</opf:meta><opf:meta name="subject" content="text"/><opf:meta name="description" content="text"/>`
    + `<opf:meta name="lastsaveby" content="text">tripmate</opf:meta><opf:meta name="CreatedDate" content="text">${now}</opf:meta><opf:meta name="ModifiedDate" content="text">${now}</opf:meta>`
    + `<opf:meta name="date" content="text"/><opf:meta name="keyword" content="text"/></opf:metadata>`
    + `<opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/><opf:item id="settings" href="settings.xml" media-type="application/xml"/></opf:manifest>`
    + `<opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>`;
}

/** 미리보기 텍스트(Preview/PrvText.txt) */
function buildPreviewText(route) {
  const lines = [route.title, route.overview];
  for (const d of route.days) {
    lines.push(`DAY ${d.day} ${d.theme}`);
    for (const s of d.schedule) lines.push(`${s.time} ${s.place} - ${s.activity}`);
  }
  return lines.join("\r\n").slice(0, 1024);
}

/** 생성되는 파일 목록 (경로 → 내용). 템플릿 파일 내용은 templates로 받습니다 */
export function buildHwpxFiles(route, templates, opts = {}) {
  return {
    ...templates,
    "Contents/content.hpf": buildContentHpf(route.title),
    "Contents/section0.xml": buildSection(route, opts),
    "Preview/PrvText.txt": buildPreviewText(route),
  };
}

/** zip으로 묶기. mimetype은 반드시 맨 앞, 압축 없이 */
export function zipHwpx(JSZip, files) {
  const zip = new JSZip();
  zip.file("mimetype", "application/hwp+zip", { compression: "STORE" });
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  return zip;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("HWPX 도구를 불러오지 못했어요. 네트워크를 확인해 주세요."));
    document.head.append(s);
  });
}

let templatesPromise;
const loadTemplates = () => (templatesPromise ??= Promise.all(TEMPLATE_FILES.map(async (f) => {
  const res = await fetch(`/hwpx/${f}`);
  if (!res.ok) throw new Error(`HWPX 템플릿을 불러오지 못했어요 (${f})`);
  return [f, await res.text()];
})).then(Object.fromEntries).catch((err) => { templatesPromise = null; throw err; }));

const safeFileName = (s) => (String(s).replace(/[\\/:*?"<>|\u0000-\u001F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "여행 루트");

/** 브라우저에서 HWPX 파일을 만들어 내려받기 */
export async function downloadHwpx(route, opts = {}) {
  const [templates] = await Promise.all([loadTemplates(), window.JSZip ? null : loadScript(JSZIP_URL)]);
  const blob = await zipHwpx(window.JSZip, buildHwpxFiles(route, templates, opts))
    // 내려받는 파일 형식은 일반 파일(octet-stream)로 둡니다. application/hwp+zip으로 두면
    // 한글 뷰어가 있는 브라우저·확장 프로그램이 저장 대신 문서 뷰어로 열어 버립니다.
    // (zip 안의 mimetype 파일은 그대로 application/hwp+zip이라 한글에서 여는 데는 영향 없음)
    .generateAsync({ type: "blob", compression: "DEFLATE", mimeType: "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${safeFileName(route.title)}.hwpx`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
