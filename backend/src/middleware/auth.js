import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';

// Auth middleware: verifies JWT and attaches req.user
export const authenticate = (req, res, next) => {
  const header = req.headers.authorization;
  const token = header && header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ msg: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    // Les anciens JWT 30 j (sans typ) sont refusés : reconnexion obligatoire.
    if (payload.typ !== 'access') throw new Error('legacy token');
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ msg: 'Invalid or expired token' });
  }
};
