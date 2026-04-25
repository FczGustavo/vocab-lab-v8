import { NextResponse } from "next/server"
import { generateGrammarQuestion, evaluateGrammarQuestion, GRAMMAR_AI_MODEL, REVISOR_AI_MODEL } from "@/lib/openai"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const topicLabel: string = body?.topicLabel ?? ""
    // Accept subtopics[] (new) or single subtopic (legacy fallback)
    const subtopics: string[] = Array.isArray(body?.subtopics)
      ? body.subtopics
      : body?.subtopic
      ? [body.subtopic]
      : []
    const questionType: "correct" | "incorrect" = body?.questionType ?? "correct"
    const model: string = body?.model ?? GRAMMAR_AI_MODEL
    const userWords: string[] | undefined = Array.isArray(body?.userWords) ? body.userWords : undefined

    if (!topicLabel) {
      return NextResponse.json({ error: "topicLabel is required" }, { status: 400 })
    }

    const tagLabel = subtopics.length > 0
      ? subtopics.map((s) => `${topicLabel} › ${s}`).join(" + ")
      : topicLabel

    // Step 1 — Generator
    console.log(`[Generator] model=${model} | type=${questionType} | topic="${tagLabel}"`)
    const generated = await generateGrammarQuestion(topicLabel, subtopics, questionType, model, userWords)

    // Step 2 — Evaluator/Revisor
    const revisorModel = process.env.REVISOR_AI_MODEL ?? REVISOR_AI_MODEL
    const reviewed = await evaluateGrammarQuestion(generated, questionType, tagLabel, revisorModel)

    return NextResponse.json(reviewed)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao gerar questão"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
