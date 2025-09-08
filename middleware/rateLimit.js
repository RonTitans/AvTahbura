// Simple in-memory rate limiter
const requestCounts = new Map();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 5;

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of requestCounts.entries()) {
    if (now - data.windowStart > WINDOW_MS) {
      requestCounts.delete(key);
    }
  }
}, WINDOW_MS);

export function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  let requestData = requestCounts.get(ip);
  
  if (!requestData || now - requestData.windowStart > WINDOW_MS) {
    // New window
    requestData = {
      windowStart: now,
      count: 1
    };
    requestCounts.set(ip, requestData);
    return next();
  }
  
  requestData.count++;
  
  if (requestData.count > MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.ceil((requestData.windowStart + WINDOW_MS - now) / 1000)
    });
  }
  
  next();
}