/**
 * Copyright (c) 2022 Plasmo Corp. <foss@plasmo.com> (https://www.plasmo.com) and contributors
 * Licensed under the MIT license.
 * This module share storage between chrome storage and local storage.
 */
import { beforeEach, expect, test } from "@jest/globals"
import { act, renderHook } from "@testing-library/react"

import { useStorage } from "~index"

global.chrome = undefined

beforeEach(() => {
  localStorage.clear()
})

test("stores basic text data ", () => {
  const key = "test"

  const value = "hello world"

  const { result } = renderHook(() => useStorage(key))

  act(() => {
    result.current[1](value)
  })

  expect(localStorage.getItem(key)).toBe(JSON.stringify(value))
})
