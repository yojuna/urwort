# Debugging urwort on Mobile PWA

## Quick Debug Commands (Desktop Browser)

Open DevTools Console and run:

```javascript
// Inspect all IndexedDB stores
DB.debug.inspect()

// Check a specific word
DB.debug.searchWord('Haus', 'de-en')

// Check if seeded
localStorage.getItem('urwort:seeded')  // Should be '1'

// Check wordIndex count
DB.wordIndexQuery('haus', 'de-en', 5).then(r => console.log(r))
```

## Debugging on Mobile (Chrome/Safari)

### Chrome (Android)

1. **Connect phone via USB** and enable USB debugging
2. Open Chrome on desktop → `chrome://inspect`
3. Find your device → click "Inspect" on the urwort tab
4. Console will show all logs and errors

### Safari (iOS)

1. **Enable Web Inspector** on iPhone:
   - Settings → Safari → Advanced → Web Inspector (ON)
2. **Connect iPhone via USB**
3. On Mac: Safari → Develop → [Your iPhone] → urwort
4. Console will show logs

### Remote Debugging (No USB)

**Chrome Remote Debugging:**
1. On phone: Chrome → Settings → More tools → Remote debugging
2. Note the IP address shown
3. On desktop: `chrome://inspect` → Configure → Add `[phone-ip]:9222`
4. Connect and inspect

## Common Issues

### "undefined" in search results

**Cause:** Field name mismatch — IDB stores `word`, UI expects `w`

**Check:**
```javascript
DB.wordIndexQuery('haus', 'de-en', 1).then(r => {
  console.log('Raw IDB row:', r[0])
  console.log('Has word field?', r[0]?.word)
  console.log('Has w field?', r[0]?.w)
})
```

**Fix:** Already fixed in `search.js` — results are normalized. If still broken, check console for errors.

### "undefined" in detail view

**Cause:** Entry not found in wordData, and lookup failed

**Check:**
```javascript
// Check if word exists in index
DB.wordIndexGet('Haus', 'de-en').then(console.log)

// Check if word exists in data
DB.wordDataGet('Haus', 'de-en').then(console.log)

// Try manual lookup
Search.lookup('Haus', 'de-en').then(console.log)
```

**Fix:** Check network tab — is `/data/de-en/data/h.json` loading? Check console for fetch errors.

### Seeding not working

**Check:**
```javascript
// Is seeded flag set?
localStorage.getItem('urwort:seeded')

// How many entries in wordIndex?
DB.debug.inspect().then(s => console.log('wordIndex count:', s.wordIndex.count))

// Should be ~680k entries (both directions)
```

**If count is 0:**
- Check Network tab — are `/data/*/index/*.json` requests succeeding?
- Check Console — any errors from `seed.worker.js`?
- Try clearing and re-seeding:
  ```javascript
  localStorage.removeItem('urwort:seeded')
  location.reload()
  ```

### Offline not working

**Check Service Worker:**
1. DevTools → Application → Service Workers
2. Should see `sw.js` registered and active
3. Check "Offline" checkbox to test offline mode

**Check Cache:**
1. DevTools → Application → Cache Storage
2. Should see `urwort-shell-v5` and `urwort-data-v3`
3. Check if data chunks are cached

**Check IndexedDB:**
1. DevTools → Application → IndexedDB → `urwort`
2. Should see 4 stores: `wordIndex`, `wordData`, `history`, `bookmarks`
3. `wordIndex` should have ~680k entries

## Performance Debugging

### Check search latency

```javascript
console.time('search')
DB.wordIndexQuery('haus', 'de-en', 20).then(r => {
  console.timeEnd('search')
  console.log('Results:', r.length)
})
```

Should be < 10ms on desktop, < 30ms on mobile.

### Check IDB size

```javascript
navigator.storage.estimate().then(e => {
  console.log('Total:', (e.usage / 1024 / 1024).toFixed(1), 'MB')
  console.log('Quota:', (e.quota / 1024 / 1024).toFixed(1), 'MB')
})
```

Expected: ~40-50 MB for wordIndex, plus wordData as words are viewed.

## Clearing Everything (Reset)

```javascript
// Clear all data
localStorage.clear()
indexedDB.deleteDatabase('urwort')
location.reload()
```

This will trigger re-seeding on next load.
