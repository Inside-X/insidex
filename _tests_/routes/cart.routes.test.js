import { loadRoute, runHandlers } from './_router-helper.js';
import { jest } from '@jest/globals';
const pass = (_r,_s,n)=>n?.();
describe('cart.routes',()=>{test('handlers', async()=>{
  const routes=await loadRoute('../../src/routes/cart.routes.js',{
      '../../src/validation/schemas/index.js': () => ({ authSchemas:{register:{},login:{},forgot:{},reset:{},refresh:{},logout:{}}, ordersSchemas:{create:{},paymentWebhook:{},byIdParams:{}}, paymentsSchemas:{createIntent:{}}, cartSchemas:{getCartQuery:{},add:{},updateItemParams:{},updateItemBody:{},removeItemParams:{},removeItemBody:{}}, productsSchemas:{listQuery:{},byIdParams:{},create:{}}, leadsSchemas:{create:{},listQuery:{}}, analyticsSchemas:{track:{},listQuery:{}} }),
    '../../src/validation/validate.middleware.js':()=>({validate:jest.fn(()=>pass)}),
    '../../src/validation/strict-validate.middleware.js':()=>({strictValidate:jest.fn(()=>pass)}),
    '../../src/middlewares/authenticate.js':()=>({default:(req,_res,n)=>{req.auth={sub:'u1'};n();}}),
  });
  const get=routes.find(r=>r.method==='get'); const post=routes.find(r=>r.method==='post'); const patch=routes.find(r=>r.method==='patch'); const del=routes.find(r=>r.method==='delete');
  let res={status:jest.fn(()=>res),json:jest.fn(),end:jest.fn()}; await runHandlers(get.handlers,{auth:{sub:'u1'}},res); expect(res.json).toHaveBeenCalledWith({data:{owner:'u1'}});
  res={status:jest.fn(()=>res),json:jest.fn()}; await runHandlers(post.handlers,{body:{a:1}},res); expect(res.status).toHaveBeenCalledWith(201);
  res={status:jest.fn(()=>res),json:jest.fn()}; await runHandlers(patch.handlers,{params:{id:'i1'},body:{q:2}},res); expect(res.json).toHaveBeenCalledWith({data:{id:'i1',q:2}});
  res={status:jest.fn(()=>res),end:jest.fn()}; await runHandlers(del.handlers,{params:{id:'i1'},body:{}},res); expect(res.status).toHaveBeenCalledWith(204);
});});