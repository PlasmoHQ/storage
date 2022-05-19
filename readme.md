<p align="center">
  <a href="https://plasmo.com">
    <img alt="plasmo logo" width="75%" src="https://www.plasmo.com/assets/banner-black-on-white.png" />
  </a>
</p>

<p align="center">
  <a aria-label="License" href="./LICENSE">
    <img alt="See License" src="https://img.shields.io/npm/l/plasmo"/>
  </a>
  <a aria-label="NPM" href="https://www.npmjs.com/package/@plasmohq/storage">
    <img alt="NPM Install" src="https://img.shields.io/npm/v/@plasmohq/storage?logo=npm"/>
  </a>
  <a aria-label="Twitter" href="https://www.twitter.com/plasmohq">
    <img alt="Follow PlasmoHQ on Twitter" src="https://img.shields.io/twitter/follow/plasmohq?logo=twitter"/>
  </a>
  <a aria-label="Twitch Stream" href="https://www.twitch.tv/plasmohq">
    <img alt="Watch our Live DEMO every Friday" src="https://img.shields.io/twitch/status/plasmohq?logo=twitch&logoColor=white"/>
  </a>
  <a aria-label="Discord" href="https://www.plasmo.com/s/d">
    <img alt="Join our Discord for support and chat about our projects" src="https://img.shields.io/discord/904466750429609984?logo=discord&logoColor=white"/>
  </a>
</p>

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
import { useStorage } from '@plasmohq/storage';

// ...

const [hailingFrequency, setHailingFrequency] = useStorage("hailing", 42)

return <>{hailingFrequency}</>
```

### Advanced Hook API usage

When dealing with form input or real-time input, you might need the following:

```tsx
const [hailingFrequency, , {
  setRenderValue,
  setStoreValue,
}] = useStorage("hailing")

return <>
  <input value={hailingFrequency} onChange={(e) => setRenderValue(e.target.value)}/>
  <button onClick={() => setStoreValue()}>
    Save
  </button>
</>

```

## Usage in the wild

- [MICE](https://github.com/PlasmoHQ/mice)
- [World Edit](https://github.com/PlasmoHQ/world-edit)

## Why?

> To boldly go where no one has gone before

## License

[MIT](./license) 🖖 [Plasmo Corp.](https://plasmo.com)
