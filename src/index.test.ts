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
