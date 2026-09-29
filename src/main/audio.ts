// Which processes are producing sound right now, read from the Windows Core Audio session list (the same
// data the volume mixer shows). No audio is captured; each active render session is asked for its process
// id and its current peak level. COM interfaces are called through their vtables with koffi.
import koffi from 'koffi'
import { log } from './logger'

const ole32 = koffi.load('ole32.dll')
const GUID = koffi.struct('GUID', { Data1: 'uint32_t', Data2: 'uint16_t', Data3: 'uint16_t', Data4: koffi.array('uint8_t', 8) })
const CoInitializeEx = ole32.func('int32_t __stdcall CoInitializeEx(void* pvReserved, uint32_t dwCoInit)')
const CoCreateInstance = ole32.func(
  'int32_t __stdcall CoCreateInstance(const GUID* rclsid, void* pUnkOuter, uint32_t dwClsContext, const GUID* riid, _Out_ void** ppv)'
)

function guid(s: string): Record<string, unknown> {
  const [a, b, c, d, e] = s.split('-')
  const tail = d + e
  return {
    Data1: parseInt(a, 16),
    Data2: parseInt(b, 16),
    Data3: parseInt(c, 16),
    Data4: [...Array(8)].map((_, i) => parseInt(tail.slice(i * 2, i * 2 + 2), 16))
  }
}
const CLSID_MMDeviceEnumerator = guid('BCDE0395-E52F-467C-8E3D-C4579291692E')
const IID_IMMDeviceEnumerator = guid('A95664D2-9614-4F35-A746-DE8DB63617E6')
const IID_IAudioSessionManager2 = guid('77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F')
const IID_IAudioSessionControl2 = guid('BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D')
const IID_IAudioMeterInformation = guid('C02216F6-8C67-4B5B-9D00-D008E73E0064')

const CLSCTX_ALL = 23
const COINIT_APARTMENTTHREADED = 0x2
const eRender = 0
const DEVICE_STATE_ACTIVE = 1
const AudioSessionStateActive = 1
/** Peak below this is silence (a paused or muted stream keeps its session active for a while). */
const PEAK_FLOOR = 0.001

// Method prototypes, `self` first. The number is the method's slot in its interface vtable.
const P = {
  QueryInterface: koffi.proto('int32_t __stdcall QueryInterface(void* self, const GUID* iid, _Out_ void** out)'),
  Release: koffi.proto('uint32_t __stdcall Release(void* self)'),
  EnumAudioEndpoints: koffi.proto('int32_t __stdcall EnumAudioEndpoints(void* self, int32_t flow, uint32_t stateMask, _Out_ void** out)'),
  GetCount: koffi.proto('int32_t __stdcall GetCount(void* self, _Out_ int32_t* count)'),
  Item: koffi.proto('int32_t __stdcall Item(void* self, int32_t index, _Out_ void** out)'),
  Activate: koffi.proto('int32_t __stdcall Activate(void* self, const GUID* iid, uint32_t clsCtx, void* params, _Out_ void** out)'),
  GetSessionEnumerator: koffi.proto('int32_t __stdcall GetSessionEnumerator(void* self, _Out_ void** out)'),
  GetState: koffi.proto('int32_t __stdcall GetState(void* self, _Out_ int32_t* state)'),
  GetProcessId: koffi.proto('int32_t __stdcall GetProcessId(void* self, _Out_ uint32_t* pid)'),
  IsSystemSoundsSession: koffi.proto('int32_t __stdcall IsSystemSoundsSession(void* self)'),
  GetPeakValue: koffi.proto('int32_t __stdcall GetPeakValue(void* self, _Out_ float* peak)')
}
const SLOT = {
  QueryInterface: 0,
  Release: 2,
  // IMMDeviceEnumerator
  EnumAudioEndpoints: 3,
  // IMMDeviceCollection and IAudioSessionEnumerator share the GetCount / Item(GetSession) layout
  GetCount: 3,
  Item: 4,
  // IMMDevice
  Activate: 3,
  // IAudioSessionManager2
  GetSessionEnumerator: 5,
  // IAudioSessionControl
  GetState: 3,
  // IAudioSessionControl2
  GetProcessId: 14,
  IsSystemSoundsSession: 15,
  // IAudioMeterInformation
  GetPeakValue: 3
} as const

type Com = unknown
type Proto = ReturnType<typeof koffi.proto>

