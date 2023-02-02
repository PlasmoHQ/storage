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
  change: {
    /**
     * The old value of the item, if there was an old value.
     */
    oldValue?: any

    /**
     * The new value of the item, if there is a new value.
     */
    newValue?: any
  },
  area: StorageAreaName
) => void

export type StorageCallbackMap = Record<string, StorageWatchCallback>

export type StorageArea = browser.Storage.StorageArea &
  chrome.storage.StorageArea

export type InternalStorage = browser.Storage.Static

const hasWebApi = typeof window !== "undefined"

export abstract class BaseStorage {
  #extStorageEngine: InternalStorage
  #shouldCheckQuota = false

  #primaryClient: StorageArea
  get primaryClient() {
    return this.#primaryClient
  }

  #secondaryClient
  get secondaryClient() {
    return this.#secondaryClient
  }

  #area: StorageAreaName
  get area() {
    return this.#area
  }

  get hasWebAPI() {
    return hasWebApi
  }

  #watchMap = new Map<
    string,
    {
      callbackSet: Set<StorageWatchCallback>
      listener: StorageWatchEventListener
    }
  >()

  #copiedKeySet: Set<string>
  get copiedKeySet() {
    return this.#copiedKeySet
  }

  /**
   * the key is copied to the webClient
   */
  isCopied = (key: string) =>
    this.hasWebAPI && (this.allCopied || this.copiedKeySet.has(key))

  #allCopied = false
  get allCopied() {
    return this.#allCopied
  }

  #hasExtensionApi = false
  get hasExtensionApi() {
    return this.#hasExtensionApi
  }

  isWatchSupported = () => this.hasExtensionApi

  constructor({
    area = "sync" as StorageAreaName,
    unlimited = false,
    allCopied = false,
    copiedKeyList = [] as string[]
  } = {}) {
    this.setCopiedKeySet(copiedKeyList)
    this.#area = area
    this.#shouldCheckQuota = unlimited
    this.#allCopied = allCopied

    if (browser.storage) {
      this.#extStorageEngine = browser.storage
      this.#primaryClient = this.#extStorageEngine[this.area]
      this.#hasExtensionApi = true
    }

    if (hasWebApi) {
      this.#secondaryClient = window.localStorage
    }
  }

  setCopiedKeySet(keyList: string[]) {
    this.#copiedKeySet = new Set(keyList)
  }

  getAll = () => this.#primaryClient?.get()

  /**
   * Copy the key/value between extension storage and web storage.
   * @param key if undefined, copy all keys between storages.
   * @returns false if the value is unchanged or it is a secret key.
   */
  copy = async (key?: string) => {
    const syncAll = key === undefined
    if (
      (!syncAll && !this.copiedKeySet.has(key)) ||
      !this.allCopied ||
      !this.hasExtensionApi
    ) {
      return false
    }

    const dataMap = this.allCopied
      ? await this.getAll()
      : await this.#primaryClient.get(syncAll ? [...this.copiedKeySet] : [key])

    let changed = false

    for (const pKey in dataMap) {
      const value = dataMap[pKey] as string
      const previousValue = this.#secondaryClient?.getItem(pKey)
      this.#secondaryClient?.setItem(pKey, value)
      changed ||= value !== previousValue
    }

    return changed
  }

  protected rawGet = async (key: string): Promise<string> => {
    if (this.hasExtensionApi) {
      const dataMap = await this.#primaryClient.get(key)
      return dataMap[key]
    }

    // If chrome storage is not available, use localStorage
    // TODO: TRY asking for storage permission and retry?
    if (this.isCopied(key)) {
      return this.#secondaryClient?.getItem(key)
    }

    return null
  }

  protected rawSet = async (key: string, value: string) => {
    // If not a secret, we set it in localstorage as well
    if (this.isCopied(key)) {
      this.#secondaryClient?.setItem(key, value)
    }

    if (this.hasExtensionApi) {
      // when user has unlimitedStorage permission, skip used space check
      let warning = this.#shouldCheckQuota
        ? await getQuotaWarning(this, key, value)
        : ""

      await this.#primaryClient.set({ [key]: value })

      return warning
    }

    return null
  }

  /**
   * @param includeCopies Also cleanup copied data from secondary storage
   */
  clear = async (includeCopies = false) => {
    if (includeCopies) {
      this.#secondaryClient?.clear()
    }

    await this.#primaryClient.clear()
  }

  remove = async (key: string) => {
    if (this.isCopied(key)) {
      this.#secondaryClient?.removeItem(key)
    }

    if (this.hasExtensionApi) {
      await this.#primaryClient.remove(key)
    }
  }

  watch = (callbackMap: StorageCallbackMap) => {
    const canWatch = this.isWatchSupported()
    if (canWatch) {
      this.#addListener(callbackMap)
    }
    return canWatch
  }

  #addListener = (callbackMap: StorageCallbackMap) => {
    Object.entries(callbackMap).forEach(([key, callback]) => {
      const callbackSet = this.#watchMap.get(key)?.callbackSet || new Set()

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
            const storageComms = this.#watchMap.get(key)
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

      this.#watchMap.set(key, {
        callbackSet,
        listener: chromeStorageListener
      })
    })
  }

  unwatch = (callbackMap: StorageCallbackMap) => {
    const canWatch = this.isWatchSupported()
    if (canWatch) {
      this.#removeListener(callbackMap)
    }
    return canWatch
  }

  #removeListener(callbackMap: StorageCallbackMap) {
    Object.entries(callbackMap)
      .filter(([key]) => this.#watchMap.has(key))
      .forEach(([key, callback]) => {
        const storageComms = this.#watchMap.get(key)
        storageComms.callbackSet.delete(callback)

        if (storageComms.callbackSet.size === 0) {
          this.#watchMap.delete(key)
          this.#extStorageEngine.onChanged.removeListener(storageComms.listener)
        }
      })
  }

  unwatchAll = () => this.#removeAllListener()

  #removeAllListener() {
    this.#watchMap.forEach(({ listener }) =>
      this.#extStorageEngine.onChanged.removeListener(listener)
    )

    this.#watchMap.clear()
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
