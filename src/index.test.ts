import { beforeEach, expect, test } from "@jest/globals"
import { renderHook } from "@testing-library/react"

import { useStorage } from "~hook"

beforeEach(() => {
  localStorage.clear()
})

test("stores an object key ", () => {
  const key = "test"

  const value = "hello world"

  renderHook(() => {
    const { persist } = useStorage(key, async () => {
      await persist(value)
    })
  })

  expect(localStorage.getItem(key)).toBe(value)
})
