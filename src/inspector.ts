import { Storage } from "./index"

export const table = async ({
  storage = new Storage(),
  printer = console.table
}) => {
  const itemMap = await storage.getAll()
  printer(itemMap)
}

export const startChangeReporter = ({
  storage = new Storage(),
  printer = console.table
}) => {
  chrome.storage.onChanged.addListener((changes, area) => {
    console.log("Storage Changed:", changes)
    if (area === storage.area) {
      table({ storage, printer })
    }
  })
}
