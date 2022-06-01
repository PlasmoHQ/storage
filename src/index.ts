/**
 * Copyright (c) 2022 Plasmo Corp. <foss@plasmo.com> (https://www.plasmo.com) and contributors
 * Licensed under the MIT license.
 * This module share storage between chrome storage and local storage.
 */

type StorageWatchEventListener = Parameters<
  typeof chrome.storage.onChanged.addListener
>[0]

export type StorageAreaName = Parameters<StorageWatchEventListener>[1]

export class Storage {
  #secretSet: Set<string>

  #client: chrome.storage.StorageArea = null
  #area: StorageAreaName = null

  hasExtensionAPI = false

  constructor(
    storageArea = "sync" as StorageAreaName,
    secretKeyList: string[] = []
  ) {
    this.#secretSet = new Set(secretKeyList)
    this.#area = storageArea

    if (!!chrome?.storage) {
      this.#client = chrome.storage[storageArea]
      this.hasExtensionAPI = true
    }
  }

  /**
   * Sync the key/value between chrome storage and local storage.
   * @param key
   * @returns false if the value is unchanged or it is a secret key.
   */
  sync = (key: string) =>
    new Promise((resolve) => {
      if (this.#secretSet.has(key) || !this.#client) {
        resolve(false)
        return
      }

      const previousValue = localStorage?.getItem(key)

      this.#client.get(key, (s) => {
        const value = s[key] as string
        localStorage?.setItem(key, value)
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
      if (!this.#client) {
        console.warn(
          "Extension Storage API is not accessible. Fallback to localStorage. Ignore this warning for popup. Otherwise, you might need to add the storage permission to the manifest."
        )
        const value = localStorage?.getItem(key)
        if (!value || typeof value !== "string") {
          resolve(undefined)
        } else {
          resolve(JSON.parse(value) as T)
        }
      } else {
        this.#client.get(key, (s) => {
          if (!s[key] || typeof s[key] !== "string") {
            resolve(undefined)
          } else {
            resolve(JSON.parse(s[key]) as T)
          }
        })
      }
    })

  /**
   * Set the value. If it is a secret, it will only be set in extension storage
   */
  set = (key: string, rawValue: any) =>
    new Promise<void>((resolve) => {
      const value = JSON.stringify(rawValue)

      // If not a secret, we set it in localstorage as well
      if (!this.#secretSet.has(key)) {
        localStorage?.setItem(key, value)
      }

      if (this.#client !== null) {
        this.#client.set({ [key]: value }, resolve)
        return
      }

      resolve(undefined)
    })

  remove = (key: string) =>
    new Promise<void>((resolve) => {
      // If not a secret, we set it in localstorage as well
      if (!this.#secretSet.has(key)) {
        localStorage?.removeItem(key)
      }

      if (this.#client !== null) {
        this.#client?.remove(key, resolve)
        return
      }

      resolve(undefined)
    })

  watch = (
    callbackMap: Record<
      string,
      (c: chrome.storage.StorageChange, area: StorageAreaName) => void
    >
  ) =>
    this.hasExtensionAPI &&
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== this.#area) {
        return
      }

      const callbackKeys = Object.keys(callbackMap)
      const changeKeys = Object.keys(changes)

      const relevantKeyList = getUnionList(callbackKeys, changeKeys)

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

function getUnionList(listA: string[], listB: string[]) {
  const smallerList = listA.length < listB.length ? listA : listB
  const biggerList = listA.length > listB.length ? listA : listB

  const checkSet = new Set(biggerList)

  return smallerList.filter((key) => checkSet.has(key))
}
