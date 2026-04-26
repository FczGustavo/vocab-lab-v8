"use client"

import { useCallback, useEffect, useState } from "react"

const SYNONYMS_LEVEL_KEY = "vocablab_synonyms_level"
const INCLUDE_CONJUGATIONS_KEY = "vocablab_include_conjugations"
const INCLUDE_ALTERNATIVE_FORMS_KEY = "vocablab_include_alternative_forms"
const INCLUDE_USAGE_NOTE_KEY = "vocablab_include_usage_note"
const EFOMM_MODE_KEY = "vocablab_efomm_mode"
const INCLUDE_MULTIPLE_TRANSLATIONS_KEY = "vocablab_include_multiple_translations"
const CONTEXT_DETAIL_MODE_KEY = "vocablab_context_detail_mode"

export type SynonymsLevel = 0 | 1 | 2 | 3
export type ContextDetailMode = "smart" | "always"

function clampSynonymsLevel(value: number): SynonymsLevel {
  if (value <= 0) return 0
  if (value === 1) return 1
  if (value === 2) return 2
  return 3
}

export function useAiPreferences() {
  const [synonymsLevel, setSynonymsLevelState] = useState<SynonymsLevel>(0)
  const [includeConjugations, setIncludeConjugationsState] = useState(false)
  const [includeAlternativeForms, setIncludeAlternativeFormsState] = useState(true)
  const [includeUsageNote, setIncludeUsageNoteState] = useState(true)
  const [contextDetailMode, setContextDetailModeState] = useState<ContextDetailMode>("smart")
  const [efommMode, setEfommModeState] = useState(true)
  const [includeMultipleTranslations, setIncludeMultipleTranslationsState] = useState(true)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const savedSynonyms = localStorage.getItem(SYNONYMS_LEVEL_KEY)
    if (savedSynonyms !== null) {
      const parsed = Number(savedSynonyms)
      if (!Number.isNaN(parsed)) {
        setSynonymsLevelState(clampSynonymsLevel(parsed))
      }
    }

    const savedConjugations = localStorage.getItem(INCLUDE_CONJUGATIONS_KEY)
    if (savedConjugations !== null) {
      setIncludeConjugationsState(savedConjugations === "true")
    }

    const savedAlternativeForms = localStorage.getItem(INCLUDE_ALTERNATIVE_FORMS_KEY)
    if (savedAlternativeForms !== null) {
      setIncludeAlternativeFormsState(savedAlternativeForms === "true")
    }

    const savedUsageNote = localStorage.getItem(INCLUDE_USAGE_NOTE_KEY)
    if (savedUsageNote !== null) {
      setIncludeUsageNoteState(savedUsageNote === "true")
    }

    const savedContextDetailMode = localStorage.getItem(CONTEXT_DETAIL_MODE_KEY)
    if (savedContextDetailMode === "smart" || savedContextDetailMode === "always") {
      setContextDetailModeState(savedContextDetailMode)
    }

    const savedEfomm = localStorage.getItem(EFOMM_MODE_KEY)
    if (savedEfomm !== null) {
      setEfommModeState(savedEfomm === "true")
    }

    const savedMultipleTranslations = localStorage.getItem(INCLUDE_MULTIPLE_TRANSLATIONS_KEY)
    if (savedMultipleTranslations !== null) {
      setIncludeMultipleTranslationsState(savedMultipleTranslations === "true")
    }

    setIsLoaded(true)
  }, [])

  const setSynonymsLevel = useCallback((level: number) => {
    const clamped = clampSynonymsLevel(level)
    setSynonymsLevelState(clamped)
    localStorage.setItem(SYNONYMS_LEVEL_KEY, String(clamped))
  }, [])

  const setIncludeConjugations = useCallback((value: boolean) => {
    setIncludeConjugationsState(value)
    localStorage.setItem(INCLUDE_CONJUGATIONS_KEY, String(value))
  }, [])

  const setIncludeAlternativeForms = useCallback((value: boolean) => {
    setIncludeAlternativeFormsState(value)
    localStorage.setItem(INCLUDE_ALTERNATIVE_FORMS_KEY, String(value))
  }, [])

  const setIncludeUsageNote = useCallback((value: boolean) => {
    setIncludeUsageNoteState(value)
    localStorage.setItem(INCLUDE_USAGE_NOTE_KEY, String(value))
  }, [])

  const setContextDetailMode = useCallback((value: ContextDetailMode) => {
    setContextDetailModeState(value)
    localStorage.setItem(CONTEXT_DETAIL_MODE_KEY, value)
  }, [])

  const setEfommMode = useCallback((value: boolean) => {
    setEfommModeState(value)
    localStorage.setItem(EFOMM_MODE_KEY, String(value))
  }, [])

  const setIncludeMultipleTranslations = useCallback((value: boolean) => {
    setIncludeMultipleTranslationsState(value)
    localStorage.setItem(INCLUDE_MULTIPLE_TRANSLATIONS_KEY, String(value))
  }, [])

  return {
    synonymsLevel,
    setSynonymsLevel,
    includeConjugations,
    setIncludeConjugations,
    includeAlternativeForms,
    setIncludeAlternativeForms,
    includeUsageNote,
    setIncludeUsageNote,
    contextDetailMode,
    setContextDetailMode,
    efommMode,
    setEfommMode,
    includeMultipleTranslations,
    setIncludeMultipleTranslations,
    isLoaded,
  }
}
