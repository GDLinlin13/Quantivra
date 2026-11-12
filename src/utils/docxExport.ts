// Documents typed in the letter editor: the editor's HTML is turned into a real Word file (.docx) with the company
// letterhead in the page header, and the HTML itself is kept inside the file so Quantivra can open it again for editing.
// Only what the editor can produce is supported: paragraphs, headings, bullet / numbered lists, bold / italic /
// underline, line breaks and left / centre / right alignment.

export interface Run { text: string; b?: boolean; i?: boolean; u?: boolean; br?: boolean }
export interface Block { kind: 'p' | 'h1' | 'h2' | 'h3' | 'ul' | 'ol'; align?: 'left' | 'center' | 'right' | 'both'; runs: Run[] }

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const decode = (s: string) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
  const k = e.toLowerCase();
  if (k in ENTITIES) return ENTITIES[k];
  if (k.startsWith('#x')) return String.fromCodePoint(parseInt(k.slice(2), 16));
  if (k.startsWith('#')) return String.fromCodePoint(parseInt(k.slice(1), 10));
  return m;
});

/** The editor's HTML as a list of blocks, each with its formatted runs. */
export function parseEditorHtml(html: string): Block[] {
  const blocks: Block[] = [];
  let cur: Block | null = null;
  let b = 0, i = 0, u = 0;
  const lists: ('ul' | 'ol')[] = [];
  const aligns: (Block['align'] | undefined)[] = [];
  const open = (kind: Block['kind'], align?: Block['align']) => { cur = { kind, align: align ?? aligns[aligns.length - 1], runs: [] }; blocks.push(cur); };
  const close = () => { cur = null; };
  const text = (t: string) => {
    if (!t) return;
    if (!cur) { if (!t.trim()) return; open('p'); }
    cur!.runs.push({ text: t, ...(b ? { b: true } : {}), ...(i ? { i: true } : {}), ...(u ? { u: true } : {}) });
  };
  const alignOf = (attrs: string): Block['align'] | undefined => {
    const m = /text-align\s*:\s*(left|center|right|justify)/i.exec(attrs) || /align\s*=\s*"?(left|center|right|justify)/i.exec(attrs);
    return m ? (m[1].toLowerCase() === 'justify' ? 'both' : m[1].toLowerCase() as Block['align']) : undefined;
  };
  const re = /<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[4] !== undefined) { text(decode(m[4].replace(/[\r\n]+/g, ' '))); continue; }
    const closing = m[1] === '/', tag = m[2].toLowerCase(), attrs = m[3] || '';
    if (tag === 'b' || tag === 'strong') b += closing ? -1 : 1;
    else if (tag === 'i' || tag === 'em') i += closing ? -1 : 1;
    else if (tag === 'u') u += closing ? -1 : 1;
    else if (tag === 'br') { if (!cur) open('p'); cur!.runs.push({ text: '', br: true }); }
    else if (tag === 'ul' || tag === 'ol') { if (closing) lists.pop(); else lists.push(tag); close(); }
    else if (tag === 'li') { if (closing) close(); else { close(); open(lists[lists.length - 1] || 'ul', alignOf(attrs)); } }
    else if (/^h[1-3]$/.test(tag)) { if (closing) close(); else { close(); open(tag as Block['kind'], alignOf(attrs)); } }
    else if (tag === 'p' || tag === 'div') {
      if (closing) { close(); aligns.pop(); } else { close(); const a = alignOf(attrs); aligns.push(a ?? aligns[aligns.length - 1]); open('p', a); }
    }
  }
  return blocks;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const DRAW = 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

