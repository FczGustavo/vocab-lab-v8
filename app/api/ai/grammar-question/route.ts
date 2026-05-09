import { NextResponse } from "next/server"
import { generateGrammarQuestion, evaluateGrammarQuestion, GRAMMAR_AI_MODEL, REVISOR_AI_MODEL } from "@/lib/openai"

function normalizeForSimilarity(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2)
}

function jaccardSimilarity(a: string, b: string): number {
  const sa = new Set(normalizeForSimilarity(a))
  const sb = new Set(normalizeForSimilarity(b))
  if (sa.size === 0 || sb.size === 0) return 0
  const intersection = [...sa].filter((t) => sb.has(t)).length
  const union = new Set([...sa, ...sb]).size
  return union === 0 ? 0 : intersection / union
}

function isTooSimilarToRecent(current: string | null | undefined, recent: string[]): boolean {
  if (!current || !recent.length) return false
  return recent.some((prev) => jaccardSimilarity(current, prev) >= 0.62)
}

function isWeakGrammarItem(input: {
  questionText?: string
  contextPassage?: string | null
  options?: Array<{ text?: string }>
}): boolean {
  const stem = (input.questionText ?? "").toLowerCase()
  const ctx = (input.contextPassage ?? "").toLowerCase()
  const optionText = (input.options ?? []).map((o) => (o.text ?? "").toLowerCase()).join(" | ")

  const weakSignals = [
    "order of adjectives",
    "adverb placement",
    "according to grammar rules",
    "following the standard order",
    "opinion > size",
    "size > age",
    "analyze the sentences",
  ]

  const genericStem = stem.length < 20 || stem === "choose the best option."
  const hasRuleDump = weakSignals.some((s) => stem.includes(s) || ctx.includes(s))
  const weakContext = Boolean(ctx) && ctx.length < 24
  const optionsTooSimilar = optionText.length > 0 && /(option 1|option 2|option 3|option 4|option 5)/i.test(optionText)

  return genericStem || hasRuleDump || weakContext || optionsTooSimilar
}

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
    const recentContexts: string[] = Array.isArray(body?.recentContexts)
      ? body.recentContexts.filter((v: unknown): v is string => typeof v === "string" && v.trim().length > 0).slice(-8)
      : []

    if (!topicLabel) {
      return NextResponse.json({ error: "topicLabel is required" }, { status: 400 })
    }

    const tagLabel = subtopics.length > 0
      ? subtopics.map((s) => `${topicLabel} › ${s}`).join(" + ")
      : topicLabel

    // Step 1 — Generator
    console.log(`[Generator] model=${model} | type=${questionType} | topic="${tagLabel}"`)
    const generated = await generateGrammarQuestion(topicLabel, subtopics, questionType, model, userWords, recentContexts)

    // Step 2 — Evaluator/Revisor
    const revisorModel = process.env.REVISOR_AI_MODEL ?? REVISOR_AI_MODEL
    const reviewed = await evaluateGrammarQuestion(generated, questionType, tagLabel, revisorModel)
    const reviewedSnapshot = [reviewed.contextPassage, reviewed.questionText].filter(Boolean).join(" ")
    if (!isWeakGrammarItem(reviewed) && !isTooSimilarToRecent(reviewedSnapshot, recentContexts)) {
      return NextResponse.json(reviewed)
    }

    // Retry once when the first item still looks generic or low-relevance.
    const regenerated = await generateGrammarQuestion(topicLabel, subtopics, questionType, model, userWords, recentContexts)
    const reviewedRetry = await evaluateGrammarQuestion(regenerated, questionType, tagLabel, revisorModel)

    return NextResponse.json(reviewedRetry)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao gerar questão"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
