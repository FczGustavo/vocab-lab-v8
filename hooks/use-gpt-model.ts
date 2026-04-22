"use client"

const MODEL = process.env.NEXT_PUBLIC_DEFAULT_AI_MODEL ?? "openai/gpt-5.4-nano"
export type GptModel = string

export function useGptModel() {
  return { model: MODEL, setModel: (_: GptModel) => {}, isLoaded: true }
}
