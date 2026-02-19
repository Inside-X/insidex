import { jest } from '@jest/globals';
const sendApiError = jest.fn();
const logger = { error: jest.fn() };
const redisStore = { increment: jest.fn(), reset: jest.fn() };
const createRateLimitRedisStore = jest.fn(() => redisStore);
jest.unstable_mockModule('../../src/utils/api-error.js', () => ({ sendApiError }));
jest.unstable_mockModule('../../src/utils/logger.js', () => ({ logger }));
jest.unstable_mockModule('../../src/lib/rate-limit-redis-store.js', () => ({ createRateLimitRedisStore }));
const mod = await import('../../src/middlewares/rateLimit.js');
const { createRateLimiter, resolveClientIp, endpointToken, isRateLimitBackendHealthy, setRateLimitRedisClient, getRateLimitRedisClient } = mod;

describe('rateLimit middleware', () => {
  test('client setters/getters and health checks', async () => {
    setRateLimitRedisClient(null); expect(getRateLimitRedisClient()).toBeNull(); await expect(isRateLimitBackendHealthy()).resolves.toBe(false);
    setRateLimitRedisClient({ ping: jest.fn().mockResolvedValue('PONG') }); await expect(isRateLimitBackendHealthy()).resolves.toBe(true);
    setRateLimitRedisClient({ ping: jest.fn().mockRejectedValue(new Error('down')) }); await expect(isRateLimitBackendHealthy()).resolves.toBe(false);
  });
  test('resolveClientIp branches', () => {
    expect(() => resolveClientIp({ app:{get:()=>false}, headers:{'x-forwarded-for':'1.1.1.1'}, ip:'1.1.1.1' })).toThrow('x-forwarded-for_not_trusted');
    expect(() => resolveClientIp({ app:{get:()=>true}, headers:{'x-forwarded-for':'bad'}, ip:'1.1.1.1' })).toThrow('x-forwarded-for_malformed');
    expect(resolveClientIp({ app:{get:()=>true}, headers:{'x-forwarded-for':'8.8.8.8'}, ip:'::ffff:8.8.8.8' })).toBe('8.8.8.8');
    expect(() => resolveClientIp({ app:{get:()=>false}, headers:{}, ip:'nope', socket:{} })).toThrow('ip_unresolved');
  });
  test('endpointToken', ()=>{ expect(endpointToken({path:'/a/b?x=1'})).toBe('a:b'); expect(endpointToken({originalUrl:'/'})).toBe('root'); });
  test('createRateLimiter validates store', ()=>{ expect(()=>createRateLimiter({store:null})).toThrow('requires a store'); });
  test('rate limiter keyBuilder error', async ()=>{
    const mw=createRateLimiter({windowMs:1,max:1,code:'X',message:'Y',keyBuilder:()=>{throw new Error('bad');},store:redisStore});
    const req={}; const res={status:jest.fn(()=>res),json:jest.fn()}; await mw(req, res, jest.fn()); expect(res.status).toHaveBeenCalledWith(400);
  });
  test('rate limiter allows and blocks and backend fail', async ()=>{
    const req={}; const res={setHeader:jest.fn(),status:jest.fn(()=>res),json:jest.fn()}; const next=jest.fn();
    redisStore.increment.mockResolvedValueOnce({totalHits:1, resetTime:new Date(Date.now()+1000)}).mockResolvedValueOnce({totalHits:3, resetTime:new Date(Date.now()+1000)}).mockRejectedValueOnce(new Error('down'));
    const mw=createRateLimiter({windowMs:()=>1000,max:()=>2,code:'LIMIT',message:'too many',keyBuilder:()=> 'k',store:redisStore});
    await mw(req,res,next); expect(next).toHaveBeenCalled();
    await mw(req,res,next); expect(res.status).toHaveBeenCalledWith(429);
    await mw(req,res,next); expect(res.status).toHaveBeenCalledWith(503);
    mw.reset(); expect(redisStore.reset).toHaveBeenCalled();
  });
});