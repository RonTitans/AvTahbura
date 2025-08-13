import bcrypt from 'bcrypt';

// Basic Authentication Middleware
export function basicAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');
  
  const adminUser = process.env.ADMIN_USER;
  const adminPassHash = process.env.ADMIN_PASS_HASH;
  
  if (!adminUser || !adminPassHash) {
    console.error('Admin credentials not configured in environment');
    return res.status(500).json({ error: 'Server configuration error' });
  }
  
  // Verify username and password
  if (username !== adminUser) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  // Verify password hash
  bcrypt.compare(password, adminPassHash, (err, result) => {
    if (err || !result) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    next();
  });
}

// Middleware to protect static files
export function protectStaticFile(filename) {
  return (req, res, next) => {
    if (req.path.endsWith(filename)) {
      return basicAuth(req, res, next);
    }
    next();
  };
}