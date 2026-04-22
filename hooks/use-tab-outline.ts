"use client"

import { useCallback, useEffect, useState } from "react"

const TAB_OUTLINE_KEY = "vocablab_tab_outline"

export function useTabOutline() {
  const [tabOutline, setTabOutlineState] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem(TAB_OUTLINE_KEY)
    if (saved !== null) setTabOutlineState(saved === "true")
  }, [])

  const setTabOutline = useCallback((value: boolean) => {
    setTabOutlineState(value)
    localStorage.setItem(TAB_OUTLINE_KEY, String(value))
  }, [])

  return { tabOutline, setTabOutline }
}
