/**
 * Copyright (c) 2023 Plasmo Corp. <foss@plasmo.com> (https://www.plasmo.com) and contributors
 * Licensed under the MIT license.
 * This module share storage between chrome storage and local storage.
 */

import pify from "pify"

import { isChromeBelow100 } from "./utils"

export type StorageWatchEventListener = Parameters<
  typeof chrome.storage.onChanged.addListener
>[0]

export type StorageAreaName = Parameters<StorageWatchEventListener>[1]
export type StorageWatchCallback = (
  change: chrome.storage.StorageChange,
  area: StorageAreaName
) => void

export type StorageCallbackMap = Record<string, StorageWatchCallback>

export type StorageArea = chrome.storage.StorageArea

export type InternalStorage = typeof chrome.storage

export type SerdeOptions = {
  serializer: <T>(value: T) => string
  deserializer: <T>(rawValue: string) => T
}

export abstract class BaseStorage {
  #extStorageEngine: InternalStorage

  #primaryClient: StorageArea
  get primaryClient() {
    return this.#primaryClient
  }

  #secondaryClient: globalThis.Storage
  get secondaryClient() {
    return this.#secondaryClient
  }

  #area: StorageAreaName
  get area() {
    return this.#area
  }

  get hasWebApi() {
    try {
      return typeof window !== "undefined" && !!window.localStorage
    } catch (error) {
      console.error(error)
      return false
    }
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
    this.hasWebApi && (this.allCopied || this.copiedKeySet.has(key))

  #allCopied = false
  get allCopied() {
    return this.#allCopied
  }

  getExtStorageApi = () => {
    return globalThis.browser?.storage || globalThis.chrome?.storage
  }

  get hasExtensionApi() {
    try {
      return !!this.getExtStorageApi()
    } catch (error) {
      console.error(error)
      return false
    }
  }

  isWatchSupported = () => this.hasExtensionApi

  protected keyNamespace = ""
  isValidKey = (nsKey: string) => nsKey.startsWith(this.keyNamespace)
  getNamespacedKey = (key: string) => `${this.keyNamespace}${key}`
  getUnnamespacedKey = (nsKey: string) => nsKey.slice(this.keyNamespace.length)

  serde: SerdeOptions = {
    serializer: JSON.stringify,
    deserializer: JSON.parse
  }

  constructor({
    area = "sync" as StorageAreaName,
    allCopied = false,
    copiedKeyList = [] as string[],
    serde = {} as SerdeOptions
  } = {}) {
    this.setCopiedKeySet(copiedKeyList)
    this.#area = area
    this.#allCopied = allCopied
    this.serde = { ...this.serde, ...serde }

    try {
      if (this.hasWebApi && (allCopied || copiedKeyList.length > 0)) {
        this.#secondaryClient = window.localStorage
      }
    } catch {}

    try {
      if (this.hasExtensionApi) {
        this.#extStorageEngine = this.getExtStorageApi()

        if (isChromeBelow100()) {
          this.#primaryClient = pify(this.#extStorageEngine[this.area], {
            exclude: ["getBytesInUse"],
            errorFirst: false
          })
        } else {
          this.#primaryClient = this.#extStorageEngine[this.area]
        }
      }
    } catch {}
  }

  setCopiedKeySet(keyList: string[]) {
    this.#copiedKeySet = new Set(keyList)
  }

  rawGetAll = () => this.#primaryClient?.get()

  getAll = async () => {
    const allData = await this.rawGetAll()
    return Object.entries(allData)
      .filter(([key]) => this.isValidKey(key))
      .reduce(
        (acc, [key, value]) => {
          acc[this.getUnnamespacedKey(key)] = value as string
          return acc
        },
        {} as Record<string, string>
      )
  }

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
      ? await this.rawGetAll()
      : await this.#primaryClient.get(
          (syncAll ? [...this.copiedKeySet] : [key]).map(this.getNamespacedKey)
        )

    if (!dataMap) {
      return false
    }

    let changed = false

    for (const pKey in dataMap) {
      const value = dataMap[pKey] as string
      const previousValue = this.#secondaryClient?.getItem(pKey)
      this.#secondaryClient?.setItem(pKey, value)
      changed ||= value !== previousValue
    }

    return changed
  }

  protected rawGet = async (
    key: string
  ): Promise<string | null | undefined> => {
    const results = await this.rawGetMany([key])
    return results[key]
  }

  protected rawGetMany = async (
    keys: string[]
  ): Promise<Record<string, string | null | undefined>> => {
    if (this.hasExtensionApi) {
      return await this.#primaryClient.get(keys)
    }

    return keys.filter(this.isCopied).reduce((dataMap, copiedKey) => {
      dataMap[copiedKey] = this.#secondaryClient?.getItem(copiedKey)
      return dataMap
    }, {})
  }

  protected rawSet = async (key: string, value: string): Promise<null> => {
    return await this.rawSetMany({ [key]: value })
  }

  protected rawSetMany = async (items: Record<string, string>): Promise<null> => {
    if (this.#secondaryClient) {
      Object.entries(items)
        .filter(([key]) => this.isCopied(key))
        .forEach(([key, value]) => this.#secondaryClient.setItem(key, value))
    }

    if (this.hasExtensionApi) {
      await this.#primaryClient.set(items)
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

  protected rawRemove = async (key: string) => {
    await this.rawRemoveMany([key])
  }

  protected rawRemoveMany = async (keys: string[]) => {
    if (this.#secondaryClient) {
      keys.filter(this.isCopied).forEach((key) => this.#secondaryClient.removeItem(key))
    }

    if (this.hasExtensionApi) {
      await this.#primaryClient.remove(keys)
    }
  }

  removeAll = async () => {
    const allData = await this.getAll()
    const keyList = Object.keys(allData)
    await this.removeMany(keyList)
  }

  watch = (callbackMap: StorageCallbackMap) => {
    const canWatch = this.isWatchSupported()
    if (canWatch) {
      this.#addListener(callbackMap)
    }
    return canWatch
  }

  #addListener = (callbackMap: StorageCallbackMap) => {
    for (const cbKey in callbackMap) {
      const nsKey = this.getNamespacedKey(cbKey)
      const callbackSet = this.#watchMap.get(nsKey)?.callbackSet || new Set()
      callbackSet.add(callbackMap[cbKey])

      if (callbackSet.size > 1) {
        continue
      }

      const chromeStorageListener = (
        changes: {
          [key: string]: chrome.storage.StorageChange
        },
        areaName: StorageAreaName
      ) => {
        if (areaName !== this.area || !changes[nsKey]) {
          return
        }

        const storageComms = this.#watchMap.get(nsKey)
        if (!storageComms) {
          throw new Error(`Storage comms does not exist for nsKey: ${nsKey}`)
        }

        Promise.all([
          this.parseValue(changes[nsKey].newValue),
          this.parseValue(changes[nsKey].oldValue)
        ]).then(([newValue, oldValue]) => {
          for (const cb of storageComms.callbackSet) {
            cb({ newValue, oldValue }, areaName)
          }
        })
      }

      this.#extStorageEngine.onChanged.addListener(chromeStorageListener)

      this.#watchMap.set(nsKey, {
        callbackSet,
        listener: chromeStorageListener
      })
    }
  }

  unwatch = (callbackMap: StorageCallbackMap) => {
    const canWatch = this.isWatchSupported()
    if (canWatch) {
      this.#removeListener(callbackMap)
    }
    return canWatch
  }

  #removeListener(callbackMap: StorageCallbackMap) {
    for (const cbKey in callbackMap) {
      const nsKey = this.getNamespacedKey(cbKey)
      const callback = callbackMap[cbKey]
      const storageComms = this.#watchMap.get(nsKey)
      if (!storageComms) {
        continue
      }

      storageComms.callbackSet.delete(callback)
      if (storageComms.callbackSet.size === 0) {
        this.#watchMap.delete(nsKey)
        this.#extStorageEngine.onChanged.removeListener(storageComms.listener)
      }
    }
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
  abstract get: <T = string>(key: string) => Promise<T | undefined>
  abstract getMany: <T = any>(keys: string[]) => Promise<Record<string, T | undefined>>

  /**
   * Set the value. If it is a secret, it will only be set in extension storage.
   * Returns a warning if storage capacity is almost full.
   * Throws error if the new item will make storage full
   */
  abstract set: (key: string, rawValue: any) => Promise<null>
  abstract setMany: (items: Record<string, any>) => Promise<null>

  abstract remove: (key: string) => Promise<void>
  abstract removeMany: (keys: string[]) => Promise<void>

  /**
   * Parse the value into its original form from storage raw value.
   */
  protected abstract parseValue: <T>(rawValue: any) => Promise<T | undefined>

  /**
   * Alias for get
   */
  async getItem<T = string>(key: string) {
    return this.get<T>(key)
  }

  async getItems<T = string>(keys: string[]) {
    return await this.getMany<T>(keys)
  }

  /**
   * Alias for set, but returns void instead
   */
  async setItem(key: string, rawValue: any) {
    await this.set(key, rawValue)
  }

  async setItems(items: Record<string, any>) {
    await await this.setMany(items)
  }

  /**
   * Alias for remove
   */
  async removeItem(key: string) {
    return this.remove(key)
  }

  async removeItems(keys: string[]) {
    return await this.removeMany(keys)
  }
}

