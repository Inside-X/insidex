import { cookieParser } from '../../src/middlewares/cookieParser.js';
import { jest } from '@jest/globals';

describe('cookieParser', () => {
  test('parses valid cookies and decodes', () => {
    const req = { get: () => 'a=1; b=hello%20world; c=x=y' };
    const next = jest.fn();
    cookieParser(req, {}, next);
    expect(req.cookies).toEqual({ a: '1', b: 'hello world', c: 'x=y' });
    expect(next).toHaveBeenCalled();
  });
  test('handles malformed decode and missing header', () => {
    const req1 = { get: () => 'bad=%E0%A4%A' }; const next1=jest.fn(); cookieParser(req1, {}, next1); expect(req1.cookies.bad).toBe('%E0%A4%A');
    const req2 = { get: () => undefined }; const next2=jest.fn(); cookieParser(req2, {}, next2); expect(req2.cookies).toEqual({});
  });
});