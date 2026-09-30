// Launch at startup for the Microsoft Store build. Packaged (MSIX) apps cannot write the Run key; instead the
// manifest declares a windows.startupTask (see resources/appx-extensions.xml) and the app asks Windows to enable or
// disable it through the WinRT StartupTask API. There is no WinRT binding in Node, so the few calls go through
// Windows PowerShell, which projects WinRT types natively. A child of a packaged process inherits its identity, so
// the task resolves to this package.
import { execFile } from 'child_process'
import { log } from './logger'

/** Must match TaskId in resources/appx-extensions.xml. */
export const STARTUP_TASK_ID = 'ScreenWiseStartup'

export type StartupTaskState = 'Enabled' | 'Disabled' | 'DisabledByUser' | 'DisabledByPolicy' | 'EnabledByPolicy'

const SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.ApplicationModel.StartupTask,Windows.ApplicationModel,ContentType=WindowsRuntime]
$null = [Windows.ApplicationModel.StartupTaskState,Windows.ApplicationModel,ContentType=WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
})[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(); $t.Result }
$task = Await ([Windows.ApplicationModel.StartupTask]::GetAsync('${STARTUP_TASK_ID}')) ([Windows.ApplicationModel.StartupTask])
switch ($env:SCREENWISE_STARTUP) {
  'enable'  { $state = Await ($task.RequestEnableAsync()) ([Windows.ApplicationModel.StartupTaskState]) }
  'disable' { $task.Disable(); $state = $task.State }
  default   { $state = $task.State }
}
"$state"
`

function run(mode: 'query' | 'enable' | 'disable'): Promise<StartupTaskState | null> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', SCRIPT],
      { timeout: 15_000, windowsHide: true, env: { ...process.env, SCREENWISE_STARTUP: mode } },
      (err, stdout, stderr) => {
        if (err) {
          log.warn('[startup-task]', mode, 'failed:', String(stderr || err.message).split('\n')[0].slice(0, 200))
          return resolve(null)
        }
        const s = String(stdout).trim()
        resolve(['Enabled', 'Disabled', 'DisabledByUser', 'DisabledByPolicy', 'EnabledByPolicy'].includes(s) ? (s as StartupTaskState) : null)
      }
    )
  })
}

export const startupTaskState = (): Promise<StartupTaskState | null> => run('query')

/**
 * Enables or disables the task. Windows refuses to re-enable a task the user turned off in Task Manager > Startup
 * (state stays DisabledByUser); the caller shows that so the user knows where to flip it back.
 */
export const setStartupTask = (enabled: boolean): Promise<StartupTaskState | null> => run(enabled ? 'enable' : 'disable')
