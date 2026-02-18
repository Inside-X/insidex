import fs from 'fs';
import path from 'path';

describe('logout route uniqueness guard', () => {
  test('defines exactly one POST /logout across all route files', () => {
    const routesDir = path.resolve(process.cwd(), 'src/routes');
    const files = fs.readdirSync(routesDir).filter((name) => name.endsWith('.js'));

    const matches = files.flatMap((file) => {
      const source = fs.readFileSync(path.join(routesDir, file), 'utf8');
      const count = (source.match(/router\.post\(\s*['\"]\/logout['\"]/g) ?? []).length;
      return Array.from({ length: count }, () => file);
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]).toBe('auth.routes.js');
  });

  test('mounts auth router exactly once', () => {
    const appPath = path.resolve(process.cwd(), 'src/app.js');
    const source = fs.readFileSync(appPath, 'utf8');
    const mounts = source.match(/app\.use\(\s*['\"]\/api\/auth['\"],\s*authRouter\s*\);/g) ?? [];
    expect(mounts).toHaveLength(1);
  });
});