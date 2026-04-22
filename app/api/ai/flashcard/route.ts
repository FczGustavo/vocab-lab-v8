import { NextResponse } from "next/server"
import { generateFlashcardData, DEFAULT_AI_MODEL } from "@/lib/openai"
import type { GenerateFlashcardOptions } from "@/lib/openai"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const word: string = body?.word ?? ""
    const model: string = body?.model ?? DEFAULT_AI_MODEL
    const options: GenerateFlashcardOptions = body?.options ?? {}

    if (!word.trim()) {
      return NextResponse.json({ error: "word is required" }, { status: 400 })
    }

    const data = await generateFlashcardData(word.trim(), model, options)
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao gerar flashcard"
    console.error("[api/ai/flashcard]", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
