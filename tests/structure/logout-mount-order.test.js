import fs from 'fs';
import path from 'path';

describe('logout mount and override guard', () => {
  test('does not define logout route outside auth router', () => {
    const routesDir = path.resolve(process.cwd(), 'src/routes');
    const files = fs.readdirSync(routesDir).filter((name) => name.endsWith('.js'));

    const offenders = files
      .filter((file) => file !== 'auth.routes.js')
      .filter((file) => {
        const source = fs.readFileSync(path.join(routesDir, file), 'utf8');
        return /['\"]\/logout['\"]/.test(source);
      });

    expect(offenders).toEqual([]);
  });

  test('mounts auth router before other /api routers in app', () => {
    const appPath = path.resolve(process.cwd(), 'src/app.js');
    const source = fs.readFileSync(appPath, 'utf8');

    const authIdx = source.indexOf("app.use('/api/auth', authRouter);");
    const productsIdx = source.indexOf("app.use('/api/products', productsRouter);");

    expect(authIdx).toBeGreaterThan(-1);
    expect(productsIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeLessThan(productsIdx);
  });
});