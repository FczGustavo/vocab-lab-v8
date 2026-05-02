"use client"

import { useCallback, useEffect, useState } from "react"

const STUDY_TIMER_ENABLED_KEY = "vocablab_study_timer_enabled"

export function useStudyTimer() {
  const [enabled, setEnabledState] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem(STUDY_TIMER_ENABLED_KEY)
    if (saved !== null) {
      setEnabledState(saved === "true")
    }
  }, [])

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value)
    localStorage.setItem(STUDY_TIMER_ENABLED_KEY, String(value))
  }, [])

  return { enabled, setEnabled }
}
