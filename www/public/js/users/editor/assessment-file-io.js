(function (global) {
  'use strict';

  const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const ZIP = global.fflate;

  function xmlEscape(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  function htmlEscape(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function safeFilename(title, extension) {
    const name = String(title || 'assessment').trim()
      .replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '') || 'assessment';
    return `${name}.${extension}`;
  }

  function xmlDocument(source) {
    const document = new DOMParser().parseFromString(source, 'application/xml');
    if (document.querySelector('parsererror')) throw new Error('The Office file contains invalid XML.');
    return document;
  }

  function elements(node, localName, namespace) {
    return Array.from(node.getElementsByTagNameNS(namespace || '*', localName));
  }

  function first(node, localName, namespace) {
    return elements(node, localName, namespace)[0] || null;
  }

  function zipFiles(entries) {
    if (!ZIP) throw new Error('Office file support is unavailable.');
    const files = {};
    for (const [name, content] of Object.entries(entries)) {
      files[name] = ZIP.strToU8(content);
    }
    return ZIP.zipSync(files);
  }

  function blobFor(bytes, mime) {
    return new Blob([bytes], { type: mime });
  }

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function editorBlocks(content) {
    const parsed = new DOMParser().parseFromString(`<body>${content || ''}</body>`, 'text/html');
    const blocks = [];
    for (const node of Array.from(parsed.body.children)) {
      if (node.tagName === 'TABLE') {
        const rows = Array.from(node.querySelectorAll('tr')).map(row =>
          Array.from(row.querySelectorAll(':scope > th, :scope > td')).map(cell => cell.innerText || cell.textContent || '')
        );
        if (rows.length) blocks.push({ type: 'table', rows });
      } else if (node.tagName === 'UL' || node.tagName === 'OL') {
        for (const item of Array.from(node.children)) {
          if (item.tagName === 'LI') blocks.push({ type: 'li', text: item.innerText || item.textContent || '' });
        }
      } else if (node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE') {
        const type = /^H[1-6]$/.test(node.tagName) ? node.tagName.toLowerCase()
          : node.tagName === 'BLOCKQUOTE' ? 'blockquote'
          : node.tagName === 'PRE' ? 'pre' : node.tagName === 'HR' ? 'hr' : 'p';
        const text = node.innerText || node.textContent || '';
        if (text.trim() || node.tagName === 'HR' || node.tagName === 'IMG') {
          blocks.push({ type, text: text.trim() });
        }
      }
    }
    return blocks;
  }

  function excelRows(title, status, content) {
    const rows = [[title || 'Assessment'], [`Status: ${status || 'draft'}`], []];
    for (const block of editorBlocks(content)) {
      if (block.type === 'table') rows.push(...block.rows);
      else if (block.type === 'hr') rows.push(['']);
      else rows.push([block.text]);
    }
    return rows;
  }

  function columnName(index) {
    let name = '';
    for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
      name = String.fromCharCode(65 + (value - 1) % 26) + name;
    }
    return name;
  }

  function worksheetXml(rows) {
    const body = rows.map((row, rowIndex) => {
      const cells = row.map((value, colIndex) => {
        const text = String(value ?? '');
        return `<c r="${columnName(colIndex)}${rowIndex + 1}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
      }).join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><sheetData>${body}</sheetData></worksheet>`;
  }

  function makeXlsx(title, status, content) {
    const visible = excelRows(title, status, content);
    const source = [['Title', title || 'Assessment'], ['Status', status || 'draft'], ['Content HTML']];
    const raw = String(content || '');
    for (let offset = 0; offset < raw.length;) {
      let end = Math.min(offset + 30000, raw.length);
      if (end < raw.length && /[\uD800-\uDBFF]/.test(raw[end - 1])) end--;
      source.push([raw.slice(offset, end)]);
      offset = end;
    }
    const sheet1 = worksheetXml(visible);
    const sheet2 = worksheetXml(source);
    const entries = {
      '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `</Types>`,
      '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
      'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><sheets>` +
        `<sheet name="Assessment" sheetId="1" r:id="rId1"/>` +
        `<sheet name="Assessment Data" sheetId="2" r:id="rId2"/>` +
        `</sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>` +
        `</Relationships>`,
      'xl/worksheets/sheet1.xml': sheet1,
      'xl/worksheets/sheet2.xml': sheet2,
    };
    return blobFor(zipFiles(entries), EXCEL_MIME);
  }

  function wordRun(text, properties = '') {
    if (!text) return '';
    return `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
  }

  function inlineWord(node, inherited = '') {
    if (node.nodeType === Node.TEXT_NODE) return wordRun(node.nodeValue, inherited);
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName.toLowerCase();
    if (tag === 'br') return '<w:r><w:br/></w:r>';
    let properties = inherited;
    if (tag === 'b' || tag === 'strong') properties += '<w:b/>';
    if (tag === 'i' || tag === 'em') properties += '<w:i/>';
    if (tag === 'u') properties += '<w:u w:val="single"/>';
    if (tag === 's' || tag === 'strike' || tag === 'del') properties += '<w:strike/>';
    if (tag === 'a') {
      const href = node.getAttribute('href');
      if (href && /^(https?:|mailto:)/i.test(href)) {
        return node.textContent + ` (${href})`;
      }
    }
    return Array.from(node.childNodes).map(child => inlineWord(child, properties)).join('');
  }

  function wordParagraph(node, style = '') {
    const contents = inlineWord(node);
    const paragraphStyle = style || (/^H[1-6]$/.test(node.tagName) ? 'Heading1' : '');
    return `<w:p>${paragraphStyle ? `<w:pPr><w:pStyle w:val="${paragraphStyle}"/></w:pPr>` : ''}${contents || '<w:r><w:t></w:t></w:r>'}</w:p>`;
  }

  function wordTable(table) {
    const rows = Array.from(table.querySelectorAll('tr')).map(row => {
      const cells = Array.from(row.querySelectorAll(':scope > th, :scope > td')).map(cell =>
        `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${wordParagraph(cell)}</w:tc>`
      ).join('');
      return `<w:tr>${cells}</w:tr>`;
    }).join('');
    return `<w:tbl><w:tblPr><w:tblBorders>` +
      `<w:top w:val="single" w:sz="4" w:color="808080"/><w:left w:val="single" w:sz="4" w:color="808080"/>` +
      `<w:bottom w:val="single" w:sz="4" w:color="808080"/><w:right w:val="single" w:sz="4" w:color="808080"/>` +
      `<w:insideH w:val="single" w:sz="4" w:color="808080"/><w:insideV w:val="single" w:sz="4" w:color="808080"/>` +
      `</w:tblBorders></w:tblPr>${rows}</w:tbl>`;
  }

  function wordBody(title, status, content) {
    const parsed = new DOMParser().parseFromString(`<body>${content || ''}</body>`, 'text/html');
    const parts = [
      `<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr>${wordRun(title || 'Assessment')}</w:p>`,
      `<w:p>${wordRun(`Status: ${status || 'draft'}`)}</w:p>`,
    ];
    for (const node of Array.from(parsed.body.children)) {
      if (node.tagName === 'TABLE') parts.push(wordTable(node));
      else if (node.tagName === 'UL' || node.tagName === 'OL') {
        for (const item of Array.from(node.children)) {
          if (item.tagName === 'LI') parts.push(wordParagraph(item));
        }
      } else if (node.tagName === 'HR') {
        parts.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="808080"/></w:pBdr></w:pPr></w:p>');
      } else if (node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE') {
        parts.push(wordParagraph(node));
      }
    }
    return parts.join('');
  }

  function makeDocx(title, status, content) {
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${WORD_NS}"><w:body>${wordBody(title, status, content)}` +
      `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>` +
      `</w:body></w:document>`;
    const customXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<assessment xmlns="https://iseegrass.com/assessment"><title>${xmlEscape(title || 'Assessment')}</title>` +
      `<status>${xmlEscape(status || 'draft')}</status><content>${xmlEscape(content || '')}</content></assessment>`;
    return blobFor(zipFiles({
      '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
        `</Types>`,
      '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
        `</Relationships>`,
      'word/document.xml': documentXml,
      'word/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<w:styles xmlns:w="${WORD_NS}"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
        `<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/>` +
        `<w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>` +
        `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>` +
        `<w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style></w:styles>`,
      'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/item1.xml"/>` +
        `</Relationships>`,
      'customXml/item1.xml': customXml,
    }), WORD_MIME);
  }

  function packageEntries(fileBytes) {
    if (!ZIP) throw new Error('Office file support is unavailable.');
    const entries = ZIP.unzipSync(new Uint8Array(fileBytes));
    const total = Object.values(entries).reduce((sum, entry) => sum + entry.length, 0);
    if (total > 50 * 1024 * 1024) throw new Error('The uncompressed Office file is too large to import.');
    const decoder = new TextDecoder('utf-8');
    const text = name => entries[name] ? decoder.decode(entries[name]) : null;
    return { entries, text };
  }

  function extractCustomAssessment(text) {
    const source = text('customXml/item1.xml');
    if (!source) return null;
    const doc = xmlDocument(source);
    const read = name => first(doc, name)?.textContent || '';
    const content = read('content');
    if (!content && !read('title')) return null;
    return { title: read('title'), status: read('status'), content };
  }

  function parseDocx(fileBytes) {
    const pkg = packageEntries(fileBytes);
    const custom = extractCustomAssessment(pkg.text);
    if (custom) return custom;
    const source = pkg.text('word/document.xml');
    if (!source) throw new Error('This Word file does not contain a document.');
    const doc = xmlDocument(source);
    const body = first(doc, 'body', WORD_NS);
    if (!body) throw new Error('This Word file has no document body.');
    const blocks = [];
    let title = '';
    let status = '';
    for (const child of Array.from(body.children)) {
      if (child.localName === 'p') {
        const text = elements(child, 't', WORD_NS).map(item => item.textContent).join('');
        if (!text) continue;
        const style = first(first(child, 'pPr', WORD_NS) || child, 'pStyle', WORD_NS)
          ?.getAttributeNS(WORD_NS, 'val') || '';
        if (style.toLowerCase() === 'title' && !title) {
          title = text;
          continue;
        }
        if (!status && /^Status:\s*/i.test(text)) {
          status = text.replace(/^Status:\s*/i, '');
          continue;
        }
        const tag = /heading/i.test(style) ? 'h2' : 'p';
        const runs = elements(child, 'r', WORD_NS).map(run => {
          const value = elements(run, 't', WORD_NS).map(item => htmlEscape(item.textContent)).join('');
          if (!value) return '';
          const props = first(run, 'rPr', WORD_NS);
          let output = value;
          if (props && first(props, 'b', WORD_NS)) output = `<strong>${output}</strong>`;
          if (props && first(props, 'i', WORD_NS)) output = `<em>${output}</em>`;
          if (props && first(props, 'u', WORD_NS)) output = `<u>${output}</u>`;
          return output;
        }).join('');
        blocks.push(`<${tag}>${runs || htmlEscape(text)}</${tag}>`);
      } else if (child.localName === 'tbl') {
        const rows = elements(child, 'tr', WORD_NS).map(row =>
          `<tr>${elements(row, 'tc', WORD_NS).map(cell =>
            `<td>${elements(cell, 'p', WORD_NS).map(p =>
              elements(p, 't', WORD_NS).map(item => htmlEscape(item.textContent)).join('')
            ).join('<br>')}</td>`
          ).join('')}</tr>`
        ).join('');
        if (rows) blocks.push(`<table><tbody>${rows}</tbody></table>`);
      }
    }
    return { title, status, content: blocks.join('') };
  }

  function cellColumn(reference) {
    const letters = (reference.match(/^[A-Z]+/i) || ['A'])[0].toUpperCase();
    return Array.from(letters).reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0) - 1;
  }

  function readWorksheet(source, sharedStrings) {
    const doc = xmlDocument(source);
    return elements(doc, 'row', MAIN_NS).map(row => {
      const values = [];
      for (const cell of elements(row, 'c', MAIN_NS)) {
        const col = cellColumn(cell.getAttribute('r') || 'A');
        const type = cell.getAttribute('t');
        const value = type === 'inlineStr'
          ? elements(cell, 't', MAIN_NS).map(node => node.textContent).join('')
          : (first(cell, 'v', MAIN_NS)?.textContent || '');
        values[col] = type === 's' ? (sharedStrings[Number(value)] || '') : value;
      }
      return values.map(value => value ?? '');
    });
  }

  function workbookSheets(pkg) {
    const workbookSource = pkg.text('xl/workbook.xml');
    const relsSource = pkg.text('xl/_rels/workbook.xml.rels');
    if (!workbookSource || !relsSource) throw new Error('This Excel file has no workbook data.');
    const workbook = xmlDocument(workbookSource);
    const rels = xmlDocument(relsSource);
    const relations = new Map(elements(rels, 'Relationship', 'http://schemas.openxmlformats.org/package/2006/relationships')
      .map(rel => [rel.getAttribute('Id'), rel.getAttribute('Target')]));
    return elements(workbook, 'sheet', MAIN_NS).map(sheet => {
      const id = sheet.getAttributeNS(REL_NS, 'id');
      const target = relations.get(id);
      if (!target) return null;
      const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
      const normalized = [];
      for (const part of path.split('/')) {
        if (part === '..') normalized.pop();
        else if (part !== '.') normalized.push(part);
      }
      return { name: sheet.getAttribute('name') || '', path: normalized.join('/') };
    }).filter(Boolean);
  }

  function parseXlsx(fileBytes) {
    const pkg = packageEntries(fileBytes);
    const sharedSource = pkg.text('xl/sharedStrings.xml');
    const sharedStrings = sharedSource
      ? elements(xmlDocument(sharedSource), 'si', MAIN_NS).map(item =>
        elements(item, 't', MAIN_NS).map(text => text.textContent).join('')
      )
      : [];
    const sheets = workbookSheets(pkg);
    if (!sheets.length) throw new Error('This Excel workbook has no worksheets.');
    const dataSheet = sheets.find(sheet => sheet.name === 'Assessment Data');
    if (dataSheet) {
      const rows = readWorksheet(pkg.text(dataSheet.path) || '', sharedStrings);
      if (rows.length >= 2 && String(rows[0][0]).toLowerCase() === 'title') {
        return {
          title: rows[0][1] || '',
          status: rows[1]?.[1] || '',
          content: rows.slice(3).map(row => row[0] || '').join(''),
        };
      }
    }
    const rows = readWorksheet(pkg.text(sheets[0].path) || '', sharedStrings);
    if (!rows.length) return { title: '', content: '' };
    let status = '';
    let title = '';
    let firstDataRow = 0;
    const firstRowValues = rows[0].filter(value => value !== '');
    if (firstRowValues.length === 1 && /^status:\s*/i.test(rows[1]?.[0] || '')) {
      title = firstRowValues[0];
      status = rows[1][0].replace(/^status:\s*/i, '');
      firstDataRow = 2;
    }
    const tableRows = rows.slice(firstDataRow).filter(row => row.some(value => value !== ''));
    const table = tableRows.length
      ? `<table><tbody>${tableRows.map((row, index) =>
        `<tr>${row.map(value => index === 0 ? `<th>${htmlEscape(value)}</th>` : `<td>${htmlEscape(value)}</td>`).join('')}</tr>`
      ).join('')}</tbody></table>`
      : '';
    return { title, status, content: table };
  }

  async function importFile(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    if (file.size > 25 * 1024 * 1024) throw new Error('Files larger than 25 MB cannot be imported.');
    if (extension === 'docx') return parseDocx(await file.arrayBuffer());
    if (extension === 'xlsx') return parseXlsx(await file.arrayBuffer());
    throw new Error('Choose a Word (.docx) or Excel (.xlsx) file.');
  }

  function createFile(format, title, content, status = 'draft') {
    const blob = format === 'xlsx' ? makeXlsx(title, status, content)
      : format === 'docx' ? makeDocx(title, status, content)
      : null;
    if (!blob) throw new Error('Choose Word (.docx) or Excel (.xlsx) format.');
    return blob;
  }

  function exportFile(format, title, content, status = 'draft') {
    const blob = createFile(format, title, content, status);
    saveBlob(blob, safeFilename(title, format));
    return blob;
  }

  global.AssessmentFileIO = { createFile, exportFile, importFile };
})(window);
