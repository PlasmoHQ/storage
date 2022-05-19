import { useCallback, useEffect, useRef, useState } from "react"

import { Storage } from "./index"

export const useStorage = <T = any>(
  key: string,
  onInit?: ((v?: T) => T) | T
) => {
  // Render state
  const [renderValue, setRenderValue] = useState<T>(onInit)

  // Use to ensure we don't set render state after unmounted
  const isMounted = useRef(false)

  // Storage state
  const storageRef = useRef(new Storage())

  useEffect(() => {
    isMounted.current = true

    if (!!chrome?.storage) {
      storageRef.current.watch({
        [key]: (c) => {
          if (isMounted.current) {
            setRenderValue(c.newValue)
          }
        }
      })
    }

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
      storageRef.current
        .set(key, newValue)
        .then(() => isMounted.current && setRenderValue(newValue)),
    []
  )

  return [
    renderValue,
    persistValue,
    {
      setRenderValue,
      setStoreValue
    }
  ] as const
}
