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
   * @returns true if the value is changed.
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
  get = (key: string) =>
    new Promise<string>((resolve) => {
      // If chrome storage is not available, use localStorage
      if (!chrome?.storage) {
        resolve(localStorage.getItem(key))
      } else {
        chrome.storage.sync.get(key, (s) => {
          resolve(s[key])
        })
      }
    })

  set = (key: string, rawValue: string | any) =>
    new Promise<void>((resolve) => {
      const value =
        typeof rawValue === "string" ? rawValue : JSON.stringify(rawValue)

      // If not a secret, we set it in localstorage as well
      if (!this.#secretSet[key]) {
        localStorage.setItem(key, value)
      }

      if (!chrome?.storage) {
        resolve(null)
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
    chrome.storage.onChanged.addListener((changes, areaName) => {
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
        callbackMap[key](changes[key], areaName)
      }
    })
}

export * from "./hook"
