import { jest } from '@jest/globals';
import { loadRoute, runHandlers } from './_router-helper.js';
const pass = (_r,_s,n)=>n?.();

describe('products.routes', () => {
  test('handlers', async () => {
    const authorizeRole = jest.fn(()=>pass);
    const routes = await loadRoute('../../src/routes/products.routes.js', {
      '../../src/validation/schemas/index.js': () => ({ authSchemas:{register:{},login:{},forgot:{},reset:{},refresh:{},logout:{}}, ordersSchemas:{create:{},paymentWebhook:{},byIdParams:{}}, paymentsSchemas:{createIntent:{}}, cartSchemas:{getCartQuery:{},add:{},updateItemParams:{},updateItemBody:{},removeItemParams:{},removeItemBody:{}}, productsSchemas:{listQuery:{},byIdParams:{},create:{}}, leadsSchemas:{create:{},listQuery:{}}, analyticsSchemas:{track:{},listQuery:{}} }),
      '../../src/validation/validate.middleware.js': () => ({ validate: jest.fn(()=>pass) }),
      '../../src/validation/strict-validate.middleware.js': () => ({ strictValidate: jest.fn(()=>pass) }),
      '../../src/middlewares/authenticate.js': () => ({ default: pass }),
      '../../src/middlewares/authorizeRole.js': () => ({ default: authorizeRole }),
    });
    const list = routes.find(r=>r.method==='get'&&r.path==='/'); const byId=routes.find(r=>r.path==='/:id'); const post=routes.find(r=>r.method==='post'&&r.path==='/');
    let res={status:jest.fn(()=>res),json:jest.fn()}; await runHandlers(list.handlers,{},{...res});
    expect(res.status).toHaveBeenCalledWith(200);
    res={status:jest.fn(()=>res),json:jest.fn()}; await runHandlers(byId.handlers,{params:{id:'p1'}},{...res});
    expect(res.json).toHaveBeenCalledWith({data:{id:'p1'}});
    res={status:jest.fn(()=>res),json:jest.fn()}; await runHandlers(post.handlers,{body:{name:'x'}},{...res});
    expect(res.status).toHaveBeenCalledWith(201); expect(authorizeRole).toHaveBeenCalledWith('admin');
  });
});