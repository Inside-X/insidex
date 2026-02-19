import { jest } from '@jest/globals';
const logger = { info: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.unstable_mockModule('../../src/utils/logger.js', () => ({ logger }));
const { requestLogger } = await import('../../src/middlewares/requestLogger.js');

describe('requestLogger', () => {
  const env={...process.env};
  afterEach(()=>{process.env={...env}; jest.clearAllMocks();});
  function setup(statusCode){
    const listeners={};
    const res={statusCode,on:jest.fn((ev,cb)=>{listeners[ev]=cb;})};
    const req={requestId:'r1',method:'GET',originalUrl:'/x'}; const next=jest.fn();
    requestLogger(req,res,next); listeners.finish(); return {next};
  }
  test('prod success logs info',()=>{process.env.NODE_ENV='production'; setup(200); expect(logger.info).toHaveBeenCalled();});
  test('server error logs error',()=>{process.env.NODE_ENV='test'; setup(500); expect(logger.error).toHaveBeenCalled();});
  test('non-prod non-500 logs debug',()=>{process.env.NODE_ENV='test'; setup(404); expect(logger.debug).toHaveBeenCalled();});
});