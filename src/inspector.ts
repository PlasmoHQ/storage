import { Storage } from "./index"

export const table = async ({
  storage = new Storage(),
  printer = console.table
}) => {
  const data = await storage.getAll()
  printer(data)
}
