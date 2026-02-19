import fs from 'fs';
import path from 'path';

function readSource(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

describe('POST /api/auth/logout strict uniqueness', () => {
  test('is defined once in auth router and never in any other source file', () => {
    const srcDir = path.resolve(process.cwd(), 'src');
    const routeDir = path.join(srcDir, 'routes');

    const routeFiles = fs.readdirSync(routeDir).filter((file) => file.endsWith('.js'));

    const logoutRouteDefinitions = routeFiles.flatMap((file) => {
      const fullPath = path.join(routeDir, file);
      const source = readSource(fullPath);

      const relativeLogoutCount = (source.match(/router\.post\(\s*['\"]\/logout['\"]/g) ?? []).length;
      const absoluteLogoutCount = (source.match(/router\.post\(\s*['\"]\/auth\/logout['\"]/g) ?? []).length;

      return [
        ...Array.from({ length: relativeLogoutCount }, () => `${file}::/logout`),
        ...Array.from({ length: absoluteLogoutCount }, () => `${file}::/auth/logout`),
      ];
    });

    expect(logoutRouteDefinitions).toEqual(['auth.routes.js::/logout']);

    const appSource = readSource(path.join(srcDir, 'app.js'));
    const authMounts = appSource.match(/app\.use\(\s*['\"]\/api\/auth['\"],\s*authRouter\s*\);/g) ?? [];
    expect(authMounts).toHaveLength(1);
  });
});