import fs from 'fs';
import path from 'path';

describe('logout route uniqueness guard', () => {
  test('defines exactly one POST /logout in auth router', () => {
    const authRoutesPath = path.resolve(process.cwd(), 'src/routes/auth.routes.js');
    const source = fs.readFileSync(authRoutesPath, 'utf8');
    const matches = source.match(/router\.post\(\s*['\"]\/logout['\"]/g) ?? [];

    expect(matches).toHaveLength(1);
  });
});