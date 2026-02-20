import { loadRoute, runHandlers } from './_router-helper.js';
import { jest } from '@jest/globals';
const pass=(_r,_s,n)=>n?.();
describe('admin-example.routes',()=>{test('handlers', async()=>{
 const requirePermission=jest.fn(()=>pass);
 const routes=await loadRoute('../../src/routes/admin-example.routes.js',{
  '../../src/middlewares/authenticate.js':()=>({authenticate:pass}),
  '../../src/middlewares/requirePermission.js':()=>({requirePermission}),
 });
 let res={status:jest.fn(()=>res),json:jest.fn()}; await runHandlers(routes.find(r=>r.path==='/admin/reports').handlers,{},res); expect(res.status).toHaveBeenCalledWith(200);
 res={status:jest.fn(()=>res),json:jest.fn()}; await runHandlers(routes.find(r=>r.path==='/admin/audit-log').handlers,{},res); expect(res.status).toHaveBeenCalledWith(200);
 expect(requirePermission).toHaveBeenCalledWith('reports:read'); expect(requirePermission).toHaveBeenCalledWith('audit-log:read');
});});