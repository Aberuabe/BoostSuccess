const request = require('supertest');
const app = require('./server');
const jwt = require('jsonwebtoken');

// Mocking Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: { id: 1, max_places: 5, session_open: true }, error: null }),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    delete: jest.fn().mockReturnThis(),
    neq: jest.fn().mockResolvedValue({ error: null })
  }))
}));

// Mocking Nodemailer
jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    verify: jest.fn().mockImplementation((callback) => callback(null, true)),
    sendMail: jest.fn().mockResolvedValue(true)
  })
}));

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_for_dev';
const token = jwt.sign({ userId: 'admin' }, JWT_SECRET);

describe('Admin Place Management & Global Reset', () => {
  
  test('POST /admin/update-places increment should work', async () => {
    const res = await request(app)
      .post('/admin/update-places')
      .set('x-admin-token', token)
      .send({ action: 'increment' });
    
    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
  });

  test('POST /admin/update-places decrement should work', async () => {
    const res = await request(app)
      .post('/admin/update-places')
      .set('x-admin-token', token)
      .send({ action: 'decrement' });
    
    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
  });

  test('POST /admin/reset-all should clear data', async () => {
    const res = await request(app)
      .post('/admin/reset-all')
      .set('x-admin-token', token);
    
    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('réinitialisé');
  });

  test('Routes should be protected', async () => {
    const res = await request(app).post('/admin/reset-all');
    expect(res.statusCode).toEqual(401);
  });
});
