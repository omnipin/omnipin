# `omnipin pack`

Pack website files into a CAR (or a TAR with `--tar`, for Swarm) without uploading it anywhere. Useful for externally verifying CIDs or uploading the archive to a provider that Omnipin does not support yet.

```
omnipin pack site/.vitepress/dist --dist .
📦 Packing site/.vitepress/dist (4.15MB)
🟢 Root CID: bafybeialuzuiih2kg4g22crdt2oswzvj4ygirtk52v6kwb6v4muuuumnri
```

## Options

### `name`

Name of the distribution directory, excluding the file extension (`.car` by default, `.tar` with `--tar`). By default the current directory name is used.

### `dist`

Custom directory to store the distribution file at before deployment. By default, OS temporary directory is used.

### `only-hash`

Default: `false`

Only output CIDv1 to stdout without any additional logging. Useful for scripts.

```sh
omnipin pack --only-hash
# bafybeialuzuiih2kg4g22crdt2oswzvj4ygirtk52v6kwb6v4muuuumnri
```

### `tar`

Default: `false`

Pack as a TAR archive (the format used by Swarm) instead of a CAR.

```sh
omnipin pack --tar
```

### `verbose`

More verbose logs.
