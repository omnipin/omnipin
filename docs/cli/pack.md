# `omnipin pack`

Pack websites files into a CAR without uploading it anywhere. Useful for externally verifying CIDs or uploading the CAR to a provider that Omnipin does not support yet.

```
omnipin pack site/.vitepress/dist --dist .
📦 Packing site/.vitepress/dist (4.15MB)
🟢 Root CID: bafybeialuzuiih2kg4g22crdt2oswzvj4ygirtk52v6kwb6v4muuuumnri
```

## Options

### `name`

Name of the distribution directory, excluding the file extension (it's always `.car`). By default the current directory name is used.

### `dist`

Custom directory to store the distribution file at before deployment. By default, OS temporary directory is used.

### `verbose`

More verbose logs.
