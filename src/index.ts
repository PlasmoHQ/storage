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

const hasWebApi = typeof window !== "undefined"

export abstract class BaseStorage {
  #extStorageEngine: InternalStorage

  // The main storage engine
  #extClient: StorageArea
  get extClient() {
    return this.#extClient
  }

  // The backup client on the web, for now use localStorage
  #webClient = hasWebApi ? window.localStorage : null
  get webClient() {
    return this.#webClient
  }

  #area: StorageAreaName
  get area() {
    return this.#area
  }

  get hasWebAPI() {
    return hasWebApi
  }

  #shouldCheckQuota = false

  #chromeStorageCommsMap = new Map<
    string,
    {
      callbackSet: Set<StorageWatchCallback>
      listener: StorageWatchEventListener
    }
  >()

  #publicKeySet: Set<string>
  get publicKeySet() {
    return this.#publicKeySet
  }

  isPublic = (key: string) => this.allPublic || this.publicKeySet.has(key)

  #allPublic = false
  get allPublic() {
    return this.#allPublic
  }

  #hasExtensionApi = false
  get hasExtensionApi() {
    return this.#hasExtensionApi
  }

  isWatchingSupported = () => this.hasExtensionApi

  constructor({
    area = "sync" as StorageAreaName,
    unlimited = false,
    allPublic = false,
    publicKeyList = [] as string[]
  } = {}) {
    this.setPublicKeySet(publicKeyList)
    this.#area = area
    this.#shouldCheckQuota = unlimited
    this.#allPublic = allPublic

    if (browser.storage) {
      this.#extStorageEngine = browser.storage
      this.#extClient = this.#extStorageEngine[this.area]
      this.#hasExtensionApi = true
    }
  }

  setPublicKeySet(keyList: string[]) {
    this.#publicKeySet = new Set(keyList)
  }

  getAll = () => this.#extClient?.get()

  /**
   * Sync the key/value between chrome storage and local storage.
   * @param key if undefined, sync all public keys.
   * @returns false if the value is unchanged or it is a secret key.
   */
  syncPublic = async (key?: string) => {
    const syncAll = key === undefined
    if (
      (!syncAll && !this.publicKeySet.has(key)) ||
      !this.allPublic ||
      !this.hasExtensionApi
    ) {
      return false
    }

    const dataMap = this.allPublic
      ? await this.getAll()
      : await this.#extClient.get(syncAll ? [...this.publicKeySet] : [key])

    let changed = false

    for (const pKey in dataMap) {
      const value = dataMap[pKey] as string
      const previousValue = this.#webClient?.getItem(pKey)
      this.#webClient?.setItem(pKey, value)
      changed ||= value !== previousValue
    }

    return changed
  }

  protected rawGet = async (key: string): Promise<string> => {
    if (this.hasExtensionApi) {
      const dataMap = await this.#extClient.get(key)
      return dataMap[key]
    }

    // If chrome storage is not available, use localStorage
    // TODO: TRY asking for storage permission and retry?
    if (this.hasWebAPI && this.isPublic(key)) {
      return this.#webClient?.getItem(key)
    }

    return null
  }

  protected rawSet = async (key: string, value: string) => {
    // If not a secret, we set it in localstorage as well
    if (this.hasWebAPI && this.isPublic(key)) {
      this.#webClient?.setItem(key, value)
    }

    if (this.hasExtensionApi) {
      // when user has unlimitedStorage permission, skip used space check
      let warning = this.#shouldCheckQuota
        ? await getQuotaWarning(this, key, value)
        : ""

      await this.#extClient.set({ [key]: value })

      return warning
    }

    return null
  }

  /**
   * @param includeLocalStorage Also cleanup Web API localStorage, NOT chrome.storage.local
   */
  clear = async (includeLocalStorage = false) => {
    if (includeLocalStorage && this.hasWebAPI) {
      this.#webClient?.clear()
    }

    await this.#extClient.clear()
  }

  remove = async (key: string) => {
    if (this.hasWebAPI && this.isPublic(key)) {
      this.#webClient?.removeItem(key)
    }

    if (this.hasExtensionApi) {
      await this.#extClient.remove(key)
    }
  }

  watch = (callbackMap: StorageCallbackMap): boolean => {
    if (!this.isWatchingSupported()) {
      return false
    }

    this.#addListener(callbackMap)

    return true
  }

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
        if (areaName !== this.area) {
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

        Promise.all(
          relevantKeyList.map(async (key) => {
            const storageComms = this.#chromeStorageCommsMap.get(key)
            const [newValue, oldValue] = await Promise.all([
              this.parseValue(changes[key].newValue),
              this.parseValue(changes[key].oldValue)
            ])

            storageComms?.callbackSet?.forEach((callback) =>
              callback({ newValue, oldValue }, areaName)
            )
          })
        )
      }

      this.#extStorageEngine.onChanged.addListener(chromeStorageListener)

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
          this.#extStorageEngine.onChanged.removeListener(storageComms.listener)
        }
      })
  }

  unwatchAll = () => this.#removeAllListener()

  #removeAllListener() {
    this.#chromeStorageCommsMap.forEach(({ listener }) =>
      this.#extStorageEngine.onChanged.removeListener(listener)
    )

    this.#chromeStorageCommsMap.clear()
  }

  /**
   * Get value from either local storage or chrome storage.
   */
  abstract get: <T = string>(key: string) => Promise<T>

  /**
   * Set the value. If it is a secret, it will only be set in extension storage.
   * Returns a warning if storage capacity is almost full.
   * Throws error if the new item will make storage full
   */
  abstract set: (key: string, rawValue: any) => Promise<string>

  /**
   * Parse the value into its original form from storage raw value.
   */
  protected abstract parseValue: (rawValue: any) => Promise<any>
}

export type StorageOptions = ConstructorParameters<typeof BaseStorage>[0]

/**
 * https://docs.plasmo.com/framework/storage
 */
export class Storage extends BaseStorage {
  get = async <T = string>(key: string) => {
    const rawValue = await this.rawGet(key)
    return this.parseValue(rawValue) as T
  }

  set = async (key: string, rawValue: any) => {
    const value = JSON.stringify(rawValue)
    return this.rawSet(key, value)
  }

  protected parseValue = async (rawValue: any) => {
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
