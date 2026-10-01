/**
 * PressPoint Device Cryptography Service
 * Hardware-backed (TPM/CNG) or WebCrypto asymmetric key management for Windows Print Agent.
 * 
 * SECURITY MANDATE:
 * 1. The private key MUST NEVER leave the host machine.
 * 2. It is NEVER transmitted to Supabase, URLs, logs, or localStorage in plaintext.
 * 3. Challenge-response signatures prove possession of the registered private key.
 */

const isNode = typeof window === 'undefined';

function getSubtleCrypto() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    return globalThis.crypto.subtle;
  }
  return null;
}

/**
 * Detects TPM / Hardware security capability on host environment
 */
export async function detectDeviceSecurityCapabilities() {
  if (isNode) {
    return {
      tpmAvailable: false, // Default unless confirmed via PowerShell / TPM provider
      provider: 'software_cng',
      platform: process.platform,
      secureEnclave: false,
    };
  }

  // Browser / Web environment detection
  return {
    tpmAvailable: false,
    provider: 'web_crypto_keystore',
    platform: navigator.platform || 'web',
    secureEnclave: false,
  };
}

/**
 * Generates an asymmetric cryptographic key pair for device identity.
 * Default: ECDSA P-256 (NIST P-256 curve) with SHA-256.
 */
export async function generateDeviceKeyPair() {
  const subtleCrypto = getSubtleCrypto();
  if (!subtleCrypto) {
    throw new Error('Web Cryptography API is not available in this environment.');
  }

  const keyPair = await subtleCrypto.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true, // extractable for local private key storage in secure enclave
    ['sign', 'verify']
  );

  // Export public key as SPKI Base64 string
  const spkiBuffer = await subtleCrypto.exportKey('spki', keyPair.publicKey);
  const spkiBase64 = arrayBufferToBase64(spkiBuffer);

  return {
    keyPair,
    publicKeySpki: spkiBase64,
    algorithm: 'ECDSA_P256',
  };
}

/**
 * Signs a cryptographic challenge nonce using the device's private key.
 * @param {CryptoKey} privateKey 
 * @param {string} nonceHex 
 * @returns {Promise<string>} Base64 signature
 */
export async function signChallengeNonce(privateKey, nonceHex) {
  const subtleCrypto = getSubtleCrypto();
  if (!subtleCrypto) {
    throw new Error('Web Cryptography API is not available.');
  }

  const nonceBytes = new TextEncoder().encode(nonceHex);
  const signatureBuffer = await subtleCrypto.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' },
    },
    privateKey,
    nonceBytes
  );

  return arrayBufferToBase64(signatureBuffer);
}

/**
 * Verifies a challenge signature using the device's registered public key.
 * Used for server-side verification in Node/edge runtimes.
 * @param {string} spkiBase64 
 * @param {string} nonceHex 
 * @param {string} signatureBase64 
 * @returns {Promise<boolean>}
 */
export async function verifyChallengeSignature(spkiBase64, nonceHex, signatureBase64) {
  const subtleCrypto = getSubtleCrypto();
  if (!subtleCrypto) {
    throw new Error('Web Cryptography API is not available.');
  }

  try {
    const spkiBuffer = base64ToArrayBuffer(spkiBase64);
    const publicKey = await subtleCrypto.importKey(
      'spki',
      spkiBuffer,
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      false,
      ['verify']
    );

    const nonceBytes = new TextEncoder().encode(nonceHex);
    const sigBytes = base64ToArrayBuffer(signatureBase64);

    return await subtleCrypto.verify(
      {
        name: 'ECDSA',
        hash: { name: 'SHA-256' },
      },
      publicKey,
      sigBytes,
      nonceBytes
    );
  } catch (err) {
    console.error('[DeviceCrypto] Verification failed:', err.message);
    return false;
  }
}

/**
 * Utility: ArrayBuffer to Base64
 */
export function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return isNode ? Buffer.from(buffer).toString('base64') : btoa(binary);
}

/**
 * Utility: Base64 to ArrayBuffer
 */
export function base64ToArrayBuffer(base64) {
  if (isNode) {
    const buf = Buffer.from(base64, 'base64');
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
