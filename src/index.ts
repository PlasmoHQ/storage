/**
 * Copyright (c) 2022 Plasmo Corp. <foss@plasmo.com> (https://www.plasmo.com) and contributors
 * Licensed under the MIT license.
 * This module share storage between chrome storage and local storage.
 */
export class Storage {
  #secretSet: Set<string>
  constructor(secretKeys: string[] = []) {
    this.#secretSet = new Set(secretKeys)
  }

  /**
   * Sync the key/value between chrome storage and local storage.
   * @param key
   * @returns false if the value is unchanged or it is a secret key.
   */
  sync = (key: string) =>
    new Promise((resolve) => {
      if (this.#secretSet.has(key) || !chrome?.storage) {
        resolve(false)
        return
      }

      const previousValue = localStorage.getItem(key)

      chrome.storage.sync.get(key, (s) => {
        const value = s[key] as string
        localStorage.setItem(key, value)
        resolve(value !== previousValue)
      })
    })

  /**
   * Get value from either local storage or chrome storage.
   */
  get = <T = string>(key: string) =>
    new Promise<T>((resolve) => {
      // If chrome storage is not available, use localStorage
      // TODO: TRY asking for storage permission and add it as well?
      if (!chrome?.storage) {
        console.warn(
          "Extension Storage API is not accessible. Fallback to localStorage. Ignore this warning for popup. Otherwise, you might need to add the storage permission to the manifest."
        )
        const value = localStorage.getItem(key)
        if (!value) {
          resolve(undefined)
        } else {
          resolve(JSON.parse(value) as T)
        }
      } else {
        chrome.storage.sync.get(key, (s) => {
          if (!!chrome.runtime.lastError) {
            resolve(undefined)
          } else {
            resolve(JSON.parse(s[key]) as T)
          }
        })
      }
    })

  set = (key: string, rawValue: any) =>
    new Promise<void>((resolve) => {
      const value = JSON.stringify(rawValue)

      // If not a secret, we set it in localstorage as well
      if (!this.#secretSet.has(key)) {
        localStorage.setItem(key, value)
      }

      if (!chrome?.storage) {
        resolve(undefined)
      } else {
        chrome.storage.sync.set({ [key]: value }, resolve)
      }
    })

  watch = (
    callbackMap: Record<
      string,
      (
        c: chrome.storage.StorageChange,
        area: "sync" | "local" | "managed"
      ) => void
    >
  ) =>
    chrome?.storage?.onChanged.addListener((changes, areaName) => {
      const callbackKeys = Object.keys(callbackMap)
      const changeKeys = Object.keys(changes)

      const smallerList =
        callbackKeys.length < changeKeys.length ? callbackKeys : changeKeys
      const biggerList =
        callbackKeys.length > changeKeys.length ? callbackKeys : changeKeys

      const checkSet = new Set(biggerList)

      const relevantKeyList = smallerList.filter((key) => checkSet.has(key))

      if (relevantKeyList.length === 0) {
        return
      }

      for (const key of relevantKeyList) {
        callbackMap[key](
          {
            newValue: JSON.parse(changes[key].newValue),
            oldValue: JSON.parse(changes[key].oldValue)
          },
          areaName
        )
      }
    })
}

export * from "./hook"
