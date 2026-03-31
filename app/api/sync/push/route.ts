import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { syncCode, word, context } = await req.json();

    // 1. BUSCAR ESTADO ATUAL (Para não resetar o banco)
    const { data: currentEntry } = await supabase
      .from("vocablab_sync_state")
      .select("payload")
      .eq("sync_code", syncCode)
      .single();

    let payload = currentEntry?.payload || { folders: [], flashcards: [], version: 1 };

    // 2. CHAMADA AO GPT PARA GERAR O CARD NO PADRÃO
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // ou gpt-3.5-turbo
      messages: [
        {
          role: "system",
          content: `Você é um professor de inglês técnico para a Marinha Mercante (EFOMM). 
          Responda APENAS com um objeto JSON puro seguindo rigorosamente este padrão:
          {
            "id": "gerar-uuid-v4",
            "word": "palavra",
            "translation": "tradução",
            "example": "frase no contexto",
            "partOfSpeech": "verb/noun/etc",
            "verbType": "regular/irregular/null",
            "synonyms": [{"type": "literal", "word": "..."}],
            "antonyms": [{"type": "literal", "word": "..."}],
            "conjugations": { "simplePast": "...", "presentPerfect": "..." },
            "falseCognate": { "isFalseCognate": false, "warning": "" }
          }`
        },
        {
          role: "user",
          content: `Gere um card para a palavra: "${word}" encontrada neste contexto: "${context}"`
        }
      ],
      response_format: { type: "json_object" }
    });

    const newCard = JSON.parse(completion.choices[0].message.content!);
    newCard.id = crypto.randomUUID();
    newCard.createdAt = Date.now();

    // 3. ATUALIZAR O PAYLOAD (Adiciona o novo card à lista existente)
    payload.flashcards.push(newCard);
    payload.exportedAt = Date.now();

    // 4. SALVAR NO SUPABASE
    const { error } = await supabase.from("vocablab_sync_state").upsert({
      sync_code: syncCode,
      payload: payload,
      updated_at: new Date().toISOString()
    });

    if (error) throw error;

    return NextResponse.json({ ok: true, word: newCard.word });

  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
