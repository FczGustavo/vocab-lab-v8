"use client"

import { useCallback, useEffect, useState } from "react"

const MODEL_KEY = "vocablab_ai_model"

export const AVAILABLE_MODELS = [
  { id: "openai/gpt-5.4-nano", label: "GPT-5.4 Nano (OpenAI)" },
  { id: "x-ai/grok-4.1-fast", label: "Grok 4.1 Fast (xAI)" },
  { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash" },
] as const

export type GptModel = string

const DEFAULT_MODEL: GptModel =
  process.env.NEXT_PUBLIC_DEFAULT_AI_MODEL ?? "openai/gpt-5.4-nano"

export function useGptModel() {
  const [model, setModelState] = useState<GptModel>(DEFAULT_MODEL)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(MODEL_KEY)
    if (saved) setModelState(saved)
    setIsLoaded(true)
  }, [])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === MODEL_KEY && e.newValue) {
        setModelState(e.newValue)
      }
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const setModel = useCallback((newModel: GptModel) => {
    setModelState(newModel)
    localStorage.setItem(MODEL_KEY, newModel)
    // Notify other hook instances in the same tab via a synthetic storage event
    window.dispatchEvent(new StorageEvent("storage", { key: MODEL_KEY, newValue: newModel }))
  }, [])

  return { model, setModel, isLoaded }
}
