/**
 * This share storage between chrome storage and local storage.
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
}

export * from "./hook"
