const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

jest.mock('bcryptjs');

jest.mock('jsonwebtoken');

jest.mock('../src/services/supabase', () => ({
  from: jest.fn()
}));

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn()
  }))
}));

jest.mock('express-validator', () => ({
  validationResult: jest.fn()
}));

const supabase = require('../src/services/supabase');

const {
  register,
  login,
  logout,
  forgotPassword,
  resetPassword,
  refreshTokens,
  resetTokens
} = require('../src/controllers/authController');

// Capture the exact transporter created by authController.js
const transporter = nodemailer.createTransport.mock.results[0].value;

describe('Claude Batch 1 - authController white-box tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    refreshTokens.clear();
    resetTokens.clear();

    process.env.JWT_SECRET = 'test-secret';
    process.env.REFRESH_TOKEN_SECRET = 'refresh-secret';

    jwt.sign.mockReturnValue('mock-token');

    const { validationResult } = require('express-validator');

validationResult.mockReturnValue({
  isEmpty: () => true,
  array: () => []
});

    transporter.sendMail.mockResolvedValue({
      messageId: 'test-message'
    });
  });

  test('TC-B1-007: register returns 400 when email already exists', async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: 1,
          email: 'test@example.com'
        },
        error: null
      })
    });

    const req = {
      body: {
        name: 'Test User',
        email: 'test@example.com',
        password: 'Password1'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'User already exists'
    });
  });

  test('TC-B1-008: register creates a user successfully', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({
      data: null,
      error: null
    });

    const single = jest.fn().mockResolvedValue({
      data: {
        id: 1,
        name: 'Test User',
        email: 'test@example.com'
      },
      error: null
    });

    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle,
      insert: jest.fn().mockReturnThis(),
      single
    });

    bcrypt.hash.mockResolvedValue('hashed-password');

    const req = {
      body: {
        name: 'Test User',
        email: 'test@example.com',
        password: 'Password1'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await register(req, res);

    expect(bcrypt.hash).toHaveBeenCalledWith(
      'Password1',
      12
    );

    expect(res.status).toHaveBeenCalledWith(201);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'User registered successfully',
        accessToken: 'mock-token',
        refreshToken: 'mock-token'
      })
    );

    expect(refreshTokens.has('mock-token')).toBe(true);
  });

  test('TC-B1-009: login returns 404 when user does not exist', async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: null,
        error: null
      })
    });

    const req = {
      body: {
        email: 'missing@example.com',
        password: 'Password1'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(404);

    expect(res.json).toHaveBeenCalledWith({
      message: 'User not found'
    });
  });

  test('TC-B1-010: login returns 400 for incorrect password', async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: 1,
          email: 'test@example.com',
          password: 'hashed-password'
        },
        error: null
      })
    });

    bcrypt.compare.mockResolvedValue(false);

    const req = {
      body: {
        email: 'test@example.com',
        password: 'WrongPassword1'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await login(req, res);

    expect(bcrypt.compare).toHaveBeenCalledWith(
      'WrongPassword1',
      'hashed-password'
    );

    expect(res.status).toHaveBeenCalledWith(400);

    expect(res.json).toHaveBeenCalledWith({
      message: 'Invalid password'
    });
  });

  test('TC-B1-011: login succeeds with correct password', async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: 1,
          email: 'test@example.com',
          password: 'hashed-password'
        },
        error: null
      })
    });

    bcrypt.compare.mockResolvedValue(true);

    const req = {
      body: {
        email: 'test@example.com',
        password: 'Password1'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await login(req, res);

    expect(bcrypt.compare).toHaveBeenCalledWith(
      'Password1',
      'hashed-password'
    );

    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Login successful',
        accessToken: 'mock-token',
        refreshToken: 'mock-token'
      })
    );

    expect(refreshTokens.has('mock-token')).toBe(true);
  });

  test('TC-B1-012: logout rejects a missing token', () => {
    const req = {
      body: {}
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    logout(req, res);

    expect(res.status).toHaveBeenCalledWith(400);

    expect(res.json).toHaveBeenCalledWith({
      message: 'Refresh token is required'
    });
  });

  test('TC-B1-013: logout rejects a refresh token that is not stored', () => {
    const req = {
      body: {
        refreshToken: 'not-stored-token'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    logout(req, res);

    expect(res.status).toHaveBeenCalledWith(400);

    expect(res.json).toHaveBeenCalledWith({
      message: 'Invalid refresh token'
    });
  });

  test('TC-B1-014: logout removes a valid refresh token', () => {
    refreshTokens.add('valid-refresh-token');

    const req = {
      body: {
        refreshToken: 'valid-refresh-token'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    logout(req, res);

    expect(refreshTokens.has('valid-refresh-token')).toBe(false);

    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith({
      message: 'Logged out successfully'
    });
  });

  test('TC-B1-015: forgotPassword rejects missing email', async () => {
    const req = {
      body: {}
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await forgotPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(400);

    expect(res.json).toHaveBeenCalledWith({
      message: 'Email is required'
    });
  });

  test('TC-B1-016: forgotPassword returns success when user does not exist', async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: null,
        error: null
      })
    });

    const req = {
      body: {
        email: 'unknown@example.com'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await forgotPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith({
      message: 'If that email exists, a reset link has been sent.'
    });
  });

  test('TC-B1-017: forgotPassword returns 500 when Supabase lookup fails', async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: null,
        error: {
          message: 'Database error'
        }
      })
    });

    const req = {
      body: {
        email: 'test@example.com'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await forgotPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(500);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Something went wrong',
        error: 'Database error'
      })
    );
  });

  test('TC-B1-018: forgotPassword creates reset token and sends email for existing user', async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: 1,
          name: 'Test User',
          email: 'test@example.com'
        },
        error: null
      })
    });

    const req = {
      body: {
        email: 'test@example.com'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await forgotPassword(req, res);

    expect(transporter.sendMail).toHaveBeenCalledTimes(1);

    expect(transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'test@example.com',
        subject: 'Reset your HireMate password'
      })
    );

    expect(resetTokens.size).toBe(1);

    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith({
      message: 'If that email exists, a reset link has been sent.'
    });
  });
    test('TC-B1-019: resetPassword rejects missing token or password', async () => {
    const req = {
      body: {}
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await resetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(400);

    expect(res.json).toHaveBeenCalledWith({
      message: 'Token and new password are required'
    });
  });
    test('TC-B1-020: resetPassword rejects an invalid reset token', async () => {
    const req = {
      body: {
        token: 'invalid-token',
        password: 'NewPassword1'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await resetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(400);

    expect(res.json).toHaveBeenCalledWith({
    message: 'Invalid or already used reset token'
    });
  });
  test('TC-B1-021: resetPassword rejects an expired reset token', async () => {
    const req = {
      body: {
        token: 'expired-token',
        password: 'NewPassword1'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    resetTokens.set('expired-token', {
      email: 'test@example.com',
      expiresAt: Date.now() - 1000
    });

    await resetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(400);

    expect(res.json).toHaveBeenCalledWith({
      message: 'Reset token has expired'
    });

    expect(resetTokens.has('expired-token')).toBe(false);
  });
    test('TC-B1-022: resetPassword rejects a password that fails password requirements', async () => {
    const req = {
      body: {
        token: 'valid-token',
        password: 'weakpass'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    resetTokens.set('valid-token', {
      email: 'test@example.com',
      expiresAt: Date.now() + 3600000
    });

    await resetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(400);

    expect(res.json).toHaveBeenCalledWith({
      message: 'Password must be at least 8 characters, include one uppercase letter and one number'
    });
  });
    test('TC-B1-023: resetPassword returns 500 when Supabase user lookup fails', async () => {
    const req = {
      body: {
        token: 'valid-token',
        password: 'NewPassword1'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    resetTokens.set('valid-token', {
      email: 'test@example.com',
      expiresAt: Date.now() + 3600000
    });

    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: null,
            error: new Error('Database lookup failed')
          })
        })
      })
    });

    await resetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(500);

    expect(res.json).toHaveBeenCalledWith({
  message: 'Something went wrong',
  error: 'Database lookup failed'
    });
  });
    test('TC-B1-024: resetPassword returns 404 when reset email user does not exist', async () => {
    const req = {
      body: {
        token: 'valid-token',
        password: 'NewPassword1'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    resetTokens.set('valid-token', {
      email: 'missing@example.com',
      expiresAt: Date.now() + 3600000
    });

    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: null,
            error: null
          })
        })
      })
    });

    await resetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(404);

    expect(res.json).toHaveBeenCalledWith({
      message: 'User not found'
    });
  });

  test('TC-B1-025: resetPassword returns 500 when password hashing fails', async () => {
    const req = {
      body: {
        token: 'valid-token',
        password: 'NewPassword1'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    resetTokens.set('valid-token', {
      email: 'test@example.com',
      expiresAt: Date.now() + 3600000
    });

    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: { email: 'test@example.com' },
            error: null
          })
        })
      })
    });

    bcrypt.hash.mockRejectedValue(new Error('Hash failed'));

    await resetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(500);

    expect(res.json).toHaveBeenCalledWith({
      message: 'Something went wrong',
      error: 'Hash failed'
    });
  });

  test('TC-B1-026: resetPassword returns 500 when password update fails', async () => {
    const req = {
      body: {
        token: 'valid-token',
        password: 'NewPassword1'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    resetTokens.set('valid-token', {
      email: 'test@example.com',
      expiresAt: Date.now() + 3600000
    });

    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: { email: 'test@example.com' },
            error: null
          })
        })
      }),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          error: new Error('Password update failed')
        })
      })
    });
    bcrypt.hash.mockResolvedValue('hashed-new-password');
    await resetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(500);

    expect(res.json).toHaveBeenCalledWith({
      message: 'Something went wrong',
      error: 'Password update failed'
    });
  });

  test('TC-B1-027: resetPassword successfully updates the password', async () => {
    const req = {
      body: {
        token: 'valid-token',
        password: 'NewPassword1'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    resetTokens.set('valid-token', {
      email: 'test@example.com',
      expiresAt: Date.now() + 3600000
    });

    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: { email: 'test@example.com' },
            error: null
          })
        })
      }),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          error: null
        })
      })
    });

    bcrypt.hash.mockResolvedValue('hashed-new-password');

    await resetPassword(req, res);

    expect(bcrypt.hash).toHaveBeenCalledWith('NewPassword1', 12);

    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith({
      message: 'Password reset successfully. Please log in.'
    });

    expect(resetTokens.has('valid-token')).toBe(false);
  });

  test('TC-B1-028: resetPassword accepts a password at the exact 8-character boundary', async () => {
    const req = {
      body: {
        token: 'valid-token',
        password: 'Passwor1'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    resetTokens.set('valid-token', {
      email: 'test@example.com',
      expiresAt: Date.now() + 3600000
    });

    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: { email: 'test@example.com' },
            error: null
          })
        })
      }),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          error: null
        })
      })
    });

    bcrypt.hash.mockResolvedValue('hashed-boundary-password');

    await resetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith({
      message: 'Password reset successfully. Please log in.'
    });
  });
    test('TC-B1-029: register returns 400 when validation fails', async () => {
    const req = {
      body: {}
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const { validationResult } = require('express-validator');

validationResult.mockReturnValue({
  isEmpty: () => false,
  array: () => [{ msg: 'Invalid input' }]
});

    await register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);

    expect(res.json).toHaveBeenCalledWith({
      errors: [{ msg: 'Invalid input' }]
    });
  });

  test('TC-B1-030: register returns 500 when an unexpected error occurs', async () => {
    const req = {
      body: {
        name: 'Test User',
        email: 'test@example.com',
        password: 'Password1'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    supabase.from.mockImplementation(() => {
      throw new Error('Unexpected database error');
    });

    await register(req, res);

    expect(res.status).toHaveBeenCalledWith(500);

    expect(res.json).toHaveBeenCalledWith({
      message: 'Something went wrong',
      error: 'Unexpected database error'
    });
  });

  test('TC-B1-031: login returns 500 when an unexpected error occurs', async () => {
    const req = {
      body: {
        email: 'test@example.com',
        password: 'Password1'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    supabase.from.mockImplementation(() => {
      throw new Error('Unexpected login error');
    });

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(500);

    expect(res.json).toHaveBeenCalledWith({
      message: 'Something went wrong',
      error: 'Unexpected login error'
    });
  });

  test('TC-B1-032: forgotPassword continues successfully when email sending fails', async () => {
    const req = {
      body: {
        email: 'test@example.com'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: {
              name: 'Test User',
              email: 'test@example.com'
            },
            error: null
          })
        })
      })
    });

    transporter.sendMail.mockRejectedValue(
      new Error('SMTP sending failed')
    );

    await forgotPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith({
      message: 'If that email exists, a reset link has been sent.'
    });
  });
  test('TC-B1-033: register returns 500 when Supabase insert fails', async () => {
  const req = {
    body: {
      name: 'Test User',
      email: 'test@example.com',
      password: 'Password1'
    }
  };

  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  };

  supabase.from.mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: null
        })
      })
    }),
    insert: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: null,
          error: new Error('User insert failed')
        })
      })
    })
  });

  await register(req, res);

  expect(res.status).toHaveBeenCalledWith(500);

  expect(res.json).toHaveBeenCalledWith({
    message: 'Something went wrong',
    error: 'User insert failed'
  });
});
});
