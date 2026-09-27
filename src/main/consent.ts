// Which apps are using the microphone or camera right now, read from the Windows privacy consent store.
// Windows writes LastUsedTimeStart when an app opens the device and LastUsedTimeStop (0 while still open)
// when it releases it. No audio or video is touched; this is only the "in use" bookkeeping Windows keeps.
import koffi from 'koffi'

const advapi32 = koffi.load('advapi32.dll')

const RegOpenKeyExW = advapi32.func(
  'int32_t __stdcall RegOpenKeyExW(uintptr_t hKey, const char16_t* lpSubKey, uint32_t ulOptions, uint32_t samDesired, _Out_ uintptr_t* phkResult)'
)
const RegEnumKeyExW = advapi32.func(
  'int32_t __stdcall RegEnumKeyExW(uintptr_t hKey, uint32_t dwIndex, _Out_ char16_t* lpName, _Inout_ uint32_t* lpcchName, void* lpReserved, void* lpClass, void* lpcchClass, void* lpftLastWriteTime)'
)
const RegQueryValueExW = advapi32.func(
  'int32_t __stdcall RegQueryValueExW(uintptr_t hKey, const char16_t* lpValueName, void* lpReserved, _Out_ uint32_t* lpType, _Out_ uint8_t* lpData, _Inout_ uint32_t* lpcbData)'
)
const RegCloseKey = advapi32.func('int32_t __stdcall RegCloseKey(uintptr_t hKey)')

const HKEY_CURRENT_USER = 0x80000001
const KEY_READ = 0x20019
const ERROR_SUCCESS = 0
const ERROR_NO_MORE_ITEMS = 259
const BASE = 'Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\'

const nameBuf = Buffer.alloc(2 * 512)
const dataBuf = Buffer.alloc(8)

function openKey(path: string): number | null {
  const out = [0]
  const rc = RegOpenKeyExW(HKEY_CURRENT_USER, path, 0, KEY_READ, out)
  return rc === ERROR_SUCCESS ? Number(out[0]) : null
}

function readQword(hkey: number, name: string): bigint | null {
  const type = [0]
  const len = [8]
  const rc = RegQueryValueExW(hkey, name, null, type, dataBuf, len)
  if (rc !== ERROR_SUCCESS || len[0] < 8) return null
  return dataBuf.readBigUInt64LE(0)
}

function subKeys(hkey: number): string[] {
  const names: string[] = []
  for (let i = 0; i < 512; i++) {
    const len = [512]
    const rc = RegEnumKeyExW(hkey, i, nameBuf, len, null, null, null, null)
    if (rc === ERROR_NO_MORE_ITEMS) break
    if (rc !== ERROR_SUCCESS) continue
    names.push(nameBuf.toString('utf16le', 0, len[0] * 2))
  }
  return names
}

/** Identifiers of apps currently holding the device: package family names, or exe paths for classic apps. */
function inUse(device: 'microphone' | 'webcam'): string[] {
  const found: string[] = []
  const root = openKey(BASE + device)
  if (root === null) return found
  try {
    const check = (parent: number, name: string, id: string): void => {
      const k = openKey(parent === root ? `${BASE}${device}\\${name}` : `${BASE}${device}\\NonPackaged\\${name}`)
      if (k === null) return
      try {
        const start = readQword(k, 'LastUsedTimeStart')
        const stop = readQword(k, 'LastUsedTimeStop')
        if (start !== null && start > 0n && stop === 0n) found.push(id)
      } finally {
        RegCloseKey(k)
      }
    }
    for (const name of subKeys(root)) {
      if (name === 'NonPackaged') {
        const np = openKey(`${BASE}${device}\\NonPackaged`)
        if (np === null) continue
        try {
          for (const exe of subKeys(np)) check(np, exe, exe.replace(/#/g, '\\').toLowerCase())
        } finally {
          RegCloseKey(np)
        }
      } else {
        check(root, name, name)
      }
    }
  } catch {
    /* registry layout changed; treat as nothing in use */
  } finally {
    RegCloseKey(root)
  }
  return found
}

let cache: { at: number; ids: string[] } = { at: 0, ids: [] }
const CACHE_MS = 5000

/** Apps using the microphone or camera, cached for a few seconds. */
export function devicesInUse(): string[] {
  const now = Date.now()
  if (now - cache.at < CACHE_MS) return cache.ids
  const ids = [...new Set([...inUse('microphone'), ...inUse('webcam')])]
  cache = { at: now, ids }
  return ids
}

/** True when the given app (by package family or exe path) holds the microphone or camera. */
export function appInCall(exePath: string, packageFamily: string | null): boolean {
  const ids = devicesInUse()
  if (!ids.length) return false
  if (packageFamily && ids.includes(packageFamily)) return true
  return ids.includes(exePath.toLowerCase())
}
