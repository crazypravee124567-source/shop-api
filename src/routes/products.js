import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
const productSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  price_cents: z.number().int().nonnegative(),
  stock: z.number().int().nonnegative().default(0),
});

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const { rows } = await query('SELECT * FROM products ORDER BY id LIMIT $1 OFFSET $2', [limit, offset]);
    res.json({ items: rows, limit, offset });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM products WHERE id = $1', [Number(req.params.id) || 0]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const p = productSchema.parse(req.body);
    const { rows } = await query(
      'INSERT INTO products(name, description, price_cents, stock) VALUES ($1,$2,$3,$4) RETURNING *',
      [p.name, p.description, p.price_cents, p.stock]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const p = productSchema.parse(req.body);
    const { rows } = await query(
      'UPDATE products SET name=$1, description=$2, price_cents=$3, stock=$4 WHERE id=$5 RETURNING *',
      [p.name, p.description, p.price_cents, p.stock, Number(req.params.id) || 0]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { rowCount } = await query('DELETE FROM products WHERE id = $1', [Number(req.params.id) || 0]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch (err) {
    if (err.code === '23503') return res.status(409).json({ error: 'Product is referenced by orders' });
    next(err);
  }
});

export default router;
