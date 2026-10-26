import { SourceAdapter } from './base.js';

export class MarkdownAdapter extends SourceAdapter {
  async extract(input) {
    const text = typeof input === 'string' ? input : input.toString('utf-8');

    // Split markdown by top-level headings to create logical "pages"
    const sections = text.split(/(?=^# )/m);
    const pages = sections
      .filter((s) => s.trim().length > 0)
      .map((section, i) => ({
        pageNumber: i + 1,
        text: section,
      }));

    // Extract metadata from YAML front matter if present
    const metadata = {};
    const frontMatterMatch = text.match(/^---\n([\s\S]*?)\n---/);
    if (frontMatterMatch) {
      const lines = frontMatterMatch[1].split('\n');
      for (const line of lines) {
        const [key, ...valueParts] = line.split(':');
        if (key && valueParts.length) {
          metadata[key.trim()] = valueParts.join(':').trim();
        }
      }
    }

    return { pages: this.postprocess(pages.length > 0 ? pages : [{ pageNumber: 1, text }]), metadata };
  }
}
