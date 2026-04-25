"use client"

import { useEffect, useMemo, useState } from "react"
import {
  COLOR_PALETTE_CLASS_PREFIX,
  COLOR_PALETTES,
  COLOR_PALETTE_STORAGE_KEY,
  DEFAULT_COLOR_PALETTE,
  getColorPaletteClass,
  isColorPaletteId,
  type ColorPaletteId,
} from "@/lib/theme-palettes"

function applyPaletteClass(nextPalette: ColorPaletteId) {
  const root = document.documentElement
  const classesToRemove = Array.from(root.classList).filter((cssClass) =>
    cssClass.startsWith(COLOR_PALETTE_CLASS_PREFIX)
  )

  if (classesToRemove.length > 0) {
    root.classList.remove(...classesToRemove)
  }

  root.classList.add(getColorPaletteClass(nextPalette))
}

function readStoredPalette(): ColorPaletteId {
  if (typeof window === "undefined") return DEFAULT_COLOR_PALETTE
  const value = localStorage.getItem(COLOR_PALETTE_STORAGE_KEY)
  if (value && isColorPaletteId(value)) return value
  return DEFAULT_COLOR_PALETTE
}

export function useColorPalette() {
  const [palette, setPaletteState] = useState<ColorPaletteId>(DEFAULT_COLOR_PALETTE)

  useEffect(() => {
    const initial = readStoredPalette()
    setPaletteState(initial)
    applyPaletteClass(initial)
  }, [])

  const setPalette = (nextPalette: ColorPaletteId) => {
    setPaletteState(nextPalette)
    localStorage.setItem(COLOR_PALETTE_STORAGE_KEY, nextPalette)
    applyPaletteClass(nextPalette)
  }

  const activePalette = useMemo(
    () => COLOR_PALETTES.find((entry) => entry.id === palette) ?? COLOR_PALETTES[0],
    [palette]
  )

  return {
    palette,
    setPalette,
    palettes: COLOR_PALETTES,
    activePalette,
  }
}
