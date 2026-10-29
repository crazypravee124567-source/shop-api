import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { ZodError } from 'zod';
import { config } from './config.js';
import { logger } from './logger.js';
import { query } from './db.js';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';

export const app = express();

app.set('trust proxy', 1); // behind a load balancer / reverse proxy
app.use(helmet());
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '100kb' }));
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));

// Liveness + DB readiness: point your platform's health check here
app.get('/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'db_unavailable' });
  }
});

app.use('/api/auth', rateLimit({ windowMs: 15 * 60_000, limit: 30 }), authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err instanceof ZodError) return res.status(400).json({ error: 'Validation failed', details: err.issues });
  if (err.status) return res.status(err.status).json({ error: err.message });
  req.log.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
