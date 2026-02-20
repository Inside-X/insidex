import { jest } from '@jest/globals';

export async function loadRoute(modulePath, mocks = {}) {
  jest.resetModules();
  const routes = [];
  const router = {
    post: jest.fn((path, ...handlers) => routes.push({ method: 'post', path, handlers })),
    get: jest.fn((path, ...handlers) => routes.push({ method: 'get', path, handlers })),
    patch: jest.fn((path, ...handlers) => routes.push({ method: 'patch', path, handlers })),
    delete: jest.fn((path, ...handlers) => routes.push({ method: 'delete', path, handlers })),
  };
  await jest.unstable_mockModule('express', () => ({ default: { Router: () => router } }));
  for (const [path, factory] of Object.entries(mocks)) {
    await jest.unstable_mockModule(path, factory);
  }
  await import(modulePath);
  return routes;
}

export async function runHandlers(handlers, req = {}, res = {}, next = jest.fn()) {
  for (const h of handlers) {
    const out = h(req, res, next);
    if (out && typeof out.then === 'function') await out;
  }
  return { req, res, next };
}