import { jest } from '@jest/globals';
import bcrypt from 'bcrypt';
import { basicAuth, protectStaticFile } from '../middleware/auth.js';

// Mock bcrypt
jest.mock('bcrypt');

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
      path: '/'
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn()
    };
    next = jest.fn();
    
    // Reset environment variables
    process.env.ADMIN_USER = 'admin';
    process.env.ADMIN_PASS_HASH = '$2b$10$hashedpassword';
  });

  describe('basicAuth', () => {
    it('should reject request without auth header', () => {
      basicAuth(req, res, next);
      
      expect(res.setHeader).toHaveBeenCalledWith('WWW-Authenticate', 'Basic realm="Admin Area"');
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with invalid auth format', () => {
      req.headers.authorization = 'Bearer token123';
      
      basicAuth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject wrong username', () => {
      const credentials = Buffer.from('wronguser:password').toString('base64');
      req.headers.authorization = `Basic ${credentials}`;
      
      basicAuth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject wrong password', () => {
      const credentials = Buffer.from('admin:wrongpassword').toString('base64');
      req.headers.authorization = `Basic ${credentials}`;
      
      bcrypt.compare.mockImplementation((password, hash, callback) => {
        callback(null, false);
      });
      
      basicAuth(req, res, next);
      
      expect(bcrypt.compare).toHaveBeenCalledWith('wrongpassword', '$2b$10$hashedpassword', expect.any(Function));
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow valid credentials', () => {
      const credentials = Buffer.from('admin:correctpassword').toString('base64');
      req.headers.authorization = `Basic ${credentials}`;
      
      bcrypt.compare.mockImplementation((password, hash, callback) => {
        callback(null, true);
      });
      
      basicAuth(req, res, next);
      
      expect(bcrypt.compare).toHaveBeenCalledWith('correctpassword', '$2b$10$hashedpassword', expect.any(Function));
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should handle missing environment variables', () => {
      delete process.env.ADMIN_USER;
      
      basicAuth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Server configuration error' });
    });

    it('should handle bcrypt error', () => {
      const credentials = Buffer.from('admin:password').toString('base64');
      req.headers.authorization = `Basic ${credentials}`;
      
      bcrypt.compare.mockImplementation((password, hash, callback) => {
        callback(new Error('bcrypt error'), null);
      });
      
      basicAuth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('protectStaticFile', () => {
    it('should protect specific file', () => {
      const middleware = protectStaticFile('integrations.html');
      req.path = '/integrations.html';
      
      middleware(req, res, next);
      
      // Should call basicAuth (which will fail due to no auth header)
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should not protect other files', () => {
      const middleware = protectStaticFile('integrations.html');
      req.path = '/index.html';
      
      middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should handle file in subdirectory', () => {
      const middleware = protectStaticFile('admin.html');
      req.path = '/admin/admin.html';
      
      middleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});