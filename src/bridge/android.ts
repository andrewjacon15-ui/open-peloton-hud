import { parseShellMessage, type Bridge, type ShellMessage, type WebCommand } from './types'

/** The message the shell posts, with a MessagePort attached, once the page has loaded. */
export const PORT_HANDSHAKE = 'peloton-hud:port'

/**
 * The real bridge inside the Android shell. The shell posts a MessagePort to the page (a window "message" event with data
 * PORT_HANDSHAKE); everything after that goes over the port, in both directions. Commands sent before the port arrives are queued.
 */
export function androidBridge(target: Window = window): Bridge {
  const listeners = new Set<(m: ShellMessage) => void>()
  const queued: WebCommand[] = []
  let port: MessagePort | null = null

  target.addEventListener('message', (e: MessageEvent) => {
    if (e.data !== PORT_HANDSHAKE || !e.ports[0]) return
    port = e.ports[0]
    port.onmessage = (ev) => {
      const m = parseShellMessage(ev.data)
      if (m) listeners.forEach((l) => l(m))
    }
    for (const c of queued.splice(0)) port.postMessage(JSON.stringify(c))
  })

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    send(command) {
      if (port) port.postMessage(JSON.stringify(command))
      else queued.push(command)
    },
  }
}

/** The shell appends "PelotonHud/<version>" to the WebView's user agent. */
export const insideShell = (ua = navigator.userAgent) => /\bPelotonHud\/\S+/.test(ua)
