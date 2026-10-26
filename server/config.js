import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'enterprise_knowledge_ai',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES || '7d',
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
    flashModel: process.env.GEMINI_FLASH_MODEL || 'gemini-2.0-flash',
    proModel: process.env.GEMINI_PRO_MODEL || 'gemini-2.5-pro',
    embeddingDimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '768', 10),
  },

  retrieval: {
    topK: parseInt(process.env.RETRIEVAL_TOP_K || '10', 10),
    minSimilarity: parseFloat(process.env.MIN_SIMILARITY || '0.4'),
    efSearch: parseInt(process.env.HNSW_EF_SEARCH || '100', 10),
  },

  chunking: {
    maxTokens: parseInt(process.env.CHUNK_MAX_TOKENS || '800', 10),
    minTokens: parseInt(process.env.CHUNK_MIN_TOKENS || '100', 10),
    overlapTokens: parseInt(process.env.CHUNK_OVERLAP_TOKENS || '100', 10),
  },

  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800', 10),
    allowedMimeTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/markdown',
      'text/plain',
    ],
  },

  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10),
    lockoutDurationMin: parseInt(process.env.LOCKOUT_DURATION_MINUTES || '30', 10),
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },

  refusalMessage:
    'I cannot answer this question based on the authorized enterprise documents provided.',
};
