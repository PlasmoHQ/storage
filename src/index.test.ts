/**
 * Copyright (c) 2022 Plasmo Corp. <foss@plasmo.com> (https://www.plasmo.com) and contributors
 * Licensed under the MIT license.
 * This module share storage between chrome storage and local storage.
 */
import { beforeEach, describe, expect, jest, test } from "@jest/globals"
import { act, renderHook } from "@testing-library/react"
import type Browser from "webextension-polyfill"

import type { StorageWatchEventListener } from "~index"

const browserMock = {} as any

jest.mock("webextension-polyfill", () => browserMock)

const { Storage, useStorage } = await import("~index")

beforeEach(() => {
  localStorage.clear()
})

const createStorageMock = ({ getTriggers = false } = {}) => {
  const mockOutput = {
    triggerChange: null as StorageWatchEventListener,
    addListener: jest.fn(),
    removeListener: jest.fn()
  }

  const storage: Browser.Storage.Static = {
    //@ts-ignore
    onChanged: {
      addListener: mockOutput.addListener,
      removeListener: mockOutput.removeListener
    },
    sync: {
      // Needed because react hook tries to directly read the value
      //@ts-ignore
      get: async () => jest.fn(),
      //@ts-ignore
      set: async () => jest.fn()
    }
  }

  if (getTriggers) {
    storage.onChanged.addListener = (listener) => {
      mockOutput.triggerChange = listener
    }
  }

  browserMock.storage = storage

  return mockOutput
}

describe("react hook", () => {
  test("stores basic text data ", async () => {
    const key = "test"

    const value = "hello world"

    const { result, unmount } = renderHook(() => useStorage(key))

    await act(async () => {
      await result.current[1](value)
    })

    expect(result.current[0]).toBe(value)

    expect(localStorage.getItem(key)).toBe(JSON.stringify(value))
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
