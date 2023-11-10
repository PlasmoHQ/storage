/**
 * Copyright (c) 2023 Plasmo Corp. <foss@plasmo.com> (https://www.plasmo.com) and contributors
 * Licensed under the MIT license.
 * This module share storage between chrome storage and local storage.
 */
import { beforeEach, describe, expect, jest, test } from "@jest/globals"
import { act, renderHook, waitFor } from "@testing-library/react"

import type { StorageWatchEventListener } from "~index"

const { Storage } = await import("~index")
const { useStorage } = await import("~hook")

const mockStorage = {
  data: {},
  get(key?: string) {
    if (!key) {
      return { ...this.data }
    }
    return {
      [key]: this.data[key]
    }
  },
  set(key = "", value = "") {
    this.data[key] = value
  },
  remove(key: string) {
    delete this.data[key]
  },
  clear() {
    this.data = {}
  }
}

beforeEach(() => {
  mockStorage.clear()
  jest.fn().mockReset()
})

export const createStorageMock = (): {
  mockStorage: typeof mockStorage
  addListener: jest.Mock
  removeListener: jest.Mock
  getTriggers: jest.Mock
  setTriggers: jest.Mock
  removeTriggers: jest.Mock
} => {
  let onChangedCallback: StorageWatchEventListener

  const mockOutput = {
    mockStorage,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    getTriggers: jest.fn(),
    setTriggers: jest.fn(),
    removeTriggers: jest.fn()
  }

  const storage: typeof chrome.storage = {
    //@ts-ignore
    onChanged: {
      addListener: mockOutput.addListener.mockImplementation(
        (d: StorageWatchEventListener) => {
          onChangedCallback = d
        }
      ),
      removeListener: mockOutput.removeListener
    },
    sync: {
      // Needed because react hook tries to directly read the value
      //@ts-ignore
      get: mockOutput.getTriggers.mockImplementation((key: any) =>
        mockStorage.get(key)
      ),
      //@ts-ignore
      set: mockOutput.setTriggers.mockImplementation(
        (changes: { [key: string]: any }) => {
          Object.entries(changes).forEach(([key, value]) => {
            mockStorage.set(key, value)

            onChangedCallback &&
              onChangedCallback(
                {
                  [key]: {
                    oldValue: undefined,
                    newValue: value
                  }
                },
                "sync"
              )
          })
        }
      ),
      //@ts-ignore
      remove: mockOutput.removeTriggers.mockImplementation((key: string) => {
        mockStorage.remove(key)

        onChangedCallback &&
          onChangedCallback(
            {
              [key]: {
                oldValue: mockStorage.data[key],
                newValue: undefined
              }
            },
            "sync"
          )
      })
    }
  }

  globalThis.chrome.storage = storage

  return mockOutput
}

