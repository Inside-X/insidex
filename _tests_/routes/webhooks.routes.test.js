import { loadRoute } from './_router-helper.js';
import { jest } from '@jest/globals';

describe('webhooks.routes',()=>{
 test('stripe/paypal major branches', async()=>{
  const constructEvent=jest.fn(); const verifyWebhookSignature=jest.fn(); const parseStripe=jest.fn((x)=>x); const parsePaypal=jest.fn((x)=>x);
  const sendApiError=jest.fn((_req,res,status)=>res.status(status).json({})); const logger={info:jest.fn(),warn:jest.fn(),error:jest.fn()};
  const orderRepository={findById:jest.fn(),markPaidFromWebhook:jest.fn(),processPaymentWebhookEvent:jest.fn()}; const claim=jest.fn();
  const routes=await loadRoute('../../src/routes/webhooks.routes.js',{
   'zod':()=>({ZodError: class ZodError extends Error {}}),
   '../../src/lib/stripe.js':()=>({default:{webhooks:{constructEvent}}}),
   '../../src/lib/paypal.js':()=>({default:{webhooks:{verifyWebhookSignature}}}),
   '../../src/validation/schemas/index.js':()=>({paymentsSchemas:{stripeWebhook:{parse:parseStripe},paypalWebhook:{parse:parsePaypal}}}),
   '../../src/utils/api-error.js':()=>({sendApiError}),
   '../../src/repositories/order.repository.js':()=>({orderRepository}),
   '../../src/utils/logger.js':()=>({logger}),
   '../../src/lib/webhook-idempotency-store.js':()=>({createWebhookIdempotencyStore:()=>({claim})}),
   '../../src/utils/minor-units.js':()=>({toMinorUnits:(v)=>Number(String(v).replace('.',''))}),
  });
  process.env.PAYMENT_WEBHOOK_SECRET='sec';
  const stripe=routes.find(r=>r.path==='/stripe').handlers.at(-1); const paypal=routes.find(r=>r.path==='/paypal').handlers.at(-1); const next=jest.fn();
  let req={get:(h)=>h==='stripe-signature'?'sig':null,body:Buffer.from('{}'),headers:{},app:{locals:{}}},res={status:jest.fn(()=>res),json:jest.fn()};
  constructEvent.mockReturnValueOnce({id:'e1',type:'other',data:{object:{}}}); await stripe(req,res,next); expect(res.status).toHaveBeenCalledWith(200);
  constructEvent.mockReturnValueOnce({id:'e2',type:'payment_intent.succeeded',data:{object:{id:'pi',status:'succeeded',metadata:{orderId:'o1',userId:'u1',idempotencyKey:'k'}}}}); claim.mockResolvedValueOnce({accepted:true}); orderRepository.findById.mockResolvedValueOnce({id:'o1',status:'pending',totalAmount:'10.00',currency:'EUR'}); orderRepository.markPaidFromWebhook.mockResolvedValueOnce({ok:true});
  req={...req,app:{locals:{}}}; res={status:jest.fn(()=>res),json:jest.fn()}; await stripe(req,res,next); expect(res.status).toHaveBeenCalledWith(200);
  req={get:(h)=>h==='content-length'?'10':null,body:Buffer.from(JSON.stringify({eventId:'e1',orderId:'o1',metadata:{orderId:'o1'},payload:{capture:{status:'COMPLETED',amount:'1000',currency:'EUR'}}})),headers:{},app:{locals:{}}};
  claim.mockResolvedValueOnce({accepted:true}); verifyWebhookSignature.mockResolvedValueOnce({verified:true,verificationStatus:'SUCCESS'}); orderRepository.findById.mockResolvedValueOnce({id:'o1',status:'pending',totalAmount:'10.00',currency:'EUR'}); orderRepository.processPaymentWebhookEvent.mockResolvedValueOnce({ok:true});
  res={status:jest.fn(()=>res),json:jest.fn()}; await paypal(req,res,next); expect(res.status).toHaveBeenCalledWith(200);
 });
});