export type StorageOptions = ConstructorParameters<typeof BaseStorage>[0]

/**
 * https://docs.plasmo.com/framework/storage
 */
export class Storage extends BaseStorage {
  get = async <T = string>(key: string) => {
    const nsKey = this.getNamespacedKey(key)
    const rawValue = await this.rawGet(nsKey)
    return this.parseValue<T>(rawValue)
  }

  getMany = async <T = any>(keys: string[]) => {
    const nsKeys = keys.map(this.getNamespacedKey)
    const rawValues = await this.rawGetMany(nsKeys)
    const parsedValues = await Promise.all(
      Object.values(rawValues).map(this.parseValue<T>)
    )
    return Object.keys(rawValues).reduce((results, key, i) => {
      results[this.getUnnamespacedKey(key)] = parsedValues[i]
      return results
    }, {} as Record<string, T | undefined>)
  }

  set = async (key: string, rawValue: any) => {
    const nsKey = this.getNamespacedKey(key)
    const value = this.serde.serializer(rawValue)
    return this.rawSet(nsKey, value)
  }

  setMany = async (items: Record<string, any>) => {
    const nsItems = Object.entries(items).reduce((nsItems, [key, value]) => {
      nsItems[this.getNamespacedKey(key)] = this.serde.serializer(value)
      return nsItems
    }, {});
    return await this.rawSetMany(nsItems)
  }

  remove = async (key: string) => {
    const nsKey = this.getNamespacedKey(key)
    return this.rawRemove(nsKey)
  }

  removeMany = async (keys: string[]) => {
    const nsKeys = keys.map(this.getNamespacedKey)
    return await this.rawRemoveMany(nsKeys)
  }

  setNamespace = (namespace: string) => {
    this.keyNamespace = namespace
  }

  protected parseValue = async <T>(rawValue: any): Promise<T | undefined> => {
    try {
      if (rawValue !== undefined) {
        return this.serde.deserializer<T>(rawValue)
      }
    } catch (e) {
      // ignore error. TODO: debug log them maybe
      console.error(e)
    }
    return undefined
  }
}
