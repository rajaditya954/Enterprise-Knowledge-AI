import { SourceAdapter } from '../base.js';

/**
 * Stub: Wiki connector adapter.
 * Shows how a wiki (Confluence, MediaWiki, Notion) connector would plug in.
 *
 * To implement:
 * 1. Accept wiki API credentials and page/space IDs in the constructor.
 * 2. Fetch pages via REST API.
 * 3. Convert HTML/wiki markup to plain text.
 * 4. Return pages with section-based page numbers.
 */
export class WikiAdapter extends SourceAdapter {
  constructor({ baseUrl, apiToken, spaceKey } = {}) {
    super();
    this.baseUrl = baseUrl;
    this.apiToken = apiToken;
    this.spaceKey = spaceKey;
  }

  async extract(_input) {
    // Example implementation outline:
    //
    // const response = await fetch(`${this.baseUrl}/rest/api/content`, {
    //   headers: { Authorization: `Bearer ${this.apiToken}` },
    //   query: { spaceKey: this.spaceKey, expand: 'body.storage' }
    // });
    // const data = await response.json();
    // const pages = data.results.map((page, i) => ({
    //   pageNumber: i + 1,
    //   text: stripHtml(page.body.storage.value),
    // }));
    // return { pages: this.postprocess(pages), metadata: { source: 'wiki', space: this.spaceKey } };

    throw new Error(
      'WikiAdapter is a stub. Implement the extract() method with your wiki API integration.'
    );
  }
}
