import { loadRoute, runHandlers } from './_router-helper.js';
import { jest } from '@jest/globals';
const pass=(_r,_s,n)=>n?.();
describe('analytics.routes',()=>{test('handlers', async()=>{
 const authorizeRole=jest.fn(()=>pass);
 const routes=await loadRoute('../../src/routes/analytics.routes.js',{
      '../../src/validation/schemas/index.js': () => ({ authSchemas:{register:{},login:{},forgot:{},reset:{},refresh:{},logout:{}}, ordersSchemas:{create:{},paymentWebhook:{},byIdParams:{}}, paymentsSchemas:{createIntent:{}}, cartSchemas:{getCartQuery:{},add:{},updateItemParams:{},updateItemBody:{},removeItemParams:{},removeItemBody:{}}, productsSchemas:{listQuery:{},byIdParams:{},create:{}}, leadsSchemas:{create:{},listQuery:{}}, analyticsSchemas:{track:{},listQuery:{}} }),
  '../../src/validation/validate.middleware.js':()=>({validate:jest.fn(()=>pass)}),
  '../../src/validation/strict-validate.middleware.js':()=>({strictValidate:jest.fn(()=>pass)}),
  '../../src/middlewares/authenticate.js':()=>({default:pass}),
  '../../src/middlewares/authorizeRole.js':()=>({default:authorizeRole}),
 });
 let res={status:jest.fn(()=>res),json:jest.fn()}; await runHandlers(routes.find(r=>r.path==='/events'&&r.method==='post').handlers,{},res); expect(res.status).toHaveBeenCalledWith(201);
 res={status:jest.fn(()=>res),json:jest.fn()}; await runHandlers(routes.find(r=>r.path==='/events'&&r.method==='get').handlers,{},res); expect(res.status).toHaveBeenCalledWith(200); expect(authorizeRole).toHaveBeenCalledWith('admin');
});});