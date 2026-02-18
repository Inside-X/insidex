import { jest } from '@jest/globals';
import { createSimpleRedisClient } from '../../src/lib/simple-redis-client.js';

function buildFakeClient({ connectImpl = async () => {}, quitImpl = async () => {} } = {}) {
  const handlers = new Map();
  return {
    connect: jest.fn(connectImpl),
    quit: jest.fn(quitImpl),
    on: jest.fn((event, callback) => {
      handlers.set(event, callback);
    }),
    emit(event, payload) {
      handlers.get(event)?.(payload);
    },
  };
}

describe('simple-redis-client resilience', () => {
  test('connects successfully', async () => {
    const fakeClient = buildFakeClient();
    const wrapper = createSimpleRedisClient({ createClient: () => fakeClient });

    const client = await wrapper.connect();

    expect(client).toBe(fakeClient);
    expect(wrapper.isConnected()).toBe(true);
  });

  test('fails when required and connection cannot be established', async () => {
    const fakeClient = buildFakeClient({ connectImpl: async () => { throw new Error('boom'); } });
    const wrapper = createSimpleRedisClient({
      createClient: () => fakeClient,
      maxRetries: 1,
      retryBaseDelayMs: 1,
      required: true,
    });

    await expect(wrapper.connect()).rejects.toThrow('boom');
  });

  test('times out long connection attempts', async () => {
    const fakeClient = buildFakeClient({ connectImpl: () => new Promise(() => {}) });
    const wrapper = createSimpleRedisClient({
      createClient: () => fakeClient,
      connectTimeoutMs: 5,
      maxRetries: 0,
      required: true,
    });

    await expect(wrapper.connect()).rejects.toThrow('Redis connection timeout');
  });

  test('emits reconnecting and error events', async () => {
    const onEvent = jest.fn();
    const fakeClient = buildFakeClient();
    createSimpleRedisClient({ createClient: () => fakeClient, onEvent });

    fakeClient.emit('reconnecting', { attempt: 2 });
    fakeClient.emit('error', new Error('network'));

    expect(onEvent).toHaveBeenCalledWith('reconnecting', { attempt: 2 });
    expect(onEvent).toHaveBeenCalledWith('error', expect.objectContaining({ error: expect.any(Error) }));
  });

  test('quits gracefully', async () => {
    const fakeClient = buildFakeClient();
    const wrapper = createSimpleRedisClient({ createClient: () => fakeClient });
    await wrapper.connect();

    await wrapper.quit();

    expect(fakeClient.quit).toHaveBeenCalledTimes(1);
    expect(wrapper.isConnected()).toBe(false);
  });
});

test('throws when createClient is missing', () => {
  expect(() => createSimpleRedisClient()).toThrow('requires a createClient function');
});

test('returns null when optional redis cannot connect', async () => {
  const fakeClient = buildFakeClient({ connectImpl: async () => { throw new Error('down'); } });
  const wrapper = createSimpleRedisClient({
    createClient: () => fakeClient,
    maxRetries: 0,
    required: false,
  });

  await expect(wrapper.connect()).resolves.toBeNull();
});

test('quit surfaces errors', async () => {
  const fakeClient = buildFakeClient({ quitImpl: async () => { throw new Error('quit failed'); } });
  const wrapper = createSimpleRedisClient({ createClient: () => fakeClient });

  await expect(wrapper.quit()).rejects.toThrow('quit failed');
});