import { useEffect, useRef, useState } from "react"

import { Storage } from "./index"

export const useStorage = <T = any>(
  key: string,
  onInit?: (v: T) => T | void
) => {
  // Render state
  const [value, set] = useState<T>()

  // Storage state
  const storageRef = useRef(new Storage())

  useEffect(() => {
    storageRef.current.get<T>(key).then(async (v) => {
      // Transform the data on init, then reflect it back to both the render and the store
      const initValue = await onInit?.(v)
      if (typeof initValue !== "undefined") {
        storageRef.current.set(key, initValue)
        set(initValue)
      } else {
        set(v)
      }
    })

    if (!chrome?.storage) {
      return
    }

    storageRef.current.watch({
      [key]: (c) => {
        set(c.newValue)
      }
    })
  }, [])

  return {
    value,
    // Set the render value
    set,
    // Save the value OR current rendering value into chrome storage
    save: (v?: T) => storageRef.current.set(key, v || value),
    // Store the value into chrome storage, then set its render state
    persist: (newValue: T) =>
      storageRef.current.set(key, newValue).then(() => set(newValue))
  }
}
