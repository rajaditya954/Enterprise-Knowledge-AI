import pdfParse from 'pdf-parse';
import { SourceAdapter } from './base.js';

export class PdfAdapter extends SourceAdapter {
  async extract(buffer) {
    const data = await pdfParse(buffer);
    const totalPages = data.numpages;
    const fullText = data.text;

    // pdf-parse returns all text combined. We attempt to split by page markers
    // or fall back to distributing text evenly.
    let pages = [];

    // Check if the text contains form-feed characters (page breaks)
    if (fullText.includes('\f')) {
      const pageTexts = fullText.split('\f');
      pages = pageTexts.map((text, i) => ({
        pageNumber: i + 1,
        text: text,
      }));
    } else {
      // Fallback: treat entire content as a single page
      pages = [{ pageNumber: 1, text: fullText }];
    }

    // Ensure we don't exceed known page count
    pages = pages.slice(0, totalPages || pages.length);

    const metadata = {
      title: data.info?.Title || null,
      author: data.info?.Author || null,
      pageCount: totalPages,
      creator: data.info?.Creator || null,
    };

    return { pages: this.postprocess(pages), metadata };
  }
}
