/**
 * Copyright (c) 2022 Plasmo Corp. <foss@plasmo.com> (https://www.plasmo.com) and contributors
 * Licensed under the MIT license.
 * This module share storage between chrome storage and local storage.
 */
import { useCallback, useEffect, useRef, useState } from "react"

import { Storage, StorageAreaName, StorageCallbackMap } from "./index"

type Setter<T> = ((v?: T) => T) | T

/**
 * https://docs.plasmo.com/framework/storage
 * @param rawKey
 * @param onInit  If it is a function, the returned value will be rendered and persisted. If it is a static value, it will only be rendered, not persisted
 * @returns
 */
export const useStorage = <T = any>(
  rawKey:
    | string
    | {
        key: string
        area?: StorageAreaName
        isSecret?: boolean
        unlimited?: boolean
      },
  onInit?: Setter<T>
) => {
  const isStringKey = typeof rawKey === "string"

  const key = isStringKey ? rawKey : rawKey.key

  // Render state
  const [renderValue, setRenderValue] = useState<T>(onInit)

  // Use to ensure we don't set render state after unmounted
  const isMounted = useRef(false)

  // Storage state
  const storageRef = useRef(
    new Storage({
      area: isStringKey ? "sync" : rawKey.area,
      allSecret: !isStringKey && rawKey.isSecret,
      unlimited: !isStringKey && rawKey.unlimited
    })
  )

  useEffect(() => {
    isMounted.current = true
    const watchConfig: StorageCallbackMap = {
      [key]: (change) => {
        if (isMounted.current) {
          setRenderValue(change.newValue)
        }
      }
    }

    storageRef.current.watch(watchConfig)

    storageRef.current.get<T>(key)?.then(async (v) => {
      if (onInit instanceof Function) {
        const initValue = await onInit?.(v)
        if (initValue !== undefined) {
          persistValue(initValue)
        }
        return
      }
      setRenderValue(v !== undefined ? v : onInit)
    })

    return () => {
      isMounted.current = false
      storageRef.current.unwatch(watchConfig)
    }
  }, [])

  // Save the value OR current rendering value into chrome storage
  const setStoreValue = useCallback(
    (v?: T) => storageRef.current.set(key, v !== undefined ? v : renderValue),
    [renderValue]
  )

  // Store the value into chrome storage, then set its render state
  const persistValue = useCallback(
    async (setter: Setter<T>) => {
      const newValue = setter instanceof Function ? setter(renderValue) : setter

      await setStoreValue(newValue)

      if (isMounted.current) {
        setRenderValue(newValue)
      }
    },
    [renderValue, setStoreValue]
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
