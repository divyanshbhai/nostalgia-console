// IndexedDB Storage for ROMs and Save States
// No server required - everything stored in browser

const DB_NAME = 'nostalgia-console'
const DB_VERSION = 1

// Store names
const STORES = {
  ROMS: 'roms',
  SAVE_STATES: 'saveStates',
  SETTINGS: 'settings'
}

// Types
export interface StoredROM {
  id: string
  name: string
  consoleType: string
  data: Uint8Array // Stored as ArrayBuffer
  size: number
  uploadedAt: number
  lastPlayedAt?: number
  playCount: number
  screenshot?: string // Base64 screenshot
}

export interface SaveState {
  id: string
  romId: string
  slot: number
  data: string // Base64 encoded state
  screenshot?: string
  timestamp: number
}

export interface AppSettings {
  key: string
  value: any
}

// Open database
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      
      // ROMs store
      if (!db.objectStoreNames.contains(STORES.ROMS)) {
        const romStore = db.createObjectStore(STORES.ROMS, { keyPath: 'id' })
        romStore.createIndex('name', 'name', { unique: false })
        romStore.createIndex('consoleType', 'consoleType', { unique: false })
        romStore.createIndex('lastPlayedAt', 'lastPlayedAt', { unique: false })
      }
      
      // Save states store
      if (!db.objectStoreNames.contains(STORES.SAVE_STATES)) {
        const saveStore = db.createObjectStore(STORES.SAVE_STATES, { keyPath: 'id' })
        saveStore.createIndex('romId', 'romId', { unique: false })
        saveStore.createIndex('slot', 'slot', { unique: false })
      }
      
      // Settings store
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' })
      }
    }
  })
}

// ROM Operations
export async function saveROM(rom: Omit<StoredROM, 'id' | 'uploadedAt' | 'playCount'>): Promise<string> {
  const db = await openDB()
  const id = `rom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  const storedRom: StoredROM = {
    ...rom,
    id,
    uploadedAt: Date.now(),
    playCount: 0
  }
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.ROMS, 'readwrite')
    const store = transaction.objectStore(STORES.ROMS)
    const request = store.add(storedRom)
    
    request.onsuccess = () => resolve(id)
    request.onerror = () => reject(request.error)
  })
}

export async function getROM(id: string): Promise<StoredROM | null> {
  const db = await openDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.ROMS, 'readonly')
    const store = transaction.objectStore(STORES.ROMS)
    const request = store.get(id)
    
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
}

export async function getAllROMs(): Promise<StoredROM[]> {
  const db = await openDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.ROMS, 'readonly')
    const store = transaction.objectStore(STORES.ROMS)
    const request = store.getAll()
    
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
}

export async function updateROMLastPlayed(id: string): Promise<void> {
  const db = await openDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.ROMS, 'readwrite')
    const store = transaction.objectStore(STORES.ROMS)
    const getRequest = store.get(id)
    
    getRequest.onsuccess = () => {
      const rom = getRequest.result
      if (rom) {
        rom.lastPlayedAt = Date.now()
        rom.playCount = (rom.playCount || 0) + 1
        store.put(rom)
      }
      resolve()
    }
    getRequest.onerror = () => reject(getRequest.error)
  })
}

export async function updateROMScreenshot(id: string, screenshot: string): Promise<void> {
  const db = await openDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.ROMS, 'readwrite')
    const store = transaction.objectStore(STORES.ROMS)
    const getRequest = store.get(id)
    
    getRequest.onsuccess = () => {
      const rom = getRequest.result
      if (rom) {
        rom.screenshot = screenshot
        store.put(rom)
      }
      resolve()
    }
    getRequest.onerror = () => reject(getRequest.error)
  })
}

export async function deleteROM(id: string): Promise<void> {
  const db = await openDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.ROMS, 'readwrite')
    const store = transaction.objectStore(STORES.ROMS)
    const request = store.delete(id)
    
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

// Save State Operations
export async function saveGameState(state: Omit<SaveState, 'id' | 'timestamp'>): Promise<string> {
  const db = await openDB()
  const id = `save-${state.romId}-slot${state.slot}`
  
  const saveState: SaveState = {
    ...state,
    id,
    timestamp: Date.now()
  }
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.SAVE_STATES, 'readwrite')
    const store = transaction.objectStore(STORES.SAVE_STATES)
    const request = store.put(saveState) // Use put to overwrite existing slot
    
    request.onsuccess = () => resolve(id)
    request.onerror = () => reject(request.error)
  })
}

export async function loadGameState(romId: string, slot: number): Promise<SaveState | null> {
  const db = await openDB()
  const id = `save-${romId}-slot${slot}`
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.SAVE_STATES, 'readonly')
    const store = transaction.objectStore(STORES.SAVE_STATES)
    const request = store.get(id)
    
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
}

export async function getSaveStatesForROM(romId: string): Promise<SaveState[]> {
  const db = await openDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.SAVE_STATES, 'readonly')
    const store = transaction.objectStore(STORES.SAVE_STATES)
    const index = store.index('romId')
    const request = index.getAll(romId)
    
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
}

export async function deleteSaveState(romId: string, slot: number): Promise<void> {
  const db = await openDB()
  const id = `save-${romId}-slot${slot}`
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.SAVE_STATES, 'readwrite')
    const store = transaction.objectStore(STORES.SAVE_STATES)
    const request = store.delete(id)
    
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

// Settings Operations
export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const db = await openDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.SETTINGS, 'readonly')
    const store = transaction.objectStore(STORES.SETTINGS)
    const request = store.get(key)
    
    request.onsuccess = () => {
      const result = request.result as AppSettings | undefined
      resolve(result ? result.value : defaultValue)
    }
    request.onerror = () => reject(request.error)
  })
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const db = await openDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.SETTINGS, 'readwrite')
    const store = transaction.objectStore(STORES.SETTINGS)
    const request = store.put({ key, value })
    
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

// Utility: Check storage usage
export async function getStorageUsage(): Promise<{ used: number; quota: number }> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate()
    return {
      used: estimate.usage || 0,
      quota: estimate.quota || 0
    }
  }
  return { used: 0, quota: 0 }
}

// Utility: Clear all data
export async function clearAllData(): Promise<void> {
  const db = await openDB()
  
  const clearStore = (storeName: string) => new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    const request = store.clear()
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
  
  await Promise.all([
    clearStore(STORES.ROMS),
    clearStore(STORES.SAVE_STATES),
    clearStore(STORES.SETTINGS)
  ])
}
