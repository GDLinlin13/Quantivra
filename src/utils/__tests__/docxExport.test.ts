import { describe, it, expect } from 'vitest';
import { parseEditorHtml, blockXml, buildDocx, readDocxSource, imageSize } from '../docxExport';

describe('letter editor → Word', () => {
  it('reads paragraphs, formatting, headings, lists and alignment', () => {
    const b = parseEditorHtml('<h1>Offer</h1><div>Dear <b>Alice</b>,<br>welcome &amp; <i>hello</i></div><div style="text-align: center;"><u>Centre</u></div><ul><li>One</li><li>Two</li></ul><ol><li>First</li></ol>');
    expect(b.map(x => x.kind)).toEqual(['h1', 'p', 'p', 'ul', 'ul', 'ol']);
    expect(b[1].runs.map(r => r.br ? '<br>' : r.text + (r.b ? '(b)' : r.i ? '(i)' : ''))).toEqual(['Dear ', 'Alice(b)', ',', '<br>', 'welcome & ', 'hello(i)']);
    expect(b[2].align).toBe('center');
    expect(b[2].runs[0].u).toBe(true);
  });
  it('writes Word paragraphs with the right styles', () => {
    const [h, li, c] = parseEditorHtml('<h2>Title</h2><ul><li>Point</li></ul><div style="text-align:right">R</div>');
    expect(blockXml(h)).toContain('w:pStyle w:val="Heading2"');
    expect(blockXml(li)).toContain('w:numId w:val="1"');
    expect(blockXml(c)).toContain('<w:jc w:val="right"/>');
    expect(blockXml({ kind: 'p', runs: [{ text: 'a < b & "c"' }] })).toContain('a &lt; b &amp; &quot;c&quot;');
  });
  it('makes a .docx that keeps the letterhead and can be opened again for editing', async () => {
    const html = '<div>Dear <b>Alice</b></div><ul><li>Café</li></ul>';
    const blob = await buildDocx({ title: 'Letter of Employment', html, date: '12/11/2026',
      letterhead: { name: '28Three Trading Pte Ltd', lines: ['UEN 123', '1 Road'], accent: '#000000', footer: 'Computer generated' } });
    const buf = await blob.arrayBuffer();
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(buf);
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(['[Content_Types].xml', 'word/document.xml', 'word/header1.xml', 'word/styles.xml', 'word/numbering.xml', 'docProps/core.xml']));
    expect(await zip.file('word/header1.xml')!.async('string')).toContain('28Three Trading Pte Ltd');
    const doc = await zip.file('word/document.xml')!.async('string');
    expect(doc).toContain('Letter of Employment');
    expect(doc).toContain('Alice');
    expect(await readDocxSource(buf)).toEqual({ title: 'Letter of Employment', html });
  });
  it('says nothing for a Word file that was not made here', async () => {
    const { default: JSZip } = await import('jszip');
    const z = new JSZip(); z.file('word/document.xml', '<w:document/>');
    expect(await readDocxSource(await z.generateAsync({ type: 'arraybuffer' }))).toBeNull();
    expect(await readDocxSource(new Uint8Array([1, 2, 3]))).toBeNull();
  });
  it('finds the size of a PNG', () => {
    const png = new Uint8Array(32); png.set([0x89, 0x50, 0x4e, 0x47], 0); new DataView(png.buffer).setUint32(16, 300); new DataView(png.buffer).setUint32(20, 100);
    expect(imageSize(png)).toEqual({ w: 300, h: 100 });
  });
});

describe('custom letterhead as pictures', () => {
  it('puts the header picture in the header and the footer picture at the end of the page', async () => {
    const png = new Uint8Array(40); png.set([0x89, 0x50, 0x4e, 0x47], 0);
    const blob = await buildDocx({ title: 'T', html: '<div>x</div>', letterhead: { name: 'Co', lines: [], accent: '#000', headerImage: { bytes: png, w: 800, h: 200 }, footerImage: { bytes: png, w: 800, h: 60 } } });
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(['word/media/header.png', 'word/media/footer.png', 'word/_rels/header1.xml.rels']));
    expect(await zip.file('word/header1.xml')!.async('string')).toContain('r:embed="rIdLogo"');
    expect(await zip.file('word/document.xml')!.async('string')).toContain('r:embed="rIdFootImg"');
    expect(await zip.file('word/_rels/document.xml.rels')!.async('string')).toContain('media/footer.png');
  });
});
