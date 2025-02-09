import { beforeEach, describe, expect, jest, test } from "@jest/globals"

import { createStorageMock } from "~index.test"

import { SecureStorage } from "./secure"

const createEncoderMock = () => {
  const mockFns = {
    encode: jest.fn(),
    decode: jest.fn()
  }

  // @ts-ignore
  globalThis.TextEncoder = jest.fn().mockImplementation(() => ({
    encode: mockFns.encode
  }))

  // @ts-ignore
  globalThis.TextDecoder = jest.fn().mockImplementation(() => ({
    decode: mockFns.decode
  }))

  mockFns.encode.mockImplementation((data: string) => {
    return new Uint8Array(data.split("").map((c) => c.charCodeAt(0)))
  })

  mockFns.decode.mockImplementation((data: Uint8Array) => {
    return data.reduce((acc, c) => acc + String.fromCharCode(c), "")
  })

  return mockFns
}

/**
 * This test case only covers interface of the function
 * and does not test the actual encryption/decryption.
 */
describe("SecureStorage - Basic CRUD", () => {
  let storageMock: ReturnType<typeof createStorageMock> | undefined
  beforeEach(() => {
    storageMock?.mockStorage.clear()
    jest.clearAllMocks()
    createEncoderMock()
  })

  test("should properly set and get data", async () => {
    const storageMock = createStorageMock()

    const secureStorage = new SecureStorage({ area: "sync" })
    await secureStorage.setPassword("testPassword")

    await secureStorage.set("testKey", "mockData")

    expect(storageMock.setTriggers).toHaveBeenCalledTimes(1)

    const result = await secureStorage.get("testKey")

    expect(storageMock.getTriggers).toHaveBeenCalledTimes(1)

    // Assert that the decrypted data is returned
    expect(result).toEqual("mockData")
  })

  test("should properly setMany and getMany data", async () => {
    const storageMock = createStorageMock()

    const secureStorage = new SecureStorage({ area: "sync" })
    await secureStorage.setPassword("testPassword")

    await secureStorage.setMany({
      testKey1: "mockData1",
      testKey2: "mockData2"
    })

    expect(storageMock.setTriggers).toHaveBeenCalledTimes(1)

    const result = await secureStorage.getMany(["testKey1", "testKey2"])

    expect(storageMock.getTriggers).toHaveBeenCalledTimes(1)

    // Assert that the decrypted data is returned
    expect(result).toEqual({
      testKey1: "mockData1",
      testKey2: "mockData2"
    })
  });

  test("should properly remove data", async () => {
    const storageMock = createStorageMock()

    // Initialize SecureStorage instance and set the password
    const secureStorage = new SecureStorage({ area: "sync" })
    await secureStorage.setPassword("testPassword")

    // Test the 'remove' method
    await secureStorage.remove("testKey")

    // Assert that the underlying storage layer is called with the correct arguments
    expect(storageMock.removeTriggers).toHaveBeenCalledTimes(1)

    // Empty implies that correct key is used behind the scenes
    // as the storage mock checks for the key before removing it
    expect(storageMock.mockStorage.data).toEqual({})
  })

  test("should properly removeMany data", async () => {
    const storageMock = createStorageMock()

    // Initialize SecureStorage instance and set the password
    const secureStorage = new SecureStorage({ area: "sync" })
    await secureStorage.setPassword("testPassword")

    await secureStorage.setMany({
      testKey1: "mockData1",
      testKey2: "mockData2"
    })

    expect(storageMock.setTriggers).toHaveBeenCalledTimes(1)

    // Test the 'remove' method
    await secureStorage.removeMany(["testKey1", "testKey2"])

    // Assert that the underlying storage layer is called with the correct arguments
    expect(storageMock.removeTriggers).toHaveBeenCalledTimes(1)

    // Empty implies that correct key is used behind the scenes
    // as the storage mock checks for the key before removing it
    expect(storageMock.mockStorage.data).toEqual({})
  })
})