describe("react hook", () => {
  test("stores basic text data ", async () => {
    const { setTriggers } = createStorageMock()

    const key = "test"
    const value = "hello world"

    const { result, unmount } = renderHook(() => useStorage(key))

    await act(async () => {
      await result.current[1](value)
    })

    expect(setTriggers).toHaveBeenCalledWith({
      [key]: JSON.stringify(value)
    })

    // await waitFor(() => expect(result.current[0]).toBe(value))

    unmount()
  })

  test("mutate with setter function ", async () => {
    const { setTriggers } = createStorageMock()

    const key = "test"

    const value = "hello"

    const setter = (prev: string) => prev + " world"

    const { result, unmount } = renderHook(() =>
      useStorage(
        {
          key,
          instance: new Storage({ allCopied: true })
        },
        value
      )
    )

    await act(async () => {
      await result.current[1](setter)
    })

    const newValue = setter(value)

    expect(setTriggers).toHaveBeenCalledWith({
      [key]: JSON.stringify(newValue)
    })

    // expect(result.current[0]).toBe(newValue)
    unmount()
  })

  test("removes watch listener when unmounting", () => {
    const { addListener, removeListener } = createStorageMock()

    const { result, unmount } = renderHook(() => useStorage("stuff"))

    expect(addListener).toHaveBeenCalled()

    expect(result.current[0]).toBeUndefined()

    unmount()

    expect(removeListener).toHaveBeenCalled()
  })

  test("is reactive to key changes", async () => {
    const { setTriggers, getTriggers } = createStorageMock()

    const key1 = "key1"
    const key2 = "key2"
    const initValue = "hello"
    const key1Value = "hello world"
    const key2Value = "hello world 2"

    const { result, rerender, unmount } = renderHook(
      ({ key }) => useStorage(key, initValue),
      {
        initialProps: { key: key1 }
      }
    )

    // with initial key, set new value
    await act(async () => {
      await result.current[1](key1Value)
    })
    expect(setTriggers).toHaveBeenCalledWith({
      key1: JSON.stringify(key1Value)
    })

    // re-render with new key, and ensure new key is looked up from storage and that we reset to initial value
    await act(async () => {
      rerender({ key: key2 })
    })
    expect(getTriggers).toHaveBeenCalledWith(key2)
    await waitFor(() => expect(result.current[0]).toBe(initValue))

    // set new key to new value
    await act(async () => {
      await result.current[1](key2Value)
    })
    expect(setTriggers).toHaveBeenCalledWith({
      key2: JSON.stringify(key2Value)
    })
    await waitFor(() => expect(result.current[0]).toBe(key2Value))

    // re-render with old key, and ensure old key's up-to-date value is fetched
    await act(async () => {
      rerender({ key: key1 })
    })
    await waitFor(() => expect(result.current[0]).toBe(key1Value))

    unmount()
  })
})

describe("watch/unwatch", () => {
  test("attaches storage listener when watch listener is added", () => {
    const storageMock = createStorageMock()

    const storage = new Storage()
    storage.watch({ key: () => {} })

    expect(storageMock.addListener).toHaveBeenCalled()
    expect(storageMock.removeListener).not.toHaveBeenCalled()
  })

  test("removes storage listener when all watch listener is removed", () => {
    const storageMock = createStorageMock()

    const storage = new Storage()
    const watchConfig = { key: () => {} }
    storage.watch(watchConfig)
    storage.unwatch(watchConfig)

    expect(storageMock.addListener).toHaveBeenCalled()
    expect(storageMock.removeListener).toHaveBeenCalled()
  })

  test("doesn't remove storage listener given wrong reference", () => {
    const storageMock = createStorageMock()

    const storage = new Storage()

    const watchConfig = { key: () => {} }
    storage.watch({ key: () => {} })
    storage.unwatch(watchConfig)

    expect(storageMock.addListener).toHaveBeenCalled()
    expect(storageMock.removeListener).not.toHaveBeenCalled()
  })

  test("should call watch listeners", () => {
    const storageMock = createStorageMock()

    const storage = new Storage()

    const watchFn1 = jest.fn()
    const watchFn2 = jest.fn()

    expect(storage.watch({ key: watchFn1 })).toBeTruthy()
    expect(storage.watch({ key: watchFn2 })).toBeTruthy()
    expect(storage.watch({ key2: watchFn2 })).toBeTruthy()

    expect(storageMock.addListener).toHaveBeenCalledTimes(2)
  })

  test("doesn't call unwatched listeners", () => {
    const storageMock = createStorageMock()

    const storage = new Storage()

    const watchFn1 = jest.fn()
    const watchFn2 = jest.fn()

    expect(storage.watch({ key1: watchFn1 })).toBeTruthy()
    expect(storage.watch({ key2: watchFn2 })).toBeTruthy()
    expect(storage.unwatch({ key1: watchFn1 })).toBeTruthy()

    expect(storageMock.addListener).toHaveBeenCalled()
    expect(storageMock.removeListener).toHaveBeenCalled()
  })
})

