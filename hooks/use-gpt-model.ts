"use client"

import { useCallback, useEffect, useState } from "react"

const MODEL_KEY = "vocablab_ai_model"
const MODEL_ENV_BASELINE_KEY = "vocablab_ai_model_env_baseline"

const ENV_DEFAULT_MODEL =
  process.env.NEXT_PUBLIC_DEFAULT_AI_MODEL ?? "openai/gpt-5.4-nano"

const BUILTIN_MODELS = [
  { id: "openai/gpt-5.4-nano", label: "GPT-5.4 Nano (OpenAI)" },
  { id: "x-ai/grok-4.1-fast", label: "Grok 4.1 Fast (xAI)" },
  { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash" },
] as const

export const AVAILABLE_MODELS =
  BUILTIN_MODELS.some((model) => model.id === ENV_DEFAULT_MODEL)
    ? BUILTIN_MODELS
    : ([
        { id: ENV_DEFAULT_MODEL, label: `Modelo padrao (.env): ${ENV_DEFAULT_MODEL}` },
        ...BUILTIN_MODELS,
      ] as const)

export type GptModel = string

const DEFAULT_MODEL: GptModel = ENV_DEFAULT_MODEL

export function useGptModel() {
  const [model, setModelState] = useState<GptModel>(DEFAULT_MODEL)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const envBaseline = localStorage.getItem(MODEL_ENV_BASELINE_KEY)
    const saved = localStorage.getItem(MODEL_KEY)

    // If the saved value was just the previous env default, keep it synced with the new env default.
    if (saved && envBaseline && saved === envBaseline && envBaseline !== DEFAULT_MODEL) {
      setModelState(DEFAULT_MODEL)
      localStorage.setItem(MODEL_KEY, DEFAULT_MODEL)
    } else if (saved) {
      setModelState(saved)
    }

    localStorage.setItem(MODEL_ENV_BASELINE_KEY, DEFAULT_MODEL)
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
