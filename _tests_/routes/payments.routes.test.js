import { loadRoute } from './_router-helper.js';
import { jest } from '@jest/globals';
const pass=(_r,_s,n)=>n?.();

describe('payments.routes',()=>{
 test('create-intent branches', async()=>{
  const prisma={product:{findMany:jest.fn()}}; const orderRepository={createPendingPaymentOrder:jest.fn()};
  const sendApiError=jest.fn((_req,res,status)=>res.status(status).json({}));
  const routes=await loadRoute('../../src/routes/payments.routes.js',{
      '../../src/validation/schemas/index.js': () => ({ authSchemas:{register:{},login:{},forgot:{},reset:{},refresh:{},logout:{}}, ordersSchemas:{create:{},paymentWebhook:{},byIdParams:{}}, paymentsSchemas:{createIntent:{}}, cartSchemas:{getCartQuery:{},add:{},updateItemParams:{},updateItemBody:{},removeItemParams:{},removeItemBody:{}}, productsSchemas:{listQuery:{},byIdParams:{},create:{}}, leadsSchemas:{create:{},listQuery:{}}, analyticsSchemas:{track:{},listQuery:{}} }),
   '../../src/validation/strict-validate.middleware.js':()=>({strictValidate:jest.fn(()=>pass)}),
   '../../src/middlewares/checkoutIdentity.js':()=>({default:pass}),
   '../../src/middlewares/authenticate.js':()=>({default:(req,_res,n)=>{req.auth={sub:'u1',isGuest:false};n();}}),
   '../../src/middlewares/checkoutCustomerAccess.js':()=>({default:pass}),
   '../../src/lib/prisma.js':()=>({default:prisma}),
   '../../src/repositories/order.repository.js':()=>({orderRepository}),
   '../../src/utils/api-error.js':()=>({sendApiError}),
   '../../src/utils/minor-units.js': await import('../../src/utils/minor-units.js'),
  });
  const h=routes[0].handlers.at(-1); let next=jest.fn();
  let req={body:{currency:'JPY',items:[],idempotencyKey:'k',email:'e'},auth:{sub:'u1',isGuest:false}},res={locals:{},status:jest.fn(()=>res),json:jest.fn()}; await h(req,res,next); expect(sendApiError).toHaveBeenCalled();
  prisma.product.findMany.mockResolvedValueOnce([]); req={body:{currency:'EUR',items:[{id:'p1',quantity:1}],idempotencyKey:'k',email:'e'},auth:{sub:'u1',isGuest:false}}; res={locals:{},status:jest.fn(()=>res),json:jest.fn()}; await h(req,res,next); expect(res.status).toHaveBeenCalledWith(404);
  prisma.product.findMany.mockResolvedValueOnce([{id:'p1',price:'10.00'}]); orderRepository.createPendingPaymentOrder.mockResolvedValueOnce({order:{id:'o1',stripePaymentIntentId:'pi1'},replayed:false});
  req={body:{currency:'EUR',items:[{id:'p1',quantity:1}],idempotencyKey:'k',email:'e'},auth:{sub:'u1',isGuest:false}}; res={locals:{},status:jest.fn(()=>res),json:jest.fn()}; await h(req,res,next); expect(res.status).toHaveBeenCalledWith(201);
 });
});