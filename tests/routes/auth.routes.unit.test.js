import { loadRoute } from './_router-helper.js';
import { jest } from '@jest/globals';
const pass=(_r,_s,n)=>n?.();

describe('auth.routes',()=>{
 test('critical branches', async()=>{
  const sendApiError=jest.fn((_req,res,status)=>res.status(status).json({}));
  const issueAccessToken=jest.fn(()=> 'at'); const verifyRefreshToken=jest.fn(); const issueRefreshToken=jest.fn();
  const storeRefreshSession=jest.fn(); const validateAndConsumeRefreshSession=jest.fn(); const rotateRefreshSession=jest.fn(); const revokeRefreshSession=jest.fn();
  const routes=await loadRoute('../../src/routes/auth.routes.js',{
      '../../src/validation/schemas/index.js': () => ({ authSchemas:{register:{},login:{},forgot:{},reset:{},refresh:{},logout:{}}, ordersSchemas:{create:{},paymentWebhook:{},byIdParams:{}}, paymentsSchemas:{createIntent:{}}, cartSchemas:{getCartQuery:{},add:{},updateItemParams:{},updateItemBody:{},removeItemParams:{},removeItemBody:{}}, productsSchemas:{listQuery:{},byIdParams:{},create:{}}, leadsSchemas:{create:{},listQuery:{}}, analyticsSchemas:{track:{},listQuery:{}} }),
   '../../src/validation/strict-validate.middleware.js':()=>({strictValidate:jest.fn(()=>pass)}),
   '../../src/middlewares/rateLimit.js':()=>({strictAuthRateLimiter:pass}),
   '../../src/utils/api-error.js':()=>({sendApiError}),
   '../../src/security/access-token.js':()=>({issueAccessToken}),
   '../../src/security/token-verifier.js':()=>({verifyRefreshToken}),
   '../../src/security/refresh-token.js':()=>({default:issueRefreshToken}),
   '../../src/security/refresh-token-store.js':()=>({storeRefreshSession,validateAndConsumeRefreshSession,rotateRefreshSession,revokeRefreshSession}),
  });
  const register=routes.find(r=>r.path==='/register').handlers.at(-1); const refresh=routes.find(r=>r.path==='/refresh').handlers.at(-1); const logout=routes.find(r=>r.path==='/logout').handlers.at(-1);
  let req={body:{email:'a'},cookies:{}},res={cookie:jest.fn(),clearCookie:jest.fn(),status:jest.fn(()=>res),json:jest.fn(),send:jest.fn()},next=jest.fn();
  issueRefreshToken.mockReturnValueOnce({ok:false}); await register(req,res,next); expect(sendApiError).toHaveBeenCalled();
  issueRefreshToken.mockReturnValueOnce({ok:true,sessionId:'s',token:'rt',expiresAt:'x'}); storeRefreshSession.mockResolvedValueOnce({ok:true}); await register(req,res,next); expect(res.status).toHaveBeenCalledWith(201);
  verifyRefreshToken.mockReturnValueOnce({ok:false,reason:'misconfigured'}); await refresh({body:{refreshToken:'x'},cookies:{}},res,next); expect(res.status).toHaveBeenCalledWith(500);
  verifyRefreshToken.mockReturnValueOnce({ok:false,reason:'bad'}); await refresh({body:{refreshToken:'x'},cookies:{}},res,next); expect(res.status).toHaveBeenCalledWith(401);
  verifyRefreshToken.mockReturnValue({ok:true,payload:{sid:'s',sub:'u',role:'customer'}}); validateAndConsumeRefreshSession.mockResolvedValueOnce({ok:false,reason:'flood'}); await refresh({body:{refreshToken:'x'},cookies:{}},res,next); expect(res.status).toHaveBeenCalledWith(429);
  validateAndConsumeRefreshSession.mockResolvedValueOnce({ok:true}); issueRefreshToken.mockReturnValueOnce({ok:true,sessionId:'s2',token:'rt2',expiresAt:'x'}); rotateRefreshSession.mockResolvedValueOnce({ok:true}); await refresh({body:{refreshToken:'x'},cookies:{}},res,next); expect(res.status).toHaveBeenCalledWith(200);
  await logout({body:{},cookies:{}},res,next); expect(res.clearCookie).toHaveBeenCalled();
 });
});