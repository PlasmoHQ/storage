/**
 * Copyright (c) 2022 Plasmo Corp. <foss@plasmo.com> (https://www.plasmo.com) and contributors
 * Licensed under the MIT license.
 * This module share storage between chrome storage and local storage.
 */
import { useCallback, useEffect, useRef, useState } from "react"

import { Storage, StorageAreaName } from "./index"

export const useStorage = <T = any>(
  rawKey:
    | string
    | {
        key: string
        area?: StorageAreaName
      },
  onInit?: ((v?: T) => T) | T
) => {
  const isStringKey = typeof rawKey === "string"

  const key = isStringKey ? rawKey : rawKey.key

  // Render state
  const [renderValue, setRenderValue] = useState<T>(onInit)

  // Use to ensure we don't set render state after unmounted
  const isMounted = useRef(false)

  // Storage state
  const storageRef = useRef(new Storage(isStringKey ? "sync" : rawKey.area))

  useEffect(() => {
    isMounted.current = true

    storageRef.current.watch({
      [key]: (c) => {
        if (isMounted.current) {
          setRenderValue(c.newValue)
        }
      }
    })

    storageRef.current.get<T>(key).then(async (v) => {
      if (onInit instanceof Function) {
        // Transform the data on init, then reflect it back to both the render and the store
        const initValue = await onInit?.(v)
        if (typeof initValue !== "undefined") {
          persistValue(initValue)
          return
        }
      }

      if (typeof v !== "undefined") {
        setRenderValue(v)
      } else if (typeof onInit !== "undefined") {
        setRenderValue(onInit)
      }
    })

    return () => {
      isMounted.current = false
    }
  }, [])

  // Save the value OR current rendering value into chrome storage
  const setStoreValue = useCallback(
    (v?: T) => storageRef.current.set(key, v || renderValue),
    [renderValue]
  )

  // Store the value into chrome storage, then set its render state
  const persistValue = useCallback(
    (newValue: T) =>
      setStoreValue(newValue).then(
        () => isMounted.current && setRenderValue(newValue)
      ),
    [setStoreValue]
  )

  const remove = useCallback(() => {
    storageRef.current.remove(key)
    setRenderValue(undefined)
  }, [setRenderValue])

  return [
    renderValue,
    persistValue,
    {
      setRenderValue,
      setStoreValue,
      remove
    }
  ] as const
}
