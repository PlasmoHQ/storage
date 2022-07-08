/**
 * Copyright (c) 2022 Plasmo Corp. <foss@plasmo.com> (https://www.plasmo.com) and contributors
 * Licensed under the MIT license.
 * This module share storage between chrome storage and local storage.
 */
import { beforeEach, describe, expect, jest, test } from "@jest/globals"
import { act, renderHook } from "@testing-library/react"

import { Storage, StorageWatchEventListener, useStorage } from "~index"

beforeEach(() => {
  global.chrome = undefined
  localStorage.clear()
})

const createStorageMock = ({ getTriggers = false } = {}) => {
  const mockOutput = {
    triggerChange: null as StorageWatchEventListener,
    addListener: jest.fn(),
    removeListener: jest.fn()
  }

  global.chrome = {
    storage: {
      //@ts-ignore
      onChanged: {
        addListener: mockOutput.addListener,
        removeListener: mockOutput.removeListener
      },
      sync: {
        // Needed because react hook tries to directly read the value
        //@ts-ignore
        get: jest.fn()
      }
    }
  }

  if (getTriggers) {
    global.chrome.storage.onChanged.addListener = (listener) => {
      mockOutput.triggerChange = listener
    }
  }

  return mockOutput
}

describe("react hook", () => {
  test("stores basic text data ", () => {
    const key = "test"

    const value = "hello world"

    const { result, unmount } = renderHook(() => useStorage(key))
    act(() => {
      result.current[1](value)
    })

    expect(localStorage.getItem(key)).toBe(JSON.stringify(value))
    unmount()
  })

  test("removes watch listener when unmounting", () => {
    const { addListener, removeListener } = createStorageMock()

    const { unmount } = renderHook(() => useStorage("stuff"))
    expect(addListener).toHaveBeenCalled()

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

  test("calls all watch listeners", () => {
    const storageMock = createStorageMock({ getTriggers: true })

    const storage = new Storage()

    const watchFn1 = jest.fn()
    const watchFn2 = jest.fn()

    expect(storage.watch({ key: watchFn1 })).toBeTruthy()
    expect(storage.watch({ key: watchFn2 })).toBeTruthy()

    storageMock.triggerChange(
      {
        key: { newValue: "{}", oldValue: "{}" }
      },
      "sync"
    )

    expect(watchFn1).toHaveBeenCalled()
    expect(watchFn2).toHaveBeenCalled()
  })

  test("doesn't call unwatched listeners", () => {
    const storageMock = createStorageMock({ getTriggers: true })

    const storage = new Storage()

    const watchFn1 = jest.fn()
    const watchFn2 = jest.fn()

    storage.watch({ key: watchFn1 })
    storage.watch({ key: watchFn2 })
    storage.unwatch({ key: watchFn1 })

    storageMock.triggerChange(
      {
        key: { newValue: "{}", oldValue: "{}" }
      },
      "sync"
    )

    expect(watchFn1).not.toHaveBeenCalled()
    expect(watchFn2).toHaveBeenCalled()
  })
})
