const crypto = require('crypto');

const secretKey = process.env.CONTRASENA_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!secretKey) {
  throw new Error('Falta la clave de cifrado: define CONTRASENA_SECRET_KEY o SUPABASE_SERVICE_ROLE_KEY en el entorno');
}

const KEY = crypto.createHash('sha256').update(secretKey).digest();
const IV_LENGTH = 12; // AES-GCM nonce length

function encryptPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('La contraseña debe ser una cadena no vacía');
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${encrypted.toString('base64')}:${tag.toString('base64')}`;
}

function isAesEncryptedPassword(value) {
  if (!value || typeof value !== 'string') return false;
  const parts = value.split(':');
  if (parts.length !== 3) return false;

  try {
    const [ivB64, encryptedB64, tagB64] = parts;
    if (!ivB64 || !encryptedB64 || !tagB64) return false;
    Buffer.from(ivB64, 'base64');
    Buffer.from(encryptedB64, 'base64');
    Buffer.from(tagB64, 'base64');
    return true;
  } catch (err) {
    return false;
  }
}

function decryptPassword(encryptedString) {
  if (!encryptedString || typeof encryptedString !== 'string') {
    throw new Error('No hay contraseña cifrada para descifrar');
  }

  if (!isAesEncryptedPassword(encryptedString)) {
    throw new Error('Formato de contraseña cifrada inválido');
  }

  const [ivB64, encryptedB64, tagB64] = encryptedString.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

module.exports = {
  encryptPassword,
  decryptPassword,
  isAesEncryptedPassword,
};