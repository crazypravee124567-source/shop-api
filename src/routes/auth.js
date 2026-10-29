import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../db.js';
import { config } from '../config.js';

const router = Router();
const creds = z.object({ email: z.string().email().toLowerCase(), password: z.string().min(8).max(100) });
const sign = (u) => jwt.sign({ sub: u.id, role: u.role }, config.jwtSecret, { expiresIn: '1h' });

router.post('/register', async (req, res, next) => {
  try {
    const { email, password } = creds.parse(req.body);
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await query(
      'INSERT INTO users(email, password_hash) VALUES ($1, $2) RETURNING id, email, role',
      [email, hash]
    );
    res.status(201).json({ user: rows[0], token: sign(rows[0]) });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = creds.parse(req.body);
    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    res.json({ user: { id: user.id, email: user.email, role: user.role }, token: sign(user) });
  } catch (err) {
    next(err);
  }
});

export default router;
