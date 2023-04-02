/**
 * Copyright (c) 2023 Plasmo Corp. <foss@plasmo.com> (https://www.plasmo.com) and contributors
 * Licensed under the MIT license.
 * This module share storage between chrome storage and local storage.
 */
import { beforeEach, describe, expect, jest, test } from "@jest/globals"
import { act, renderHook } from "@testing-library/react"

import type { StorageWatchEventListener } from "~index"

const { Storage } = await import("~index")
const { useStorage } = await import("~hook")

const mockStorage = {
  data: {},
  get(key: string) {
    return {
      [key]: this.data[key]
    }
  },
  set(key = "", value = "") {
    this.data[key] = value
  },
  clear() {
    this.data = {}
  }
}

beforeEach(() => {
  mockStorage.clear()
  jest.fn().mockReset()
})

const createStorageMock = () => {
  let onChangedCallback: StorageWatchEventListener

  const mockOutput = {
    addListener: jest.fn(),
    removeListener: jest.fn(),
    getTriggers: jest.fn(),
    setTriggers: jest.fn()
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
      )
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
