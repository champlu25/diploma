const crypto = require('crypto');

const SCRYPT_KEY_LENGTH = 64;
const PASSWORD_MIN_LENGTH = 8;

const toBase64Url = (input) =>
  Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const fromBase64Url = (value) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLength);
  return Buffer.from(padded, 'base64').toString('utf8');
};

const fromUtf8ToBase64Url = (value) => toBase64Url(Buffer.from(value, 'utf8'));

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString('hex');
  return `scrypt$${salt}$${hash}`;
};

const verifyPassword = (password, storedHash) => {
  if (!storedHash || typeof storedHash !== 'string') {
    return false;
  }

  const [algorithm, salt, savedHash] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !savedHash) {
    return false;
  }

  const calculatedHash = crypto
    .scryptSync(password, salt, SCRYPT_KEY_LENGTH)
    .toString('hex');

  const savedHashBuffer = Buffer.from(savedHash, 'hex');
  const calculatedHashBuffer = Buffer.from(calculatedHash, 'hex');

  if (savedHashBuffer.length !== calculatedHashBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(savedHashBuffer, calculatedHashBuffer);
};

const validatePassword = (password) => {
  if (typeof password !== 'string') {
    return 'Пароль должен быть строкой.';
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Пароль должен содержать минимум ${PASSWORD_MIN_LENGTH} символов.`;
  }

  return null;
};

const generateInviteToken = () => toBase64Url(crypto.randomBytes(32));

const hashInviteToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

const signJwt = ({ payload, secret, expiresInSeconds }) => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const encodedHeader = fromUtf8ToBase64Url(JSON.stringify(header));
  const encodedBody = fromUtf8ToBase64Url(JSON.stringify(body));
  const data = `${encodedHeader}.${encodedBody}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return `${data}.${signature}`;
};

const verifyJwt = ({ token, secret }) => {
  if (typeof token !== 'string') {
    return null;
  }

  const tokenParts = token.split('.');
  if (tokenParts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = tokenParts;
  const data = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  const signatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedSignatureBuffer.length) {
    return null;
  }

  const isValidSignature = crypto.timingSafeEqual(
    signatureBuffer,
    expectedSignatureBuffer,
  );

  if (!isValidSignature) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload));

    if (typeof payload?.exp !== 'number') {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
};

module.exports = {
  generateInviteToken,
  hashInviteToken,
  hashPassword,
  signJwt,
  validatePassword,
  verifyJwt,
  verifyPassword,
};
