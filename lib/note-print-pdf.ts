import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { colorForUserId } from '@/lib/yjs/yjsNoteSchema';

export type PrintDocumentMode = 'full' | 'contributions';

export type PrintAuthorLegendItem = {
  authorId: string;
  authorName: string;
  swatchColor: string;
  highlightColor: string;
};

export const NOTE_PDF_RENDER_WIDTH_PX = 794;

export const CONET_LEARN_TAGLINE = 'Learn together. Go further.';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function authorPrintHighlightFill(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsla(${hue}, 78%, 84%, 0.95)`;
}

function stripCommentMarksForPrint(root: ParentNode) {
  root.querySelectorAll('.comment-mark, [data-comment-id]').forEach((node) => {
    const el = node as HTMLElement;
    el.style.background = 'transparent';
    el.style.border = 'none';
    el.removeAttribute('class');
  });
}

export function normalizePrintBodyHtml(
  contentHtml: string,
  mode: PrintDocumentMode,
): { bodyHtml: string; legend: PrintAuthorLegendItem[] } {
  if (typeof DOMParser === 'undefined') {
    return { bodyHtml: contentHtml, legend: [] };
  }

  const parsed = new DOMParser().parseFromString(
    `<div id="print-root">${contentHtml}</div>`,
    'text/html',
  );
  const root = parsed.getElementById('print-root');
  if (!root) return { bodyHtml: contentHtml, legend: [] };

  stripCommentMarksForPrint(root);

  const legendMap = new Map<string, PrintAuthorLegendItem>();

  root.querySelectorAll('[data-author-id]').forEach((node) => {
    const el = node as HTMLElement;
    const authorId = (el.getAttribute('data-author-id') || '').trim();
    if (!authorId) return;
    const authorName = (el.getAttribute('data-author-name') || 'Student').trim() || 'Student';
    const highlightColor = authorPrintHighlightFill(authorId);
    const swatchColor = colorForUserId(authorId);

    if (mode === 'contributions') {
      el.style.backgroundColor = highlightColor;
      el.style.borderRadius = '2px';
      el.style.boxDecorationBreak = 'clone';
      el.style.setProperty('-webkit-box-decoration-break', 'clone');
    } else {
      el.style.backgroundColor = 'transparent';
    }

    if (!legendMap.has(authorId)) {
      legendMap.set(authorId, { authorId, authorName, swatchColor, highlightColor });
    }
  });

  return {
    bodyHtml: root.innerHTML,
    legend: Array.from(legendMap.values()).sort((a, b) =>
      a.authorName.localeCompare(b.authorName),
    ),
  };
}

function buildPrintLegendHtml(legend: PrintAuthorLegendItem[]): string {
  if (legend.length === 0) return '';
  const items = legend
    .map(
      (item) =>
        `<li><span class="print-legend-swatch" style="background:${escapeHtml(item.highlightColor)};border-color:${escapeHtml(item.swatchColor)}"></span><span>${escapeHtml(item.authorName)}</span></li>`,
    )
    .join('');
  return `<section class="print-legend"><h2>Contributions by author</h2><ul>${items}</ul></section>`;
}

const FRAMED_BODY_STYLES = `
  .note-pdf-content h1.doc-title {
    font-size: 22pt;
    font-weight: 700;
    margin: 0 0 16pt;
    line-height: 1.25;
    padding-bottom: 10pt;
    border-bottom: 1px solid #e2e8f0;
    color: #0f172a;
  }
  .note-pdf-content h2 { font-size: 16pt; margin: 18pt 0 8pt; color: #0f172a; }
  .note-pdf-content h3 { font-size: 14pt; margin: 14pt 0 6pt; color: #0f172a; }
  .note-pdf-content h4 { font-size: 12.5pt; margin: 12pt 0 6pt; color: #0f172a; }
  .note-pdf-content p { margin: 0 0 8pt; color: #0f172a; }
  .note-pdf-content ul { list-style: disc; padding-left: 1.4em; margin: 6pt 0; }
  .note-pdf-content ol { list-style: decimal; padding-left: 1.4em; margin: 6pt 0; }
  .note-pdf-content li { margin: 2pt 0; }
  .note-pdf-content li p { margin: 0; }
  .note-pdf-content a { color: #1a73e8; text-decoration: underline; }
  .note-pdf-content img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 10pt auto;
  }
  .note-pdf-content blockquote {
    margin: 8pt 0;
    padding-left: 12pt;
    border-left: 3px solid #cbd5e1;
    color: #334155;
  }
  .note-pdf-content table { border-collapse: collapse; width: 100%; margin: 10pt 0; }
  .note-pdf-content th, .note-pdf-content td {
    border: 1px solid #cbd5e1;
    padding: 6pt 8pt;
    text-align: left;
  }
  .note-pdf-content .print-legend {
    margin: 0 0 16pt;
    padding: 10pt 12pt;
    border: 1px solid #e2e8f0;
    border-radius: 6pt;
    font-size: 10pt;
    background: #f8fafc;
  }
  .note-pdf-content .print-legend h2 { font-size: 11pt; margin: 0 0 8pt; }
  .note-pdf-content .print-legend ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8pt 14pt;
  }
  .note-pdf-content .print-legend li {
    display: flex;
    align-items: center;
    gap: 6pt;
    margin: 0;
  }
  .note-pdf-content .print-legend-swatch {
    width: 10pt;
    height: 10pt;
    border-radius: 2pt;
    border: 1px solid rgba(15, 23, 42, 0.15);
    flex-shrink: 0;
  }
  .note-pdf-content span[data-author-id] {
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
  }
`;

export function buildFramedNotePrintHtml(options: {
  docTitle: string;
  bodyHtml: string;
  mode: PrintDocumentMode;
  legend: PrintAuthorLegendItem[];
  logoUrl: string;
}): string {
  const { docTitle, bodyHtml, mode, legend, logoUrl } = options;
  const legendHtml = mode === 'contributions' ? buildPrintLegendHtml(legend) : '';

  return `
<div class="note-pdf-sheet" style="
  width: ${NOTE_PDF_RENDER_WIDTH_PX}px;
  padding: 28px 32px;
  background: linear-gradient(165deg, #f1f5f9 0%, #e2e8f0 100%);
  font-family: Arial, Helvetica, sans-serif;
  box-sizing: border-box;
">
  <div class="note-pdf-frame" style="
    box-sizing: border-box;
    background: #ffffff;
    border: 2px solid #cbd5e1;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(255, 255, 255, 0.6) inset;
  ">
    <header style="
      display: flex;
      align-items: center;
      gap: 18px;
      padding: 22px 28px;
      background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 55%, #f1f5f9 100%);
      border-bottom: 1px solid #e2e8f0;
    ">
      <img
        src="${escapeHtml(logoUrl)}"
        alt="Co-Net Learn"
        crossorigin="anonymous"
        style="height: 52px; width: auto; flex-shrink: 0; object-fit: contain;"
      />
      <div style="min-width: 0; flex: 1;">
        <p style="
          margin: 0 0 4px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #64748b;
        ">Co-Net Learn</p>
        <p style="
          margin: 0;
          font-size: 20px;
          font-weight: 700;
          line-height: 1.25;
          color: #0f172a;
          letter-spacing: -0.02em;
        ">${escapeHtml(CONET_LEARN_TAGLINE)}</p>
      </div>
    </header>
    <main class="note-pdf-content" style="
      padding: 32px 36px 40px;
      font-size: 12pt;
      line-height: 1.6;
      color: #0f172a;
    ">
      <style>${FRAMED_BODY_STYLES}</style>
      <h1 class="doc-title">${escapeHtml(docTitle)}</h1>
      ${legendHtml}
      <div class="doc-body">${bodyHtml}</div>
    </main>
    <footer style="
      padding: 12px 28px 16px;
      border-top: 1px solid #f1f5f9;
      text-align: center;
      font-size: 10px;
      color: #94a3b8;
      letter-spacing: 0.04em;
    ">Generated from Co-Net Learn · ${escapeHtml(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }))}</footer>
  </div>
</div>`;
}

function waitForImages(root: ParentNode): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'));
  const pending = images.filter((img) => !img.complete);
  if (pending.length === 0) return Promise.resolve();

  return new Promise((resolve) => {
    let remaining = pending.length;
    const done = () => {
      remaining -= 1;
      if (remaining <= 0) resolve();
    };
    pending.forEach((img) => {
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    });
    window.setTimeout(resolve, 5000);
  });
}

export async function generateNotePdfBlob(options: {
  docTitle: string;
  bodyHtml: string;
  mode: PrintDocumentMode;
  legend: PrintAuthorLegendItem[];
  logoUrl: string;
}): Promise<Blob> {
  const mount = document.createElement('div');
  mount.setAttribute('aria-hidden', 'true');
  mount.style.position = 'fixed';
  mount.style.left = '-12000px';
  mount.style.top = '0';
  mount.style.pointerEvents = 'none';
  mount.style.opacity = '1';
  document.body.appendChild(mount);

  try {
    mount.innerHTML = buildFramedNotePrintHtml(options);
    await waitForImages(mount);

    const frame = mount.querySelector('.note-pdf-frame') as HTMLElement | null;
    if (!frame) {
      throw new Error('Print frame missing');
    }

    const canvas = await html2canvas(frame, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: null,
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const marginX = 0;
    const imgWidth = pageWidth - marginX * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL('image/jpeg', 0.94);

    let heightLeft = imgHeight;
    let offsetY = 0;

    pdf.addImage(imgData, 'JPEG', marginX, offsetY, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      offsetY -= pageHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', marginX, offsetY, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    return pdf.output('blob');
  } finally {
    mount.remove();
  }
}

export function sanitizePdfFileName(title: string): string {
  const base = (title || 'document').trim() || 'document';
  const safe = base.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 80);
  return `${safe || 'document'}.pdf`;
}
