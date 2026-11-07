import { useEffect, useState } from 'react'

/** The local day, re-read when the app returns to the front or a minute passes (left open overnight). */
export function useLocalDay(): string {
  const [day, setDay] = useState(() => new Date().toDateString())
  useEffect(() => {
    const read = () => setDay(new Date().toDateString())
    const timer = setInterval(read, 60_000)
    document.addEventListener('visibilitychange', read)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', read)
    }
  }, [])
  return day
}
