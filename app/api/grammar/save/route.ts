import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { GrammarQuestion } from "@/lib/types"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const questions: GrammarQuestion[] = Array.isArray(body?.questions) ? body.questions : []

    if (!questions.length) {
      return NextResponse.json({ ok: true })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ ok: true })
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Store each field as a flat column — no JSONB `data` blob needed
    const rows = questions.map((q) => ({
      id: q.id,
      topic: q.topic,
      subtopic: q.subtopic ?? null,
      question_type: q.questionType,
      question_text: q.questionText,
      options: q.options,          // JSONB array
      created_at: new Date(q.createdAt).toISOString(),
    }))

    const { error } = await supabase
      .from("grammar_questions_cache")
      .upsert(rows, { onConflict: "id" })

    if (error) {
      console.error("[grammar/save]", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[grammar/save] unexpected error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro desconhecido" },
      { status: 500 }
    )
  }
}
