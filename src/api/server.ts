import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { initDb } from '../db/db.js';
import statusRouter from './routes/status.js';
import blocksRouter from './routes/blocks.js';
import txRouter from './routes/tx.js';
import addressRouter from './routes/address.js';
import searchRouter from './routes/search.js';
import supplyRouter from './routes/supply.js';
import networkRouter from './routes/network.js';
import richlistRouter from './routes/richlist.js';
import movementsRouter from './routes/movements.js';
import transactionsRouter from './routes/transactions.js';
import attestationsRouter from './routes/attestations.js';
import glyphsRouter from './routes/glyphs.js';
import { startPeerSync } from './peers.js';
import { runIndexer } from '../indexer/indexer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = parseInt(process.env.PORT || '3039', 10);
const HOST = process.env.HOST || '::';

// M-3: Security headers via helmet
app.use(helmet({
  contentSecurityPolicy: false, // Permits inline SVG rendering and Vite assets
  crossOriginEmbedderPolicy: false,
}));

// M-2: Configurable CORS
const corsOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : '*';
app.use(cors({
  origin: corsOrigins,
  methods: ['GET', 'POST', 'OPTIONS'],
}));

app.use(express.json());

// M-1: API Rate Limiting to prevent DoS
const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: parseInt(process.env.RATE_LIMIT_MAX || '120', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

const heavyLimiter = rateLimit({
  windowMs: 60_000,
  max: parseInt(process.env.RATE_LIMIT_HEAVY_MAX || '30', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests on heavy resource, please try again later.' },
});

app.use('/api/', generalLimiter);
app.use('/api/richlist', heavyLimiter);
app.use('/api/supply', heavyLimiter);
app.use('/api/glyphs', heavyLimiter);

// Mount API Routes
app.use('/api/status', statusRouter);
app.use('/api/blocks', blocksRouter);
app.use('/api/tx', txRouter);
app.use('/api/address', addressRouter);
app.use('/api/search', searchRouter);
app.use('/api/supply', supplyRouter);
app.use('/api/network', networkRouter);
app.use('/api/richlist', richlistRouter);
app.use('/api/movements', movementsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/attestations', attestationsRouter);
app.use('/api/glyphs', glyphsRouter);

// Serve static web files in production
const staticPath = path.resolve(__dirname, '../../dist/web');
app.use(express.static(staticPath));

// Single Page Application route fallback
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(staticPath, 'index.html'), (err) => {
      if (err) {
        // Fallback if frontend is not built yet
        res.status(200).send('API Server is running. Frontend build not found.');
      }
    });
  } else {
    res.status(404).json({ error: 'API route not found' });
  }
});

// L-1: Global error middleware
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Unhandled Server Error]:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize DB and then listen
initDb().then(() => {
  startPeerSync();
  runIndexer().catch((err) => { console.error('Fatal indexer error:', err); });
  app.listen(PORT, HOST, () => {
    console.log(`API Server running on http://${HOST}:${PORT}`);
  });
}).catch(err => {
  console.error('Fatal: Failed to initialize SQLite database:', err);
  process.exit(1);
});
