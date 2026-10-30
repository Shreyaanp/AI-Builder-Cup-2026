import { useEffect, useState } from 'react'

/** Keep bottom controls with the keyboard across layout- and visual-viewport browsers. */
export function useKeyboardViewport() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const root = document.documentElement
    const view = window.visualViewport
    let fullHeight = window.innerHeight
    let width = window.innerWidth
    let keyboardOpen = false
    const sync = () => {
      const height = view?.height ?? window.innerHeight
      const offset = view?.offsetTop ?? 0
      const focused = document.activeElement
      const editing =
        focused instanceof HTMLTextAreaElement ||
        (focused instanceof HTMLInputElement &&
          !['button', 'checkbox', 'radio', 'range', 'submit'].includes(focused.type)) ||
        (focused instanceof HTMLElement && focused.isContentEditable)
      if (width !== window.innerWidth || (!editing && !keyboardOpen)) {
        width = window.innerWidth
        fullHeight = window.innerHeight
      }
      // Focus/blur precede the keyboard animation. Only a viewport contraction moves the dock;
      // retain that position through blur until the keyboard has actually gone (OB-151).
      keyboardOpen =
        matchMedia('(pointer: coarse)').matches &&
        (view?.scale ?? 1) <= 1.01 &&
        (editing || keyboardOpen) &&
        fullHeight - height > (keyboardOpen ? 1 : 150)
      // Keep the pre-keyboard height through intermediate animation frames. Comparing each
      // frame with the previous one misses keyboards that open in small increments.
      fullHeight = Math.max(fullHeight, window.innerHeight)
      const covered = keyboardOpen ? Math.max(0, window.innerHeight - height - offset) : 0
      root.style.setProperty('--c-keyboard', `${covered}px`)
      root.toggleAttribute('data-typing', keyboardOpen)
      setOpen(keyboardOpen)
    }
    sync()
    window.addEventListener('resize', sync)
    view?.addEventListener('resize', sync)
    view?.addEventListener('scroll', sync)
    return () => {
      window.removeEventListener('resize', sync)
      view?.removeEventListener('resize', sync)
      view?.removeEventListener('scroll', sync)
      root.style.removeProperty('--c-keyboard')
      root.removeAttribute('data-typing')
    }
  }, [])
  return open
}