function call<T extends unknown[]>(obj: Com, slot: number, proto: Proto, ...args: T): number {
  const vtable = koffi.decode(obj, 'void*')
  const fns = koffi.decode(vtable, 'void*', slot + 1) as unknown[]
  return koffi.call(fns[slot], proto, obj, ...args) as number
}
function release(obj: Com | null): void {
  if (obj) call(obj, SLOT.Release, P.Release)
}
function query(obj: Com, iid: Record<string, unknown>): Com | null {
  const out: Com[] = [null]
  return call(obj, SLOT.QueryInterface, P.QueryInterface, iid, out) === 0 ? out[0] : null
}

export interface AudioSource {
  pid: number
  /** 0..1 current output level. */
  peak: number
}

let enumerator: Com | null = null
let failures = 0

function getEnumerator(): Com | null {
  if (enumerator) return enumerator
  // Electron's main thread already runs a COM apartment; S_FALSE or RPC_E_CHANGED_MODE here are both fine.
  CoInitializeEx(null, COINIT_APARTMENTTHREADED)
  const out: Com[] = [null]
  const rc = CoCreateInstance(CLSID_MMDeviceEnumerator, null, CLSCTX_ALL, IID_IMMDeviceEnumerator, out)
  if (rc !== 0 || !out[0]) return null
  enumerator = out[0]
  return enumerator
}

/**
 * Processes with an audible render stream on any active output device. Excludes the system-sounds
 * session and this process. Returns an empty list when Core Audio is unavailable.
 */
export function audioSources(): AudioSource[] {
  const found = new Map<number, number>()
  const en = getEnumerator()
  if (!en) return []
  let coll: Com | null = null
  try {
    const out: Com[] = [null]
    if (call(en, SLOT.EnumAudioEndpoints, P.EnumAudioEndpoints, eRender, DEVICE_STATE_ACTIVE, out) !== 0) throw new Error('EnumAudioEndpoints')
    coll = out[0]
    const n = [0]
    call(coll, SLOT.GetCount, P.GetCount, n)
    for (let i = 0; i < n[0]; i++) {
      const dev: Com[] = [null]
      if (call(coll, SLOT.Item, P.Item, i, dev) !== 0 || !dev[0]) continue
      let mgr: Com | null = null
      let sessions: Com | null = null
      try {
        const m: Com[] = [null]
        if (call(dev[0], SLOT.Activate, P.Activate, IID_IAudioSessionManager2, CLSCTX_ALL, null, m) !== 0) continue
        mgr = m[0]
        const se: Com[] = [null]
        if (call(mgr, SLOT.GetSessionEnumerator, P.GetSessionEnumerator, se) !== 0) continue
        sessions = se[0]
        const count = [0]
        call(sessions, SLOT.GetCount, P.GetCount, count)
        for (let j = 0; j < count[0]; j++) {
          const c: Com[] = [null]
          if (call(sessions, SLOT.Item, P.Item, j, c) !== 0 || !c[0]) continue
          const ctl = c[0]
          let ctl2: Com | null = null
          let meter: Com | null = null
          try {
            const state = [0]
            call(ctl, SLOT.GetState, P.GetState, state)
            if (state[0] !== AudioSessionStateActive) continue
            ctl2 = query(ctl, IID_IAudioSessionControl2)
            if (!ctl2) continue
            if (call(ctl2, SLOT.IsSystemSoundsSession, P.IsSystemSoundsSession) === 0) continue
            const pid = [0]
            call(ctl2, SLOT.GetProcessId, P.GetProcessId, pid)
            if (!pid[0] || pid[0] === process.pid) continue
            meter = query(ctl, IID_IAudioMeterInformation)
            const peak = [0]
            if (meter) call(meter, SLOT.GetPeakValue, P.GetPeakValue, peak)
            if (peak[0] < PEAK_FLOOR) continue
            found.set(pid[0], Math.max(found.get(pid[0]) ?? 0, peak[0]))
          } finally {
            release(meter)
            release(ctl2)
            release(ctl)
          }
        }
      } finally {
        release(sessions)
        release(mgr)
        release(dev[0])
      }
    }
    failures = 0
  } catch (err) {
    // Device list changed under us or COM is unhappy: drop the cached enumerator and try fresh next time.
    release(enumerator)
    enumerator = null
    if (++failures <= 3) log.warn('[audio] session scan failed:', err instanceof Error ? err.message : String(err))
  } finally {
    release(coll)
  }
  return [...found.entries()].map(([pid, peak]) => ({ pid, peak }))
}
