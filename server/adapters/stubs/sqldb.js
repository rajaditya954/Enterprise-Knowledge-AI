import { SourceAdapter } from '../base.js';

/**
 * Stub: SQL Database connector adapter.
 * Shows how a relational database connector would plug in.
 *
 * To implement:
 * 1. Accept DB connection config and query/table definitions.
 * 2. Execute queries to extract text content from rows.
 * 3. Format each row or group of rows as a "page".
 * 4. Return structured pages with metadata.
 */
export class SqlDbAdapter extends SourceAdapter {
  constructor({ connectionString, tableName, textColumn, idColumn } = {}) {
    super();
    this.connectionString = connectionString;
    this.tableName = tableName;
    this.textColumn = textColumn;
    this.idColumn = idColumn;
  }

  async extract(_input) {
    // Example implementation outline:
    //
    // const client = new pg.Client(this.connectionString);
    // await client.connect();
    // const result = await client.query(
    //   `SELECT ${this.idColumn}, ${this.textColumn} FROM ${this.tableName}`
    // );
    // const pages = result.rows.map((row, i) => ({
    //   pageNumber: i + 1,
    //   text: row[this.textColumn],
    // }));
    // await client.end();
    // return { pages: this.postprocess(pages), metadata: { source: 'database', table: this.tableName } };

    throw new Error(
      'SqlDbAdapter is a stub. Implement the extract() method with your database integration.'
    );
  }
}