const runXml = (r: Run, size?: number, color?: string) => {
  if (r.br) return '<w:r><w:br/></w:r>';
  // the order Word expects: bold, italic, colour, size, underline
  const props = `${r.b ? '<w:b/>' : ''}${r.i ? '<w:i/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}${size ? `<w:sz w:val="${size}"/>` : ''}${r.u ? '<w:u w:val="single"/>' : ''}`;
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(r.text)}</w:t></w:r>`;
};

/** One block as a Word paragraph (lists use the numbering part: 1 = bullets, 2 = numbers). */
export function blockXml(bl: Block): string {
  const style = bl.kind === 'h1' ? '<w:pStyle w:val="Heading1"/>' : bl.kind === 'h2' ? '<w:pStyle w:val="Heading2"/>' : bl.kind === 'h3' ? '<w:pStyle w:val="Heading3"/>' : '';
  const num = bl.kind === 'ul' ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : bl.kind === 'ol' ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>' : '';
  const jc = bl.align && bl.align !== 'left' ? `<w:jc w:val="${bl.align}"/>` : '';
  return `<w:p><w:pPr>${style}${num}${jc}</w:pPr>${bl.runs.map(r => runXml(r)).join('')}</w:p>`;
}

/** Natural size of a PNG or JPEG, to keep the logo's proportions. */
export function imageSize(bytes: Uint8Array): { w: number; h: number } | null {
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { w: dv.getUint32(16), h: dv.getUint32(20) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let p = 2;
    while (p + 9 < bytes.length) {
      if (bytes[p] !== 0xff) { p++; continue; }
      const mk = bytes[p + 1];
      if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) return { h: (bytes[p + 5] << 8) | bytes[p + 6], w: (bytes[p + 7] << 8) | bytes[p + 8] };
      p += 2 + ((bytes[p + 2] << 8) | bytes[p + 3]);
    }
  }
  return null;
}

export interface LetterInput {
  title: string; html: string; date?: string;
  /** headerImage / footerImage: a custom letterhead drawn as pictures (full page width) instead of the plain text letterhead */
  letterhead: { name: string; lines: string[]; accent: string; logo?: { bytes: Uint8Array; ext: 'png' | 'jpeg' } | null; footer?: string;
    headerImage?: { bytes: Uint8Array; w: number; h: number } | null; footerImage?: { bytes: Uint8Array; w: number; h: number } | null };
}

const toBase64 = (s: string) => { const b = new TextEncoder().encode(s); let t = ''; for (let k = 0; k < b.length; k += 0x8000) t += String.fromCharCode(...b.subarray(k, k + 0x8000)); return btoa(t); };
const fromBase64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), c => c.charCodeAt(0)));
const SOURCE_TAG = 'QVDOC1:';

const pictureXml = (rid: string, cx: number, cy: number, id: number) =>
  `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Picture ${id}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="picture"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
const PAGE_W_EMU = 6840000;                                                    // the text width of the A4 page (about 19 cm)
const fitImage = (img: { w: number; h: number }) => ({ cx: PAGE_W_EMU, cy: Math.round(PAGE_W_EMU * img.h / (img.w || 1)) });

