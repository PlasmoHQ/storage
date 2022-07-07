/**
 * Copyright (c) 2022 Plasmo Corp. <foss@plasmo.com> (https://www.plasmo.com) and contributors
 * Licensed under the MIT license.
 * This module share storage between chrome storage and local storage.
 */
import { beforeEach, describe, expect, jest, test } from "@jest/globals"
import { act, render, renderHook } from "@testing-library/react"
import React from "react"

import { Storage, StorageWatchListener, useStorage } from "~index"

beforeEach(() => {
  global.chrome = undefined
  localStorage.clear()
})

describe("react hook", () => {
  test("stores basic text data ", () => {
    const key = "test"

    const value = "hello world"

    const { result } = renderHook(() => useStorage(key))
    act(() => {
      result.current[1](value)
    })

    expect(localStorage.getItem(key)).toBe(JSON.stringify(value))
  })
  test("removes watch listener when unmounting", () => {
    const mockAttach = jest.fn()
    const mockDetach = jest.fn()
    global.chrome = {
      storage: {
        // @ts-ignore
        onChanged: {
          addListener: mockAttach,
          removeListener: mockDetach
        },

        sync: {
          // @ts-ignore
          get: jest.fn()
        }
      }
    }

    const testRenderComponent = () => {
      useStorage("test")
      return null
    }
    const { unmount } = render(React.createElement(testRenderComponent))
    unmount()

    expect(mockAttach).toHaveBeenCalled()
    expect(mockDetach).toHaveBeenCalled()
  })
})

describe("watch/unwatch", () => {
  test("attaches storage listener when watch listener is added", () => {
    const mockAttach = jest.fn()
    const mockDetach = jest.fn()
    global.chrome = {
      storage: {
        // @ts-ignore
        onChanged: {
          addListener: mockAttach,
          removeListener: mockDetach
        }
      }
    }

    const storage = new Storage()
    storage.watch({ key: () => {} })

    expect(mockAttach).toHaveBeenCalled()
    expect(mockDetach).not.toHaveBeenCalled()
  })

  test("removes storage listener when all watch listener is removed", () => {
    const mockAttach = jest.fn()
    const mockDetach = jest.fn()
    global.chrome = {
      storage: {
        // @ts-ignore
        onChanged: {
          addListener: mockAttach,
          removeListener: mockDetach
        }
      }
    }

    const storage = new Storage()
    const watchConfig = { key: () => {} }
    storage.watch(watchConfig)
    storage.unwatch(watchConfig)

    expect(mockAttach).toHaveBeenCalled()
    expect(mockDetach).toHaveBeenCalled()
  })

  test("doesn't remove storage listener when watch listener remain after unwatch", () => {
    const mockAttach = jest.fn()
    const mockDetach = jest.fn()
    global.chrome = {
      storage: {
        // @ts-ignore
        onChanged: {
          addListener: mockAttach,
          removeListener: mockDetach
        }
      }
    }

    const storage = new Storage()
    const watchConfig = { key: () => {} }
    storage.watch(watchConfig)
    storage.watch({ key: () => {} })
    storage.unwatch(watchConfig)

    expect(mockAttach).toHaveBeenCalled()
    expect(mockDetach).not.toHaveBeenCalled()
  })

  test("calls all watch listeners", () => {
    let internalListener: StorageWatchListener = () => {}
    global.chrome = {
      storage: {
        // @ts-ignore
        onChanged: {
          addListener: (listener) => {
            internalListener = listener
          },
          removeListener: jest.fn()
        }
      }
    }

    const storage = new Storage()

    const watchFn1 = jest.fn()
    const watchFn2 = jest.fn()

    storage.watch({ key: watchFn1 })
    storage.watch({ key: watchFn2 })

    internalListener(
      {
        key: { newValue: "{}", oldValue: "{}" }
      } as chrome.storage.StorageChange,
      "sync"
    )

    expect(watchFn1).toHaveBeenCalled()
    expect(watchFn2).toHaveBeenCalled()
  })

  test("doesn't call unwatched listeners", () => {
    let internalListener: StorageWatchListener = () => {}
    global.chrome = {
      storage: {
        // @ts-ignore
        onChanged: {
          addListener: (listener) => {
            internalListener = listener
          },
          removeListener: jest.fn()
        }
      }
    }

    const storage = new Storage()

    const watchFn1 = jest.fn()
    const watchFn2 = jest.fn()

    storage.watch({ key: watchFn1 })
    storage.watch({ key: watchFn2 })
    storage.unwatch({ key: watchFn1 })

    internalListener(
      {
        key: { newValue: "{}", oldValue: "{}" }
      } as chrome.storage.StorageChange,
      "sync"
    )

    expect(watchFn1).not.toHaveBeenCalled()
    expect(watchFn2).toHaveBeenCalled()
  })
})
