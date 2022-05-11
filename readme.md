# @plasmohq/storage

`@plasmohq/storage` is an utility library from [plasmo](https://www.plasmo.com/) that abstract away the persistent storage API available to browser extension. It fallbacks to localstorage in context where the extension storage API is not available, allowing for state sync between popup - options - contents - background.

## Example

### Storage API (for content scripts or background workers)

```ts
import { Storage } from "@plasmohq/storage"

const storage = new Storage()

storage.set("key", "value")
```

### Hook API (for react components - i.e popup and option pages):

```tsx
import { useStorage } from '@plasmohq/storage/hook';

// ...

const hailingFrequency = useStorage("hailing")

return <>{hailingFrequency.value}</>

```

## Usage in the wild

- [mice](https://github.com/PlasmoHQ/mice)
- [world-edit](https://github.com/PlasmoHQ/world-edit)

## Why?

> To boldly go where no one has gone before

## License

[MIT](./license) 🖖 [Plasmo Corp.](https://plasmo.com)
