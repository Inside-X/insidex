import { jest } from '@jest/globals';
const sendApiError = jest.fn();
const createGuest = jest.fn();
const issueAccessToken = jest.fn(() => 'token-1');
jest.unstable_mockModule('../../src/utils/api-error.js', () => ({ sendApiError }));
jest.unstable_mockModule('../../src/repositories/user.repository.js', () => ({ userRepository: { createGuest } }));
jest.unstable_mockModule('../../src/security/access-token.js', () => ({ issueAccessToken }));
const { ensureCheckoutSessionJWT } = await import('../../src/middlewares/checkoutIdentity.js');

describe('checkoutIdentity', () => {
  test('passes through when authorization exists', async () => {
    const next=jest.fn(); const req={get:()=> 'Bearer x', body:{}, headers:{}}; const res={locals:{}};
    await ensureCheckoutSessionJWT(req,res,next); expect(next).toHaveBeenCalled(); expect(createGuest).not.toHaveBeenCalled();
  });
  test('401 when guest payload missing', async () => {
    const req={get:()=>null, body:{}, headers:{}}; const res={locals:{}};
    await ensureCheckoutSessionJWT(req,res,jest.fn());
    expect(sendApiError).toHaveBeenCalledWith(req,res,401,'UNAUTHORIZED','Authentication required or guest checkout payload missing');
  });
  test('500 when guest user invalid', async () => {
    createGuest.mockResolvedValueOnce({ id: null, isGuest: false });
    const req={get:()=>null, body:{email:'e',address:'a'}, headers:{}}; const res={locals:{}};
    await ensureCheckoutSessionJWT(req,res,jest.fn());
    expect(sendApiError).toHaveBeenCalledWith(req,res,500,'GUEST_ISOLATION_VIOLATION','Invalid guest checkout identity');
  });
  test('injects implicit guest token', async () => {
    createGuest.mockResolvedValueOnce({ id: 'g1', isGuest: true });
    const req={get:()=>null, body:{guest:{email:'e',address:'a'}}, headers:{}}; const res={locals:{}}; const next=jest.fn();
    await ensureCheckoutSessionJWT(req,res,next);
    expect(issueAccessToken).toHaveBeenCalled();
    expect(req.headers.authorization).toBe('Bearer token-1');
    expect(res.locals.implicitGuestToken).toBe('token-1');
    expect(next).toHaveBeenCalled();
  });
});