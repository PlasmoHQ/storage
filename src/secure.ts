/**
 * Resources:
 *
 * https://www.youtube.com/watch?v=lbt2_M1hZeg
 *
 */

import { BaseStorage } from "./index"

const { crypto } = globalThis

const u8ToBase64 = (a: ArrayBufferLike) =>
  globalThis.btoa(String.fromCharCode.apply(null, a))

const base64ToU8 = (base64: string) =>
  Uint8Array.from(globalThis.atob(base64), (c) => c.charCodeAt(0))

const DEFAULT_ITERATIONS = 470_000
const DEFAULT_SALT_SIZE = 16
const DEFAULT_IV_SIZE = 32

/**
 * ALPHA API: This API is still in development and may change at any time.
 */
export class SecureStorage extends BaseStorage {
  #encoder = new TextEncoder()
  #decoder = new TextDecoder()

  #keyFx = "PBKDF2"
  #hashAlgo = "SHA-256"
  #cipherMode = "AES-GCM"
  #cipherSize = 256

  #iterations: number
  #saltSize: number
  #ivSize: number

  get #prefixSize() {
    return this.#saltSize + this.#ivSize
  }

  #passwordKey: CryptoKey
  private get passwordKey() {
    if (!this.#passwordKey) {
      throw new Error("Password not set, please first call setPassword.")
    }
    return this.#passwordKey
  }

  setPassword = async (
    password: string,
    {
      iterations = DEFAULT_ITERATIONS,
      saltSize = DEFAULT_SALT_SIZE,
      ivSize = DEFAULT_IV_SIZE
    } = {}
  ) => {
    this.#iterations = iterations
    this.#saltSize = saltSize
    this.#ivSize = ivSize

    const passwordBuffer = this.#encoder.encode(password)
    this.#passwordKey = await crypto.subtle.importKey(
      "raw",
      passwordBuffer,
      { name: this.#keyFx },
      false, // Not exportable
      ["deriveKey"]
    )
  }

  /**
   *
   * @param boxBase64 A box contains salt, iv and encrypted data
   * @returns decrypted data
   */
  decrypt = async (boxBase64: string) => {
    const passKey = this.passwordKey
    const boxBuffer = base64ToU8(boxBase64)

    const salt = boxBuffer.slice(0, this.#saltSize)
    const iv = boxBuffer.slice(this.#saltSize, this.#prefixSize)
    const encryptedDataBuffer = boxBuffer.slice(this.#prefixSize)
    const aesKey = await this.#deriveKey(salt, passKey, ["decrypt"])

    const decryptedDataBuffer = await crypto.subtle.decrypt(
      {
        name: this.#cipherMode,
        iv
      },
      aesKey,
      encryptedDataBuffer
    )
    return this.#decoder.decode(decryptedDataBuffer)
  }

  encrypt = async (rawData: string) => {
    const passKey = this.passwordKey
    const salt = crypto.getRandomValues(new Uint8Array(this.#saltSize))
    const iv = crypto.getRandomValues(new Uint8Array(this.#ivSize))
    const aesKey = await this.#deriveKey(salt, passKey, ["encrypt"])

    const encryptedDataBuffer = new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: this.#cipherMode,
          iv
        },
        aesKey,
        this.#encoder.encode(rawData)
      )
    )

    const boxBuffer = new Uint8Array(
      this.#prefixSize + encryptedDataBuffer.byteLength
    )

    boxBuffer.set(salt, 0)
    boxBuffer.set(iv, this.#saltSize)
    boxBuffer.set(encryptedDataBuffer, this.#prefixSize + iv.byteLength)

    const boxBase64 = u8ToBase64(boxBuffer)
    return boxBase64
  }

  get = async <T = string>(key: string) => {
    const boxBase64 = await this.rawGet(key)
    return this.parseValue(boxBase64) as T
  }

  set = async (key: string, rawValue: any) => {
    const value = JSON.stringify(rawValue)
    const boxBase64 = await this.encrypt(value)
    return await this.rawSet(key, boxBase64)
  }

  protected parseValue = async (boxBase64: string) => {
    try {
      if (boxBase64 !== undefined) {
        const rawValue = await this.decrypt(boxBase64)
        return JSON.parse(rawValue)
      }
    } catch (e) {
      // ignore error. TODO: debug log them maybe
      console.error(e)
    }
    return undefined
  }

  #deriveKey = (
    salt: Uint8Array,
    passwordKey: CryptoKey,
    keyUsage: KeyUsage[]
  ) =>
    crypto.subtle.deriveKey(
      {
        name: this.#keyFx,
        hash: this.#hashAlgo,
        salt,
        iterations: this.#iterations
      },
      passwordKey,
      {
        name: this.#cipherMode,
        length: this.#cipherSize
      },
      false,
      keyUsage
    )
}