// Create a new describe block for CRUD operations with namespace
describe("Storage - Basic CRUD operations with namespace", () => {
  // Declare the storage and namespace variables
  let storage = new Storage()
  let storageMock: ReturnType<typeof createStorageMock>
  const namespace = "testNamespace:"

  // Initialize storage and storageMock before each test case
  beforeEach(() => {
    storageMock = createStorageMock()
    storage = new Storage()
    storage.setNamespace(namespace)
  })

  // Test set operation with namespace
  test("set operation", async () => {
    // Test data
    const testKey = "key"
    const testValue = "value"

    // Perform set operation
    await storage.set(testKey, testValue)

    // Check if storageMock.setTriggers is called with the correct parameters
    expect(storageMock.setTriggers).toHaveBeenCalledWith({
      [`${namespace}${testKey}`]: JSON.stringify(testValue)
    })
  })

  test("set multiple operation", async () => {
    // Test data
    const testData = {
      key: "value",
      key2: "value2",
      key3: "value3",
    };
    // Perform setItems operation
    await storage.setItems(testData);

    // Check if storageMock.setTriggers is called with the correct parameters

    for (let key in testData) {
      expect(storageMock.setTriggers).toHaveBeenCalledWith({
        [`${namespace}${key}`]: JSON.stringify(testData[key]),
      });
    }
  });

  // Test get operation with namespace
  test("get operation", async () => {
    // Test data
    const testKey = "key"
    const testValue = "value"

    // Perform set operation
    await storage.set(testKey, testValue)

    // Perform get operation
    const getValue = await storage.get(testKey)

    // Check if storageMock.getTriggers is called with the correct parameter
    expect(storageMock.getTriggers).toHaveBeenCalledWith(
      `${namespace}${testKey}`
    )

    // Check if the returned value is correct
    expect(getValue).toEqual(testValue)
  })

  test("get multiple operation", async () => {
    // Test data
    const testData = {
      key: "value",
      key2: "value2",
      key3: "value3",
    };

    // Perform setItems operation
    await storage.setItems(testData);

    // Perform getItems operation
    const getValue = await storage.getItems(Object.keys(testData));

    // Check if storageMock.getTriggers is called with the correct parameter
    for (let key in testData) {
      expect(storageMock.getTriggers).toHaveBeenCalledWith(
        `${namespace}${key}`
      );
    }

    // Check if the returned value is correct
    expect(getValue).toEqual(testData);
  });

  // Test getAll operation with namespace
  test("getAll operation", async () => {
    // Test data
    const testKey1 = "key1"
    const testValue1 = "value1"
    const testKey2 = "key2"
    const testValue2 = "value2"

    // Perform set operations for two keys
    await storage.set(testKey1, testValue1)
    await storage.set(testKey2, testValue2)

    // Perform getAll operation
    const allData = await storage.getAll()

    // Check if the returned object has the correct keys
    // and ensure the keys are without namespace
    expect(Object.keys(allData)).toEqual([testKey1, testKey2])
  })

  // Test remove operation with namespace
  test("remove operation", async () => {
    // Test data
    const testKey = "key"
    const testValue = "value"

    // Perform set operation
    await storage.set(testKey, testValue)

    // Perform remove operation
    await storage.remove(testKey)

    // Check if storageMock.removeListener is called with the correct parameter
    expect(storageMock.removeTriggers).toHaveBeenCalledWith(
      `${namespace}${testKey}`
    )
  })

  // Test removeAll operation with namespace
  test("removeAll operation", async () => {
    // Test data
    const testKey1 = "key1"
    const testValue1 = "value1"
    const testKey2 = "key2"
    const testValue2 = "value2"

    // Perform set operations for two keys
    await storage.set(testKey1, testValue1)
    await storage.set(testKey2, testValue2)

    // Perform removeAll operation
    await storage.removeAll()

    expect(storageMock.removeTriggers).toHaveBeenCalledWith(
      `${namespace}${testKey1}`
    )
    expect(storageMock.removeTriggers).toHaveBeenCalledWith(
      `${namespace}${testKey2}`
    )
  })
})