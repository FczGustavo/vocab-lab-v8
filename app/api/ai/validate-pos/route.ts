import { NextResponse } from "next/server"
import { validateWordPartOfSpeech, DEFAULT_AI_MODEL } from "@/lib/openai"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const word: string = body?.word ?? ""
    const partOfSpeech: string = body?.partOfSpeech ?? ""
    const model: string = body?.model ?? DEFAULT_AI_MODEL

    if (!word.trim() || !partOfSpeech.trim()) {
      return NextResponse.json({ error: "word and partOfSpeech are required" }, { status: 400 })
    }

    const result = await validateWordPartOfSpeech({
      word: word.trim(),
      partOfSpeech: partOfSpeech.trim(),
    }, model)

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao validar classe gramatical"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
