import { jest } from '@jest/globals';
const sendApiError = jest.fn();
jest.unstable_mockModule('../../src/utils/api-error.js', () => ({ sendApiError }));
const { corsMiddleware } = await import('../../src/middlewares/cors.js');

describe('corsMiddleware', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; jest.clearAllMocks(); });
  const mk = (origin, method='GET') => {
    const headers={};
    return { req: { headers: { origin }, method }, res: { setHeader: jest.fn(), status: jest.fn(()=>({ end: jest.fn() })) }, next: jest.fn() };
  };
  test('production misconfig', () => {
    process.env.NODE_ENV='production'; process.env.CORS_ORIGIN='*';
    const {req,res,next}=mk('https://a'); corsMiddleware(req,res,next);
    expect(sendApiError).toHaveBeenCalledWith(req,res,500,'CORS_MISCONFIGURED','CORS origin must be explicit in production');
  });
  test('forbidden origin',()=>{
    process.env.CORS_ORIGIN='https://ok'; const {req,res,next}=mk('https://bad'); corsMiddleware(req,res,next);
    expect(sendApiError).toHaveBeenCalledWith(req,res,403,'CORS_FORBIDDEN','Origin not allowed'); expect(next).not.toHaveBeenCalled();
  });
  test('allowed sets headers and next',()=>{
    process.env.CORS_ORIGIN='https://ok'; const {req,res,next}=mk('https://ok'); corsMiddleware(req,res,next);
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin','https://ok'); expect(next).toHaveBeenCalled();
  });
  test('no origin allowed path + options',()=>{
    process.env.CORS_ORIGIN='https://ok'; const end=jest.fn(); const res={setHeader:jest.fn(),status:jest.fn(()=>({end}))}; const req={headers:{},method:'OPTIONS'};
    corsMiddleware(req,res,jest.fn()); expect(res.status).toHaveBeenCalledWith(204); expect(end).toHaveBeenCalled();
  });
});