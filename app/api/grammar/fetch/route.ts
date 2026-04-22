import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { GrammarQuestion } from "@/lib/types"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const topics: string[] = Array.isArray(body?.topics) ? body.topics : []
    const excludeIds: string[] = Array.isArray(body?.excludeIds) ? body.excludeIds : []
    // subtopics: Record<topicId, string[]> — if a topic has entries, only those subtopics are wanted
    const subtopics: Record<string, string[]> = (body?.subtopics && typeof body.subtopics === "object") ? body.subtopics : {}
    const limit: number = typeof body?.limit === "number" ? Math.min(body.limit, 400) : 80

    if (!topics.length) {
      return NextResponse.json({ questions: [] })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ questions: [] })
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data, error } = await supabase
      .from("grammar_questions_cache")
      .select("id, topic, subtopic, question_type, question_text, options, created_at")
      .in("topic", topics)
      .limit(limit)

    if (error) {
      console.error("[grammar/fetch]", error.message)
      return NextResponse.json({ questions: [] })
    }

    // Reconstruct GrammarQuestion objects from flat columns
    const questions: GrammarQuestion[] = (data ?? [])
      .filter((row) => {
        if (excludeIds.includes(row.id)) return false
        // If the user selected specific subtopics for this topic, enforce them
        const wantedSubs = subtopics[row.topic]
        if (wantedSubs && wantedSubs.length > 0) {
          return wantedSubs.includes(row.subtopic)
        }
        return true
      })
      .map((row) => ({
        id: row.id,
        topic: row.topic,
        subtopic: row.subtopic ?? undefined,
        questionType: row.question_type as "correct" | "incorrect",
        questionText: row.question_text,
        options: row.options,
        createdAt: new Date(row.created_at).getTime(),
      }))

    return NextResponse.json({ questions })
  } catch (err) {
    console.error("[grammar/fetch] unexpected error:", err)
    return NextResponse.json({ questions: [] })
  }
}
