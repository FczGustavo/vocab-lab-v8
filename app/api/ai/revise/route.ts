import { NextResponse } from "next/server"
import { reviseFlashcardByTranslation, DEFAULT_AI_MODEL } from "@/lib/openai"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const model: string = body?.model ?? DEFAULT_AI_MODEL
    const input = body?.input

    if (!input?.word || !input?.partOfSpeech || !input?.translation) {
      return NextResponse.json({ error: "input.word, input.partOfSpeech and input.translation are required" }, { status: 400 })
    }

    const data = await reviseFlashcardByTranslation(input, model)
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao revisar flashcard"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
