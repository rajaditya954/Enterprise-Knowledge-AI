import fs from 'node:fs/promises';
import path from 'node:path';
import { query, withTransaction } from '../db.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { sha256 } from '../utils/crypto.js';
import { chunkPages } from './chunking.js';
import { embedTexts } from './gemini.js';
import { PdfAdapter } from '../adapters/pdf.js';
import { DocxAdapter } from '../adapters/docx.js';
import { MarkdownAdapter } from '../adapters/markdown.js';
import { TxtAdapter } from '../adapters/txt.js';

const ADAPTERS = {
  'application/pdf': new PdfAdapter(),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': new DocxAdapter(),
  'text/markdown': new MarkdownAdapter(),
  'text/plain': new TxtAdapter(),
};

// In-memory job queue for async processing
const jobQueue = new Map();

/**
 * Get the appropriate adapter for a MIME type.
 */
function getAdapter(mimeType) {
  const adapter = ADAPTERS[mimeType];
  if (!adapter) {
    throw new Error(`Unsupported MIME type: ${mimeType}`);
  }
  return adapter;
}

/**
 * Upload and begin ingestion of a document.
 * Returns immediately with the document record; ingestion runs in background.
 */
export async function uploadDocument({ file, title, departmentId, permissionLevel, docType, uploadedBy }) {
  // Validate MIME type
  if (!config.upload.allowedMimeTypes.includes(file.mimetype)) {
    throw new Error(`Unsupported file type: ${file.mimetype}`);
  }

  // Validate file size
  if (file.size > config.upload.maxFileSize) {
    throw new Error(`File too large. Maximum size: ${config.upload.maxFileSize} bytes`);
  }

  // Compute content hash
  const fileBuffer = await fs.readFile(file.path);
  const contentHash = sha256(fileBuffer);

  // Check for duplicate within department
  const existing = await query(
    'SELECT id FROM documents WHERE content_hash = $1 AND department_id = $2',
    [contentHash, departmentId]
  );
  if (existing.rows.length > 0) {
    // Clean up uploaded file
    await fs.unlink(file.path).catch(() => {});
    throw new Error('Duplicate document: this file already exists in the department');
  }

  // Create document record
  const result = await query(
    `INSERT INTO documents (title, original_filename, storage_path, mime_type, content_hash,
       department_id, permission_level, doc_type, status, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', $9)
     RETURNING *`,
    [
      title || file.originalname,
      file.originalname,
      file.path,
      file.mimetype,
      contentHash,
      departmentId,
      permissionLevel,
      docType || null,
      uploadedBy,
    ]
  );

  const document = result.rows[0];

  // Start background ingestion
  processDocumentAsync(document.id).catch((err) => {
    logger.error({ err, documentId: document.id }, 'Background ingestion failed');
  });

  return document;
}

/**
 * Process a document asynchronously: extract, chunk, embed, persist.
 */
export async function processDocumentAsync(documentId) {
  const jobId = documentId;
  jobQueue.set(jobId, { status: 'processing', startedAt: Date.now() });

  try {
    // Set status to PROCESSING
    await query("UPDATE documents SET status = 'PROCESSING', updated_at = NOW() WHERE id = $1", [
      documentId,
    ]);

    // Fetch document
    const docResult = await query('SELECT * FROM documents WHERE id = $1', [documentId]);
    if (docResult.rows.length === 0) throw new Error('Document not found');
    const doc = docResult.rows[0];

    // Read file
    const fileBuffer = await fs.readFile(doc.storage_path);

    // Extract text
    const adapter = getAdapter(doc.mime_type);
    const { pages, metadata } = await adapter.extract(fileBuffer);

    if (pages.length === 0) {
      throw new Error('No text content extracted from document');
    }

    // Chunk
    const chunks = chunkPages(pages);
    logger.info({ documentId, pageCount: pages.length, chunkCount: chunks.length }, 'Chunked document');

    if (chunks.length === 0) {
      throw new Error('No chunks generated from document content');
    }

    // Embed all chunks BEFORE opening a transaction
    const chunkTexts = chunks.map((c) => c.content);
    const embeddings = await embedTexts(chunkTexts, 'RETRIEVAL_DOCUMENT');

    // Validate dimensions
    for (const embedding of embeddings) {
      if (embedding.length !== config.gemini.embeddingDimensions) {
        throw new Error(
          `Embedding dimension mismatch: expected ${config.gemini.embeddingDimensions}, got ${embedding.length}`
        );
      }
    }

    // Persist in a single short transaction
    await withTransaction(async (client) => {
      // Delete old chunks (for re-ingestion)
      await client.query('DELETE FROM document_chunks WHERE document_id = $1', [documentId]);

      // Insert chunks
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddings[i];

        await client.query(
          `INSERT INTO document_chunks
             (document_id, chunk_index, content, page_number, token_count, metadata,
              department_id, permission_level, embedding)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            documentId,
            i,
            chunk.content,
            chunk.pageNumber,
            chunk.tokenCount,
            JSON.stringify({
              pageRange: chunk.pageRange,
              sectionHeading: chunk.sectionHeading,
              extractionMetadata: metadata,
            }),
            doc.department_id,
            doc.permission_level,
            JSON.stringify(embedding),
          ]
        );
      }

      // Set document to READY
      await client.query(
        "UPDATE documents SET status = 'READY', updated_at = NOW() WHERE id = $1",
        [documentId]
      );
    });

    jobQueue.set(jobId, { status: 'completed', completedAt: Date.now() });
    logger.info({ documentId, chunkCount: chunks.length }, 'Document ingestion complete');
  } catch (err) {
    // Set document to FAILED
    await query(
      "UPDATE documents SET status = 'FAILED', error_message = $2, updated_at = NOW() WHERE id = $1",
      [documentId, err.message]
    ).catch(() => {});

    jobQueue.set(jobId, { status: 'failed', error: err.message });
    logger.error({ err, documentId }, 'Document ingestion failed');
    throw err;
  }
}

/**
 * Re-ingest a document: delete old chunks, bump version, reprocess.
 */
export async function reindexDocument(documentId) {
  await query(
    "UPDATE documents SET version = version + 1, status = 'PENDING', error_message = NULL, updated_at = NOW() WHERE id = $1",
    [documentId]
  );
  await processDocumentAsync(documentId);
}

/**
 * Delete a document and its chunks (cascade).
 */
export async function deleteDocument(documentId) {
  const docResult = await query('SELECT storage_path FROM documents WHERE id = $1', [documentId]);
  if (docResult.rows.length > 0) {
    const storagePath = docResult.rows[0].storage_path;
    await fs.unlink(storagePath).catch(() => {});
  }
  await query('DELETE FROM documents WHERE id = $1', [documentId]);
}

/**
 * Get the status of an ingestion job.
 */
export function getJobStatus(documentId) {
  return jobQueue.get(documentId) || null;
}
