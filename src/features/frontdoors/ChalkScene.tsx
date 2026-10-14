import { useState } from 'react'

/** Offline, dependency-free CSS 3D enhancement. The static artwork always paints first. */
export default function ChalkScene({ label }: { label: string }) {
  const [turn, setTurn] = useState(0)
  return (
    <button
      className="chalk-scene"
      aria-label={label}
      onClick={() => setTurn((value) => value + 1)}
    >
      <span
        className="chalk-object"
        style={{ transform: `rotateX(-8deg) rotateY(${turn % 2 ? 16 : -16}deg)` }}
      >
        <img src="/art/chalkboard.svg" alt="" width="600" height="600" />
      </span>
    </button>
  )
}
