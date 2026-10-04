const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret';

const authMiddleware = require('../src/middleware/authMiddleware');

describe('Claude Batch 1 - authMiddleware white-box tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('TC-B1-001: rejects request when Authorization header is missing', () => {
    const req = {
      headers: {}
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Access denied. No token provided.'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('TC-B1-002: rejects request when Authorization header does not start with Bearer', () => {
    const req = {
      headers: {
        authorization: 'Basic abc123'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Access denied. No token provided.'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('TC-B1-003: accepts a valid JWT and attaches decoded user to request', () => {
    const payload = {
      id: 123,
      email: 'test@example.com'
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '15m'
    });

    const req = {
      headers: {
        authorization: `Bearer ${token}`
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(req.user.id).toBe(123);
    expect(req.user.email).toBe('test@example.com');
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('TC-B1-004: rejects an expired JWT with HTTP 401', () => {
    const token = jwt.sign(
      {
        id: 123,
        email: 'expired@example.com'
      },
      process.env.JWT_SECRET,
      {
        expiresIn: -1
      }
    );

    const req = {
      headers: {
        authorization: `Bearer ${token}`
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Token expired. Please refresh.'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('TC-B1-005: rejects another invalid JWT with HTTP 403', () => {
    const req = {
      headers: {
        authorization: 'Bearer definitely-not-a-valid-jwt'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Invalid token.'
      })
    );
    expect(next).not.toHaveBeenCalled();
  });
});