import { SourceAdapter } from './base.js';

export class TxtAdapter extends SourceAdapter {
  async extract(input) {
    const text = typeof input === 'string' ? input : input.toString('utf-8');

    // Treat the entire file as a single page
    const pages = [{ pageNumber: 1, text }];

    return { pages: this.postprocess(pages), metadata: {} };
  }
}
