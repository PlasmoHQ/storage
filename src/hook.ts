import { useEffect, useRef, useState } from "react"

import { Storage } from "./index"

export const useStorage = (key: string, onInit?: (v: string) => void) => {
  const [value, set] = useState<string>("")

  const storageRef = useRef(new Storage())

  useEffect(() => {
    storageRef.current.get(key).then((v) => {
      set(v)
      onInit?.(v)
    })

    if (!chrome?.storage) {
      return
    }

    chrome.storage.onChanged.addListener((objs) => {
      if (objs[key] && objs[key].newValue !== value) {
        set(objs[key].newValue)
      }
    })
  }, [])

  return {
    value,
    // Set the render value
    set,
    // Save the value OR current rendering value into chrome storage
    save: (v?: string) => storageRef.current.set(key, v || value),
    // Store the value into chrome storage, then set its render state
    persist: (newValue: string) =>
      storageRef.current.set(key, newValue).then(() => set(newValue))
  }
}
