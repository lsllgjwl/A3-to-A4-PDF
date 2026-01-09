
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { SplitOptions } from '../types';

/**
 * Splits an A3 PDF page into two A4 pages and optionally adds page numbers.
 */
export const splitA3ToA4 = async (
  file: File,
  options: SplitOptions,
  onProgress: (progress: number) => void
): Promise<Uint8Array> => {
  const arrayBuffer = await file.arrayBuffer();
  const sourcePdf = await PDFDocument.load(arrayBuffer);
  const outPdf = await PDFDocument.create();
  
  // Load font for page numbering
  const font = await outPdf.embedFont(StandardFonts.Helvetica);
  const fontSize = 10;

  const pages = sourcePdf.getPages();
  const totalPages = pages.length;

  // Track how many page numbers we've assigned so far
  let pageNumberCounter = options.startingPageNumber;

  for (let i = 0; i < totalPages; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();
    
    const isEvenPage = i % 2 === 1;
    const currentRatio = (options.useDualRatios && isEvenPage && options.evenSplitRatio !== undefined)
      ? options.evenSplitRatio 
      : options.splitRatio;

    let useVerticalSplit = true;
    if (options.orientation === 'auto') {
      useVerticalSplit = width > height;
    } else {
      useVerticalSplit = options.orientation === 'vertical';
    }

    const [page1] = await outPdf.copyPages(sourcePdf, [i]);
    const [page2] = await outPdf.copyPages(sourcePdf, [i]);

    if (useVerticalSplit) {
      const splitPos = width * currentRatio;
      page1.setCropBox(0, 0, splitPos, height);
      page2.setCropBox(splitPos, 0, width - splitPos, height);
    } else {
      const splitPos = height * (1 - currentRatio); 
      page1.setCropBox(0, splitPos, width, height - splitPos);
      page2.setCropBox(0, 0, width, splitPos);
    }

    // Add page numbering logic
    const shouldAddNumberToThisA3Page = options.enablePageNumbering && i >= options.numberingStartFromPageIndex;

    if (shouldAddNumberToThisA3Page) {
      // Logic for first part
      if (options.numberingSide === 'both' || options.numberingSide === 'first') {
        const p1Size = page1.getSize();
        const text1 = `${pageNumberCounter++}`;
        const textWidth1 = font.widthOfTextAtSize(text1, fontSize);
        page1.drawText(text1, {
          x: p1Size.width / 2 - textWidth1 / 2,
          y: 15,
          size: fontSize,
          font: font,
          color: rgb(0.2, 0.2, 0.2),
        });
      }

      // Logic for second part
      if (options.numberingSide === 'both' || options.numberingSide === 'second') {
        const p2Size = page2.getSize();
        const text2 = `${pageNumberCounter++}`;
        const textWidth2 = font.widthOfTextAtSize(text2, fontSize);
        page2.drawText(text2, {
          x: p2Size.width / 2 - textWidth2 / 2,
          y: 15,
          size: fontSize,
          font: font,
          color: rgb(0.2, 0.2, 0.2),
        });
      }
    }

    outPdf.addPage(page1);
    outPdf.addPage(page2);

    onProgress(((i + 1) / totalPages) * 100);
  }

  return await outPdf.save();
};
