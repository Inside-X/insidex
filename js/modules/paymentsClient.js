function resolveCorrelationId(response, payload) {
  const headerCorrelationId = response?.headers?.get?.('x-correlation-id') || response?.headers?.get?.('x-request-id');
  if (headerCorrelationId) return String(headerCorrelationId);

  const payloadRequestId = payload?.error?.requestId || payload?.requestId;
  return payloadRequestId ? String(payloadRequestId) : undefined;
}

function sanitizeItems(items) {
  if (!Array.isArray(items)) return [];

  return items.map((item) => ({
    id: item?.id,
    quantity: item?.quantity,
  }));
}

function toMappedError({ status, payload, correlationId }) {
  if (status === 400) {
    return {
      code: 'validation_error',
      status,
      ...(correlationId ? { correlationId } : {}),
    };
  }

  if (status === 409) {
    return {
      code: 'invalid_transition',
      status,
      ...(correlationId ? { correlationId } : {}),
    };
  }

  if (status === 503) {
    if (payload?.error?.code === 'payments_disabled') {
      return {
        code: 'payments_disabled',
        status,
        ...(correlationId ? { correlationId } : {}),
      };
    }
    
    const reasonCode = payload?.error?.reasonCode || payload?.reasonCode;
    return {
      code: 'dependency_unavailable',
      status,
      ...(reasonCode ? { reasonCode: String(reasonCode) } : {}),
      ...(correlationId ? { correlationId } : {}),
    };
  }

  return {
    code: 'unknown_error',
    status,
    ...(correlationId ? { correlationId } : {}),
  };
}

export async function createPaymentIntent({ items, idempotencyKey }) {
  const payload = {
    items: sanitizeItems(items),
    idempotencyKey,
  };

  const response = await fetch('/api/payments/create-intent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));

  if (response.ok) {
    return body;
  }

  const correlationId = resolveCorrelationId(response, body);
  throw toMappedError({
    status: response.status,
    payload: body,
    correlationId,
  });
}

export default {
  createPaymentIntent,
};