export function headerXml(l: LetterInput['letterhead'], hasLogo: boolean, logoW: number, logoH: number): string {
  const accent = l.accent.replace('#', '') || '1677FF';
  const logo = hasLogo ? `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="114300"><wp:extent cx="${logoW}" cy="${logoH}"/><wp:docPr id="1" name="Logo"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="logo"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${logoW}" cy="${logoH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>` : '';
  const details = l.lines.map(t => `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:color w:val="666666"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${W} ${DRAW}>`
    + `<w:p><w:pPr><w:spacing w:after="40"/></w:pPr>${logo}</w:p>`
    + `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">${esc(l.name)}</w:t></w:r></w:p>`
    + details
    + `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="${accent}"/></w:pBdr><w:spacing w:after="120"/></w:pPr></w:p></w:hdr>`;
}

/** The document as a .docx file. */
export async function buildDocx(input: LetterInput): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const l = input.letterhead;
  const accent = l.accent.replace('#', '') || '1677FF';
  const blocks = parseEditorHtml(input.html);
  const size = l.logo ? imageSize(l.logo.bytes) : null;
  const logoH = 548640;                                                           // 0.6 inch
  const logoW = size ? Math.min(2200000, Math.round(logoH * size.w / size.h)) : logoH;

  const body = `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="${accent}"/><w:sz w:val="32"/></w:rPr><w:t xml:space="preserve">${esc(input.title)}</w:t></w:r></w:p>`
    + (input.date ? `<w:p><w:r><w:rPr><w:color w:val="666666"/><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${esc(input.date)}</w:t></w:r></w:p>` : '')
    + blocks.map(blockXml).join('')
    + (l.footerImage ? `<w:p>${pictureXml('rIdFootImg', fitImage(l.footerImage).cx, fitImage(l.footerImage).cy, 3)}</w:p>` : '')
    + (l.footer && !l.footerImage ? `<w:p><w:pPr><w:spacing w:before="360"/></w:pPr><w:r><w:rPr><w:color w:val="888888"/><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve">${esc(l.footer)}</w:t></w:r></w:p>` : '');
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W} ${DRAW}><w:body>${body}<w:sectPr><w:headerReference w:type="default" r:id="rIdHdr"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1700" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
    + `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>`
    + [['Heading1', 36], ['Heading2', 30], ['Heading3', 26]].map(([id, sz]) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${String(id).replace('Heading', 'heading ')}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="${sz}"/></w:rPr></w:style>`).join('')
    + `</w:styles>`;
  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W}>`
    + `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>`
    + `<w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>`
    + `<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num></w:numbering>`;

  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdSt" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rIdNum" Type="${REL}/numbering" Target="numbering.xml"/><Relationship Id="rIdHdr" Type="${REL}/header" Target="header1.xml"/>${l.footerImage ? `<Relationship Id="rIdFootImg" Type="${REL}/image" Target="media/footer.png"/>` : ''}</Relationships>`);
  if (l.footerImage) zip.file('word/media/footer.png', l.footerImage.bytes);
  zip.file('word/document.xml', doc);
  zip.file('word/styles.xml', styles);
  zip.file('word/numbering.xml', numbering);
  if (l.headerImage) {
    const f = fitImage(l.headerImage);
    zip.file('word/header1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${W} ${DRAW}><w:p><w:pPr><w:spacing w:after="120"/></w:pPr>${pictureXml('rIdLogo', f.cx, f.cy, 2)}</w:p></w:hdr>`);
    zip.file('word/_rels/header1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLogo" Type="${REL}/image" Target="media/header.png"/></Relationships>`);
    zip.file('word/media/header.png', l.headerImage.bytes);
  } else zip.file('word/header1.xml', headerXml(l, !!l.logo, logoW, logoH));
  if (l.logo && !l.headerImage) {
    zip.file('word/_rels/header1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLogo" Type="${REL}/image" Target="media/logo.${l.logo.ext}"/></Relationships>`);
    zip.file(`word/media/logo.${l.logo.ext}`, l.logo.bytes);
  }
  // what the editor needs to open this file again travels in the file's own description
  const source = toBase64(JSON.stringify({ v: 1, title: input.title, html: input.html }));
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(input.title)}</dc:title><dc:description>${SOURCE_TAG}${source}</dc:description></cp:coreProperties>`);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/** The title and HTML of a .docx made here (null for any other Word file). */
export async function readDocxSource(blob: Blob | ArrayBuffer | Uint8Array): Promise<{ title: string; html: string } | null> {
  const { default: JSZip } = await import('jszip');
  try {
    const zip = await JSZip.loadAsync(blob as any);
    const core = await zip.file('docProps/core.xml')?.async('string');
    const m = core && new RegExp(`${SOURCE_TAG}([A-Za-z0-9+/=]+)`).exec(core);
    if (!m) return null;
    const j = JSON.parse(fromBase64(m[1]));
    return j && typeof j.html === 'string' ? { title: String(j.title || ''), html: j.html } : null;
  } catch { return null; }
}
