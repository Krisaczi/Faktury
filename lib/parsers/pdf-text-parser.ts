import type { BBox } from '@/types/invoice-item';

export interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  pageNumber: number;
  bbox: BBox;
}

export interface PdfTextPage {
  pageNumber: number;
  width: number;
  height: number;
  items: PdfTextItem[];
  text: string;
}

export interface PdfTextResult {
  pages: PdfTextPage[];
  fullText: string;
  totalPages: number;
}

type PdfjsTextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
};

type PdfjsTextContent = {
  items: PdfjsTextItem[];
};

type PdfjsPage = {
  getTextContent(): Promise<PdfjsTextContent>;
  getViewport(args: { scale: number }): { width: number; height: number };
};

type PdfjsDoc = {
  numPages: number;
  getPage(n: number): Promise<PdfjsPage>;
};

type PdfjsModule = {
  getDocument(args: { data: Uint8Array }): { promise: Promise<PdfjsDoc> };
  GlobalWorkerOptions: { workerSrc: string };
};

let pdfjsModulePromise: Promise<PdfjsModule> | null = null;

async function getPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = (async () => {
      const mod = (await import('pdfjs-dist')) as unknown as PdfjsModule;
      return mod;
    })();
  }
  return pdfjsModulePromise;
}

export async function extractPdfText(pdfBuffer: Uint8Array): Promise<PdfTextResult> {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: pdfBuffer }).promise;

  const pages: PdfTextPage[] = [];
  const fullTextParts: string[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();

    const items: PdfTextItem[] = [];
    const pageTextParts: string[] = [];

    for (const item of textContent.items) {
      if (!item.str || !item.str.trim()) continue;

      const tx = item.transform;
      const x = tx[4];
      const y = viewport.height - tx[5];
      const width = item.width || 0;
      const height = item.height || 10;

      const bbox: BBox = {
        x: x / viewport.width,
        y: y / viewport.height,
        width: width / viewport.width,
        height: height / viewport.height,
      };

      items.push({
        str: item.str,
        transform: tx,
        width,
        height,
        pageNumber: pageNum,
        bbox,
      });

      pageTextParts.push(item.str);
    }

    const pageText = pageTextParts.join(' ');
    pages.push({
      pageNumber: pageNum,
      width: viewport.width,
      height: viewport.height,
      items,
      text: pageText,
    });
    fullTextParts.push(pageText);
  }

  return {
    pages,
    fullText: fullTextParts.join('\n\n'),
    totalPages: doc.numPages,
  };
}
