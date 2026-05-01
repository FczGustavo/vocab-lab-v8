"use client"

import { useState, useEffect } from "react"

export function useAnimations() {
  const [enabled, setEnabled] = useState<boolean>(false)

  useEffect(() => {
    const saved = localStorage.getItem("vocab-lab-animations")
    if (saved !== null) {
      setEnabled(saved === "true")
    }
  }, [])

  const setAnimationsEnabled = (value: boolean) => {
    setEnabled(value)
    localStorage.setItem("vocab-lab-animations", String(value))
  }

  return { enabled, setEnabled: setAnimationsEnabled }
}
