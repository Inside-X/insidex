const DEFAULT_PAYPAL_API_BASE_URL = 'https://api-m.paypal.com';

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    const error = new Error(`Missing required PayPal configuration: ${name}`);
    error.statusCode = 500;
    throw error;
  }

  return value;
}

async function getAccessToken() {
  const clientId = getRequiredEnv('PAYPAL_CLIENT_ID');
  const clientSecret = getRequiredEnv('PAYPAL_SECRET');
  const baseUrl = process.env.PAYPAL_API_BASE_URL || DEFAULT_PAYPAL_API_BASE_URL;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const error = new Error('Unable to retrieve PayPal access token');
    error.statusCode = 502;
    throw error;
  }

  const payload = await response.json();
  if (!payload.access_token) {
    const error = new Error('PayPal access token response is invalid');
    error.statusCode = 502;
    throw error;
  }

  return payload.access_token;
}

function parseVerificationHeaders(getHeader) {
  return {
    transmission_id: getHeader('paypal-transmission-id'),
    transmission_time: getHeader('paypal-transmission-time'),
    cert_url: getHeader('paypal-cert-url'),
    auth_algo: getHeader('paypal-auth-algo'),
    transmission_sig: getHeader('paypal-transmission-sig'),
  };
}

function assertVerificationHeaders(headers) {
  const required = [
    'transmission_id',
    'transmission_time',
    'cert_url',
    'auth_algo',
    'transmission_sig',
  ];

  return required.every((key) => Boolean(headers[key]));
}

async function verifyWebhookSignature({ getHeader, webhookEvent }) {
  const webhookId = getRequiredEnv('PAYPAL_WEBHOOK_ID');
  const baseUrl = process.env.PAYPAL_API_BASE_URL || DEFAULT_PAYPAL_API_BASE_URL;
  const verificationHeaders = parseVerificationHeaders(getHeader);

  if (!assertVerificationHeaders(verificationHeaders)) {
    return {
      verified: false,
      verificationStatus: 'MISSING_HEADERS',
      reason: 'missing_verification_headers',
    };
  }

  const accessToken = await getAccessToken();

  const response = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...verificationHeaders,
      webhook_id: webhookId,
      webhook_event: webhookEvent,
    }),
  });

  if (!response.ok) {
    return {
      verified: false,
      verificationStatus: 'VERIFICATION_ENDPOINT_ERROR',
      reason: 'verification_endpoint_error',
    };
  }

  const payload = await response.json();
  const verificationStatus = payload.verification_status || 'UNKNOWN';

  return {
    verified: verificationStatus === 'SUCCESS',
    verificationStatus,
    reason: verificationStatus
  };
}

export const paypal = {
  webhooks: {
    verifyWebhookSignature,
  },
};

export default paypal;