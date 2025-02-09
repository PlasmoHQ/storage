import { jest } from "@jest/globals"

/**
 * Mimic the webcrypto API without implementing the actual encryption
 * algorithms. Only the mock implementations used by the SecureStorage
 */
export const cryptoMock = {
  subtle: {
    importKey: jest.fn(),
    deriveKey: jest.fn(),
    decrypt: jest.fn(),
    encrypt: jest.fn(),
    digest: jest.fn()
  },
  getRandomValues: jest.fn()
}

cryptoMock.subtle.importKey.mockImplementation(
  (format, keyData, algorithm, extractable, keyUsages) => {
    return Promise.resolve({
      format,
      keyData,
      algorithm,
      extractable,
      keyUsages
    })
  }
)

cryptoMock.subtle.deriveKey.mockImplementation(
  (algorithm, baseKey, derivedKeyAlgorithm, extractable, keyUsages) => {
    return Promise.resolve({
      algorithm,
      baseKey,
      derivedKeyAlgorithm,
      extractable,
      keyUsages
    })
  }
)

// @ts-ignore
cryptoMock.subtle.decrypt.mockImplementation((_, __, data: ArrayBufferLike) => {
  return Promise.resolve(new Uint8Array(data))
})

// @ts-ignore
cryptoMock.subtle.encrypt.mockImplementation((_, __, data: ArrayBufferLike) => {
  return Promise.resolve(new Uint8Array(data))
})

// @ts-ignore
cryptoMock.subtle.digest.mockImplementation((_, __) => {
  return Promise.resolve(new Uint8Array([0x01, 0x02, 0x03, 0x04]))
})

// @ts-ignore
cryptoMock.getRandomValues.mockImplementation((array: Array<any>) => {
  for (let i = 0; i < array.length; i++) {
    array[i] = Math.floor(Math.random() * 256)
  }
  return array
})

// The globalThis does not define crypto by default
Object.defineProperty(globalThis, "crypto", {
  value: cryptoMock,
  writable: true,
  enumerable: true,
  configurable: true
})
