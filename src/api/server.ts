import express from 'express';
import cors from 'cors';
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
import { startPeerSync } from './peers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = parseInt(process.env.PORT || '3039', 10);
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use(express.json());

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

// Initialize DB and then listen
initDb().then(() => {
  startPeerSync();
  app.listen(PORT, HOST, () => {
    console.log(`API Server running on http://${HOST}:${PORT}`);
  });
}).catch(err => {
  console.error('Fatal: Failed to initialize SQLite database:', err);
  process.exit(1);
});
