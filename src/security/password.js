import crypto from 'crypto';

const SCRYPT_KEYLEN = 64;

function toBuffer(value) {
  return Buffer.from(value, 'hex');
}

function scryptAsync(password, salt, keylen = SCRYPT_KEYLEN) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt);
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password, passwordHash) {
  if (!passwordHash || typeof passwordHash !== 'string') {
    return false;
  }

  const [salt, expectedHex] = passwordHash.split(':');
  if (!salt || !expectedHex) {
    return false;
  }

  const derived = await scryptAsync(password, salt);
  const expected = toBuffer(expectedHex);

  if (derived.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(derived, expected);
}

export default {
  hashPassword,
  verifyPassword,
};