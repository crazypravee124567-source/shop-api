import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const orderSchema = z.object({
  items: z.array(z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().positive().max(100),
  })).min(1).max(50),
});

// Create an order: transactional, row-locks products so stock can't go negative
router.post('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { items } = orderSchema.parse(req.body);
    await client.query('BEGIN');

    let total = 0;
    const lines = [];
    // lock in id order to avoid deadlocks between concurrent orders
    for (const item of [...items].sort((a, b) => a.productId - b.productId)) {
      const { rows } = await client.query('SELECT id, price_cents, stock FROM products WHERE id = $1 FOR UPDATE', [item.productId]);
      const product = rows[0];
      if (!product) throw Object.assign(new Error(`Product ${item.productId} not found`), { status: 404 });
      if (product.stock < item.quantity) throw Object.assign(new Error(`Insufficient stock for product ${item.productId}`), { status: 409 });
      await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [item.quantity, product.id]);
      total += product.price_cents * item.quantity;
      lines.push({ product_id: product.id, quantity: item.quantity, unit_price_cents: product.price_cents });
    }

    const { rows: [order] } = await client.query(
      'INSERT INTO orders(user_id, total_cents) VALUES ($1, $2) RETURNING *', [req.user.sub, total]);
    for (const l of lines) {
      await client.query(
        'INSERT INTO order_items(order_id, product_id, quantity, unit_price_cents) VALUES ($1,$2,$3,$4)',
        [order.id, l.product_id, l.quantity, l.unit_price_cents]);
    }
    await client.query('COMMIT');
    res.status(201).json({ ...order, items: lines });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT o.*, COALESCE(json_agg(json_build_object(
          'product_id', i.product_id, 'quantity', i.quantity, 'unit_price_cents', i.unit_price_cents))
          FILTER (WHERE i.id IS NOT NULL), '[]') AS items
       FROM orders o LEFT JOIN order_items i ON i.order_id = o.id
       WHERE o.user_id = $1 GROUP BY o.id ORDER BY o.id DESC`, [req.user.sub]);
    res.json(rows);
  } catch (err) { next(err); }
});

export default router;
