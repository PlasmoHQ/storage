/**
 * Copyright (c) 2022 Plasmo Corp. <foss@plasmo.com> (https://www.plasmo.com) and contributors
 * Licensed under the MIT license.
 * This module share storage between chrome storage and local storage.
 */
import browser from "webextension-polyfill"

import { getQuotaWarning } from "./get-quota-warning"

export type StorageWatchEventListener = Parameters<
  typeof chrome.storage.onChanged.addListener
>[0]

export type StorageAreaName = Parameters<StorageWatchEventListener>[1]
export type StorageWatchCallback = (
  change: browser.Storage.StorageChange,
  area: StorageAreaName
) => void

export type StorageCallbackMap = Record<string, StorageWatchCallback>

export type StorageArea = browser.Storage.StorageArea &
  chrome.storage.StorageArea

export type InternalStorage = browser.Storage.Static

const hasWindow = typeof window !== "undefined"
/**
 * https://docs.plasmo.com/framework-api/storage
 */
export class Storage {
  #storage: InternalStorage
  #client: StorageArea
  #localClient = hasWindow ? window.localStorage : null

  #area: StorageAreaName
  #skipQuotaCheck = false

  // TODO: Make another map for local storage
  #chromeStorageCommsMap: Map<
    string,
    {
      callbackSet: Set<StorageWatchCallback>
      listener: StorageWatchEventListener
    }
  > = new Map()

  #secretSet: Set<string>
  #allSecret = false

  hasExtensionAPI = false

  constructor({
    area = "sync" as StorageAreaName,
    secretKeyList = [] as string[],
    allSecret = false,
    unlimited = false
  } = {}) {
    this.updateSecret(secretKeyList)
    this.#area = area
    this.#skipQuotaCheck = unlimited
    this.#allSecret = allSecret

    if (browser.storage) {
      this.#storage = browser.storage
      this.#client = this.#storage[this.#area]
      this.hasExtensionAPI = true
    }
  }

  updateSecret(secretKeyList: string[]) {
    this.#secretSet = new Set(secretKeyList)
  }

  /**
   * Sync the key/value between chrome storage and local storage.
   * @param key
   * @returns false if the value is unchanged or it is a secret key.
   */
  sync = async (key: string) => {
    if (this.#secretSet.has(key) || this.#allSecret || !this.hasExtensionAPI) {
      return false
    }

    const previousValue = this.#localClient?.getItem(key)
    const dataSet = await this.#client.get(key)
    const value = dataSet[key] as string

    this.#localClient?.setItem(key, value)

    return value !== previousValue
  }

  /**
   * Get value from either local storage or chrome storage.
   */
  get = async <T = string>(key: string) => {
    if (this.hasExtensionAPI) {
      const dataMap = await this.#client.get(key)
      return this.#parseValue(dataMap[key]) as T
    } else {
      // If chrome storage is not available, use localStorage
      // TODO: TRY asking for storage permission and retry?
      const storedValue = this.#localClient?.getItem(key)
      return this.#parseValue(storedValue) as T
    }
  }

  /**
   * Set the value. If it is a secret, it will only be set in extension storage.
   * Returns a warning if storage capacity is almost full.
   * Throws error if the new item will make storage full
   */
  set = async (key: string, rawValue: any) => {
    const value = JSON.stringify(rawValue)

    // If not a secret, we set it in localstorage as well
    if (!this.#secretSet.has(key) && !this.#allSecret) {
      this.#localClient?.setItem(key, value)
    }

    if (!this.hasExtensionAPI) {
      return undefined
    }

    // when user has unlimitedStorage permission, skip used space check
    const warning = this.#skipQuotaCheck
      ? ""
      : await getQuotaWarning(this.#area, this.#storage, key, value)

    await this.#client.set({ [key]: value })

    return warning
  }

  remove = async (key: string) => {
    // If not a secret, we set it in localstorage as well
    if (!this.#secretSet.has(key) && !this.#allSecret) {
      this.#localClient?.removeItem(key)
    }

    if (this.hasExtensionAPI) {
      await this.#client.remove(key)
    }
  }

  watch = (callbackMap: StorageCallbackMap): boolean => {
    if (!this.isWatchingSupported()) {
      return false
    }

    this.#addListener(callbackMap)

    return true
  }

  isWatchingSupported = () => this.hasExtensionAPI

  #addListener = (callbackMap: StorageCallbackMap) => {
    Object.entries(callbackMap).forEach(([key, callback]) => {
      const callbackSet =
        this.#chromeStorageCommsMap.get(key)?.callbackSet || new Set()

      callbackSet.add(callback)

      if (callbackSet.size > 1) {
        return
      }

      const chromeStorageListener: StorageWatchCallback = (
        changes,
        areaName
      ) => {
        if (areaName !== this.#area) {
          return
        }

        const callbackKeySet = new Set(Object.keys(callbackMap))
        const changeKeys = Object.keys(changes)

        const relevantKeyList = changeKeys.filter((key) =>
          callbackKeySet.has(key)
        )

        if (relevantKeyList.length === 0) {
          return
        }

        for (const key of relevantKeyList) {
          const storageComms = this.#chromeStorageCommsMap.get(key)

          storageComms?.callbackSet?.forEach((callback) => {
            callback(
              {
                newValue: this.#parseValue(changes[key].newValue),
                oldValue: this.#parseValue(changes[key].oldValue)
              },
              areaName
            )
          })
        }
      }

      this.#storage.onChanged.addListener(chromeStorageListener)

      this.#chromeStorageCommsMap.set(key, {
        callbackSet,
        listener: chromeStorageListener
      })
    })
  }

  unwatch = (callbackMap: StorageCallbackMap): boolean => {
    if (!this.isWatchingSupported()) {
      return false
    }
    this.#removeListener(callbackMap)
    return true
  }

  #removeListener(callbackMap: StorageCallbackMap) {
    Object.entries(callbackMap)
      .filter(([key]) => this.#chromeStorageCommsMap.has(key))
      .forEach(([key, callback]) => {
        const storageComms = this.#chromeStorageCommsMap.get(key)
        storageComms.callbackSet.delete(callback)

        if (storageComms.callbackSet.size === 0) {
          this.#chromeStorageCommsMap.delete(key)
          this.#storage.onChanged.removeListener(storageComms.listener)
        }
      })
  }

  unwatchAll = () => this.#removeAllListener()

  #removeAllListener() {
    this.#chromeStorageCommsMap.forEach(({ listener }) =>
      this.#storage.onChanged.removeListener(listener)
    )

    this.#chromeStorageCommsMap.clear()
  }

  #parseValue(rawValue: any) {
    try {
      if (rawValue !== undefined) {
        return JSON.parse(rawValue)
      }
    } catch (e) {
      // ignore error. TODO: debug log them maybe
      console.error(e)
    }
    return undefined
  }
}

export type StorageOptions = ConstructorParameters<typeof Storage>[0]
