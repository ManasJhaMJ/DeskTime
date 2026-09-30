// File logger with size-based rotation, plus process-wide crash handlers.
// Log lines: ISO time, level, message. Never logs window titles or app usage, only app health.
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

type Level = 'info' | 'warn' | 'error'

const MAX_BYTES = 1_000_000
const KEEP = 3

let dir = ''
let file = ''
let ready = false

function rotateIfNeeded(): void {
  try {
    if (!existsSync(file) || statSync(file).size < MAX_BYTES) return
    const oldest = `${file}.${KEEP}`
    if (existsSync(oldest)) unlinkSync(oldest)
    for (let i = KEEP - 1; i >= 1; i--) {
      const from = `${file}.${i}`
      if (existsSync(from)) renameSync(from, `${file}.${i + 1}`)
    }
    renameSync(file, `${file}.1`)
  } catch {
    /* rotation is best effort */
  }
}

function write(level: Level, parts: unknown[]): void {
  const text = parts
    .map((p) => {
      if (p instanceof Error) return `${p.name}: ${p.message}\n${p.stack ?? ''}`
      if (typeof p === 'string') return p
      try {
        return JSON.stringify(p)
      } catch {
        return String(p)
      }
    })
    .join(' ')
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${text}\n`
  if (!ready) return
  try {
    rotateIfNeeded()
    appendFileSync(file, line, 'utf8')
  } catch {
    /* disk full or locked: drop the line */
  }
}

export const log = {
  info: (...p: unknown[]): void => write('info', p),
  warn: (...p: unknown[]): void => write('warn', p),
  error: (...p: unknown[]): void => write('error', p),
  dir: (): string => dir,
  file: (): string => file
}

/**
 * Sets up the log file under the user data folder, mirrors console output into it, and installs
 * crash handlers. Uncaught errors are logged and the app keeps running: the tracker tick already
 * guards itself, so one bad event should not kill the tray.
 */
export function initLogging(userData: string): void {
  dir = join(userData, 'logs')
  file = join(dir, 'screenwise.log')
  try {
    mkdirSync(dir, { recursive: true })
    ready = true
  } catch {
    ready = false
  }

  const orig = { log: console.log, warn: console.warn, error: console.error }
  console.log = (...a: unknown[]) => {
    orig.log(...a)
    write('info', a)
  }
  console.warn = (...a: unknown[]) => {
    orig.warn(...a)
    write('warn', a)
  }
  console.error = (...a: unknown[]) => {
    orig.error(...a)
    write('error', a)
  }

  process.on('uncaughtException', (err) => {
    write('error', ['uncaughtException', err])
  })
  process.on('unhandledRejection', (reason) => {
    write('error', ['unhandledRejection', reason instanceof Error ? reason : String(reason)])
  })
  app.on('child-process-gone', (_e, details) => {
    write('error', [`child process gone: type=${details.type} reason=${details.reason} exitCode=${details.exitCode}`])
  })
  app.on('render-process-gone', (_e, contents, details) => {
    write('error', [`renderer gone: reason=${details.reason} exitCode=${details.exitCode} url=${contents.getURL()}`])
  })
  app.on('will-quit', () => write('info', ['quit']))

  write('info', [
    `start ScreenWise ${app.getVersion()} electron=${process.versions.electron} node=${process.versions.node} ` +
      `os=${process.getSystemVersion()} arch=${process.arch} packaged=${app.isPackaged}`
  ])
}
