# Seeding & Data Storage

## Data Sizes

### First Launch (Seeding)

**Index chunks (downloaded once):**
- `de-en/index/`: **22 MB** (27 files)
- `en-de/index/`: **16 MB** (27 files)
- **Total: ~38 MB** downloaded during seeding

**IndexedDB storage (after seeding):**
- `wordIndex` store: **~40-45 MB** (compressed by IndexedDB)
- Stores: `word`, `pos`, `gender`, `hint` per entry
- ~680,000 entries total (both directions)

### After Seeding

**Data chunks (lazy-loaded on word detail view):**
- `de-en/data/`: **~50 MB** (27 files, fetched on-demand)
- `en-de/data/`: **~48 MB** (27 files, fetched on-demand)
- Only fetched when a word is opened for the first time
- Cached in `wordData` IndexedDB store after first view

**Total storage (after viewing many words):**
- `wordIndex`: ~40 MB (always present)
- `wordData`: grows as words are viewed (~200 bytes per word)
- `history`: ~100 bytes per search
- `bookmarks`: ~500 bytes per bookmark

## Checkpoint/Resume

### How It Works

1. **Checkpoint storage**: Each successfully seeded chunk is recorded in IndexedDB (`seedCheckpoint` store)
2. **Resume on refresh**: On page reload, seeding checks which chunks are already done and skips them
3. **Progress persistence**: Progress bar shows correct position even after refresh
4. **Completion**: Only marks as complete when all 54 chunks (27 letters × 2 directions) are done

### Behavior

- **First launch**: Downloads all 54 chunks (~38 MB)
- **Refresh during seeding**: Resumes from last checkpoint, only downloads remaining chunks
- **Network interruption**: Failed chunks are retried on next attempt
- **After completion**: Checkpoint is cleared, `urwort:seeded` flag is set

### Testing Resume

```javascript
// Check checkpoint status
DB.debug.inspect().then(s => {
  console.log('Checkpoint entries:', s.seedCheckpoint?.count || 0)
})

// Force re-seed (clear checkpoint)
indexedDB.deleteDatabase('urwort')
localStorage.removeItem('urwort:seeded')
location.reload()
```

## Performance

### Seeding Time (Estimated)

- **Desktop (fast WiFi)**: ~5-10 seconds
- **Mobile (4G)**: ~15-30 seconds
- **Mobile (slow WiFi)**: ~30-60 seconds

### Search Performance (After Seeding)

- **First keystroke**: < 10ms (IDB prefix query)
- **Subsequent keystrokes**: < 5ms (cached query results)
- **Word detail (cached)**: < 2ms (IDB lookup)
- **Word detail (uncached)**: ~50-200ms (fetch + parse chunk)

## Optimization Ideas (Future)

1. **Compression**: Gzip index chunks (browser auto-decompresses) → ~50% size reduction
2. **Progressive seeding**: Seed most common letters first (a, s, d, e, etc.)
3. **Background seeding**: Continue seeding in background after showing first results
4. **Incremental updates**: Only re-seed changed chunks on app update
