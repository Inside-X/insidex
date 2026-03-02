import { describe, expect, test, jest } from '@jest/globals';

import { requestContext } from '../../src/middlewares/requestContext.js';

describe('requestContext middleware', () => {
  test('uses pre-existing req.correlationId fast-path and mirrors it to request/response ids', () => {
    const req = {
      correlationId: 'cid-fixed',
      requestId: undefined,
      get: jest.fn(() => undefined),
    };
    const set = jest.fn();
    const res = { set };
    const next = jest.fn();

    requestContext(req, res, next);

    expect(req.correlationId).toBe('cid-fixed');
    expect(req.requestId).toBe('cid-fixed');
    expect(set).toHaveBeenCalledWith('x-correlation-id', 'cid-fixed');
    expect(set).toHaveBeenCalledWith('x-request-id', 'cid-fixed');
    expect(req.get).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});