import mammoth from 'mammoth';
import { SourceAdapter } from './base.js';

export class DocxAdapter extends SourceAdapter {
  async extract(buffer) {
    const result = await mammoth.extractRawText({ buffer });

    // DOCX doesn't have native page numbers in extracted text.
    // We split on common page-break indicators or treat as single page.
    const text = result.value;
    const warnings = result.messages;

    // Try splitting on section breaks
    const sections = text.split(/\n{4,}/);
    let pages;

    if (sections.length > 1) {
      pages = sections.map((section, i) => ({
        pageNumber: i + 1,
        text: section,
      }));
    } else {
      pages = [{ pageNumber: 1, text }];
    }

    const metadata = {
      warnings: warnings.map((w) => w.message),
    };

    return { pages: this.postprocess(pages), metadata };
  }
}
