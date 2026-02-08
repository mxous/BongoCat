import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { cursorPosition } from '@tauri-apps/api/window'
import { watch } from 'vue'

import { INVOKE_KEY, LISTEN_KEY } from '../constants'

import { useModel } from './useModel'
import { useTauriListen } from './useTauriListen'

import { useCatStore } from '@/stores/cat'
import { useModelStore } from '@/stores/model'
import { inBetween } from '@/utils/is'
import { getCursorMonitor } from '@/utils/monitor'
import { isWindows } from '@/utils/platform'

interface MouseButtonEvent {
  kind: 'MousePress' | 'MouseRelease'
  value: string
}

export interface CursorPoint {
  x: number
  y: number
}

interface MouseMoveEvent {
  kind: 'MouseMove'
  value: CursorPoint
}

interface KeyboardEvent {
  kind: 'KeyboardPress' | 'KeyboardRelease'
  value: string
}

type DeviceEvent = MouseButtonEvent | MouseMoveEvent | KeyboardEvent

const X_MAX = 4000
const Y_MAX = 2000

export function useDevice() {
  const modelStore = useModelStore()
  const releaseTimers = new Map<string, NodeJS.Timeout>()
  const catStore = useCatStore()
  const { handlePress, handleRelease, handleMouseChange, handleMouseMove } = useModel()

  const mousePosition = { x: 0, y: 0 }
  let pendingMouseMove = false
  let absolutePollInterval: ReturnType<typeof setInterval> | null = null

  const startListening = async () => {
    invoke(INVOKE_KEY.START_DEVICE_LISTENING)

    if (catStore.window.mouseMode === 'absolute') {
      startAbsolutePolling()
    } else {
      await invoke(INVOKE_KEY.START_RAW_INPUT)
    }
  }

  watch(() => catStore.window.mouseMode, async (mode) => {
    if (mode === 'absolute') {
      await invoke(INVOKE_KEY.STOP_RAW_INPUT)
      startAbsolutePolling()
    } else {
      stopAbsolutePolling()
      await invoke(INVOKE_KEY.START_RAW_INPUT)
    }
  })

  function startAbsolutePolling() {
    // Stop any existing polling before starting a new one
    stopAbsolutePolling()

    absolutePollInterval = setInterval(async () => {
      const physicalPos = await cursorPosition()
      const monitor = await getCursorMonitor(physicalPos)

      if (!monitor) return

      const { size, position } = monitor

      const cursorPoint = {
        x: ((physicalPos.x - position.x) / size.width) * X_MAX,
        y: ((physicalPos.y - position.y) / size.height) * Y_MAX,
      }
      updateMousePosition(cursorPoint)
    }, 16)
  }

  function stopAbsolutePolling() {
    if (absolutePollInterval !== null) {
      clearInterval(absolutePollInterval)
      absolutePollInterval = null
    }
  }

  function updateMousePosition(cursorPoint: CursorPoint) {
    handleMouseMove(cursorPoint)

    if (catStore.window.hideOnHover) {
      const appWindow = getCurrentWebviewWindow()

      Promise.all([appWindow.outerPosition(), appWindow.innerSize()]).then(([position, { width, height }]) => {
        const isInWindow = inBetween(cursorPoint.x, position.x, position.x + width)
          && inBetween(cursorPoint.y, position.y, position.y + height)

        document.body.style.setProperty('opacity', isInWindow ? '0' : 'unset')

        if (!catStore.window.passThrough) {
          appWindow.setIgnoreCursorEvents(isInWindow)
        }
      })
    }
  }

  const getSupportedKey = (key: string) => {
    let nextKey = key

    const unsupportedKey = !modelStore.supportKeys[nextKey]

    if (key.startsWith('F') && unsupportedKey) {
      nextKey = key.replace(/F(\d+)/, 'Fn')
    }

    for (const item of ['Meta', 'Shift', 'Alt', 'Control']) {
      if (key.startsWith(item) && unsupportedKey) {
        const regex = new RegExp(`^(${item}).*`)
        nextKey = key.replace(regex, '$1')
      }
    }

    return nextKey
  }

  const accumulateMouseDelta = (delta: CursorPoint) => {
    const rumble = catStore.window.rumble

    mousePosition.x += delta.x
    mousePosition.y += delta.y

    if (mousePosition.x < 0) mousePosition.x += rumble
    if (mousePosition.x > X_MAX) mousePosition.x -= rumble
    if (mousePosition.y < 0) mousePosition.y += rumble
    if (mousePosition.y > Y_MAX) mousePosition.y -= rumble

    mousePosition.x = Math.max(0, Math.min(X_MAX, mousePosition.x))
    mousePosition.y = Math.max(0, Math.min(Y_MAX, mousePosition.y))
  }

  const scheduleMouseUpdate = () => {
    if (pendingMouseMove) return

    pendingMouseMove = true

    requestAnimationFrame(() => {
      pendingMouseMove = false
      updateMousePosition({ x: mousePosition.x, y: mousePosition.y })
    })
  }

  const handleRelativeMouseMove = (delta: CursorPoint) => {
    accumulateMouseDelta(delta)
    scheduleMouseUpdate()
  }

  const handleAutoRelease = (key: string, delay = 100) => {
    handlePress(key)

    if (releaseTimers.has(key)) {
      clearTimeout(releaseTimers.get(key))
    }

    const timer = setTimeout(() => {
      handleRelease(key)

      releaseTimers.delete(key)
    }, delay)

    releaseTimers.set(key, timer)
  }

  useTauriListen<DeviceEvent>(LISTEN_KEY.DEVICE_CHANGED, ({ payload }) => {
    const { kind, value } = payload

    if (kind === 'KeyboardPress' || kind === 'KeyboardRelease') {
      const nextValue = getSupportedKey(value)

      if (!nextValue) return

      if (nextValue === 'CapsLock') {
        return handleAutoRelease(nextValue)
      }

      if (kind === 'KeyboardPress') {
        if (isWindows) {
          const delay = catStore.model.autoReleaseDelay * 1000

          return handleAutoRelease(nextValue, delay)
        }

        return handlePress(nextValue)
      }

      return handleRelease(nextValue)
    }

    switch (kind) {
      case 'MousePress':
        return handleMouseChange(value)
      case 'MouseRelease':
        return handleMouseChange(value, false)
      case 'MouseMove':
        if (catStore.window.mouseMode === 'absolute') return
        return handleRelativeMouseMove(value)
    }
  })

  return {
    startListening,
  }
}
