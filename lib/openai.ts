import type { Flashcard, GrammarExercise } from "./types"

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

interface OpenRouterMessage {
  role: "system" | "user" | "assistant"
  content: string
}

interface OpenRouterResponse {
  choices: {
    message: {
      content: string
    }
  }[]
}

async function callOpenRouter<T>(
  apiKey: string,
  messages: OpenRouterMessage[],
  model: string = "openai/gpt-5.4-mini",
  responseFormat?: { type: "json_object" }
): Promise<T> {
  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
      "X-OpenRouter-Title": "Meu App de Flashcards",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      ...(responseFormat && { response_format: responseFormat }),
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || "Erro na chamada da API do OpenRouter")
  }

  const data: OpenRouterResponse = await response.json()
  const content = data.choices[0].message.content

  if (!content) {
    throw new Error("Resposta da IA vazia")
  }

  return JSON.parse(content) as T
}

export interface FlashcardAIResponse {
  normalizedWord: string
  partOfSpeech: string
  translation: string
  usageNote?: string
  synonyms: { word: string; type: "literal" | "figurative" | "slang" | "abstract" }[]
  antonyms: { word: string; type: "literal" | "figurative" | "slang" | "abstract" }[]
  example: string
  alternativeForms: {
    word: string
    partOfSpeech: string
    translation: string
    example: string
  }[]
  _verbReasoning?: string
  verbType?: "regular" | "irregular" | null
  conjugations?: {
    simplePresent: string
    simplePast: string
    presentContinuous: string
    pastContinuous: string
    presentPerfect: string
    pastPerfect: string
  } | null
}

export interface GenerateFlashcardOptions {
  synonymsLevel?: number
  includeConjugations?: boolean
  includeAlternativeForms?: boolean
  includeUsageNote?: boolean
  efommMode?: boolean
  targetPartOfSpeech?: string
}

export interface FlashcardRevisionResponse {
  translation: string
  usageNote: string
  synonyms: { word: string; type: "literal" | "figurative" | "slang" | "abstract" }[]
  antonyms: { word: string; type: "literal" | "figurative" | "slang" | "abstract" }[]
  example: string
  alternativeForms: {
    word: string
    partOfSpeech: string
    translation: string
    example: string
  }[]
}

export async function generateFlashcardData(
  apiKey: string,
  word: string,
  model: string = "openai/gpt-5.4-mini",
  options?: GenerateFlashcardOptions
): Promise<FlashcardAIResponse> {
  const synonymsLevel = Math.max(0, Math.min(3, options?.synonymsLevel ?? 2))
  const includeConjugations = options?.includeConjugations ?? true
  const includeAlternativeForms = options?.includeAlternativeForms ?? true
  const includeUsageNote = options?.includeUsageNote ?? true
  const efommMode = options?.efommMode ?? false
  const targetPartOfSpeech = options?.targetPartOfSpeech

  console.log(`[OpenRouter] Calling ${model} for word: ${word}`)

  const synonymsInstruction =
    synonymsLevel === 0
      ? `4. Do NOT generate synonyms or antonyms. Return "synonyms": [] and "antonyms": [].`
      : `4. SYNONYMS & ANTONYMS (American English): Provide up to ${synonymsLevel} synonyms and up to ${synonymsLevel} antonyms that match the EXACT sense of the card (same part of speech + same meaning). If none exist, return [].
   - Every synonym/antonym MUST include a type: "literal" | "figurative" | "slang".
     * literal: physical action / concrete object / direct denotation
     * figurative: metaphorical/abstract usage (not physical)
     * slang: very informal / colloquial / idiomatic expression
   - Fidelity to context: do not include items that fit a different sense (e.g., if "drink" means social alcohol, don't include "hydrate").
   - Exclusion: avoid lazy/generic words ("get", "do", "go") unless they are truly the best match.
   - Antonyms: prefer relational/direct opposites of the intended meaning (e.g., for "go drinking" prefer "stay sober" / "abstain").`

  const conjugationsInstruction = includeConjugations
    ? `6. CONJUGATIONS: If "partOfSpeech" is "verb", provide its 6 English tenses. If NOT a verb, set "conjugations" to null.`
    : `6. CONJUGATIONS: Set "conjugations" to null.`

  const usageNoteInstruction = includeUsageNote
    ? `3b. USAGE NOTE (optional): If the English word is noticeably formal/technical/idiomatic, add a short note in Brazilian Portuguese explaining the typical context and give 1-2 everyday alternatives when appropriate. If not needed, return "" in "usageNote".`
    : `3b. USAGE NOTE: Do NOT generate usage notes. Always return "usageNote": "" .`

  const alternativeFormsInstruction = includeAlternativeForms
    ? `7. ALTERNATIVE FORMS: If the word is commonly used as another part of speech in American English (e.g., noun and verb), include up to 2 alternative forms, ONLY when the meaning is commonly used and significantly different from the primary meaning (not just a grammatical rephrase).
IMPORTANT:
   - For each alternative form, provide the correct English word/form in "word" (e.g., "elevation" for the noun, "elevated" for the adjective).
   - Provide a concise Portuguese translation (include the article if it is a noun, e.g., "a elevação").
   - Avoid meta-definitions like "o ato de..." for alternative noun forms. If the best you can do is an "act of ..." explanation, then DO NOT include that alternative form.
   - Provide an example sentence using that exact English form.
Do not repeat the primary part of speech.`
    : `7. ALTERNATIVE FORMS: Do NOT generate alternative forms. Always return "alternativeForms": [].`

  const efommInstruction = efommMode
    ? `EFOMM MODE (MARITIME): Prefer maritime/naval/port/shipping/logistics meanings and example sentences whenever the word has a plausible and commonly used maritime sense in American English. If the word is not meaningfully related to maritime contexts, keep the general meaning and a normal example. Do NOT force maritime context when it would be unnatural.

If EFOMM mode changes the meaning compared to everyday/general usage, you may briefly clarify it in "usageNote". Otherwise, do not mention maritime context explicitly.`
    : ``

  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: `You are a senior American English teacher specializing in teaching Brazilian Portuguese speakers. 
Your base of knowledge is strictly AMERICAN ENGLISH.

${efommInstruction}

When given an English word, perform these steps:
0. MORPHOLOGY (-ing): If the input ends with "-ing", decide whether it is:
   - a VERBAL NOUN (noun) naming an object, system, established activity, or fixed process (e.g., "mooring", "rigging", "wiring"), or
   - a GERUND / PRESENT PARTICIPLE (verb form) expressing an ongoing action.
   Prefer "noun" when the -ing form commonly names an object/system/fixed process, especially in technical or maritime usage.
1. Normalization:
   - If you decided it is a verb form, NORMALIZE to its base form/infinitive (e.g., "running" → "run") and return it in "normalizedWord".
   - If you decided it is a verbal noun, keep it as-is in "normalizedWord" and treat the primary part of speech as "noun".
2. Its primary part of speech in American English.
3. Portuguese translation (Brazilian Portuguese). Provide exactly 1 or 2 most common and accurate translations in Portuguese, separated by slashes.
   - Prefer a neutral, standard translation (no slang, no overly informal phrasing).
   - IMPORTANT (articles): If the part of speech is "noun", include the most natural Portuguese article with the translation when it improves clarity (e.g., "a proa", "o porto", "a âncora"). Use "o/a" for singular and "os/as" for plural when appropriate.
   - IMPORTANT (avoid meta-definitions): Do NOT translate nouns as explanations like "o ato de ..." / "a ação de ..." / "o processo de ..." unless the noun's primary meaning in American English truly is that action/process AND there is no more natural noun translation. Prefer concise noun translations (e.g., for the noun "drink" prefer "a bebida" rather than "o ato de beber").
   - Avoid overly specific/contextual translations unless it's the primary meaning (e.g., do NOT default to "encontro romântico" for "date"; only include it if the primary meaning is clearly romantic date in American English for the given part of speech).
   - If two translations would be near-synonyms or essentially the same meaning (e.g., "beber / tomar" for "drink"), choose ONLY the most natural/pleasant one and return a single translation.
   - Example for "Fabric": "tecido / pano" (only if both are truly distinct/common).
${usageNoteInstruction}
${synonymsInstruction}
5. An natural example sentence in American English.
${conjugationsInstruction}
${alternativeFormsInstruction}

Return a JSON with this exact structure:
{
  "normalizedWord": "the word",
  "partOfSpeech": "verb" | "noun" | "adjective" | "adverb" | "preposition" | "conjunction" | "interjection",
  "translation": "Portuguese translation(s)",
  "usageNote": "optional short note in Portuguese, or empty string",
  "synonyms": [{"word": "synonym1", "type": "literal" | "figurative" | "slang"}],
  "antonyms": [{"word": "antonym1", "type": "literal" | "figurative" | "slang"}],
  "example": "Example sentence.",
  "alternativeForms": [{"word": "elevation", "partOfSpeech": "noun", "translation": "elevação", "example": "The elevation is 2,000 meters."}],
  "_verbReasoning": "Template: 'Past is [word]. Ends in -ed/-d? [Yes/No]. Type: [regular/irregular]'",
  "verbType": "regular" | "irregular" | null,
  "conjugations": {
    "simplePresent": "runs",
    "simplePast": "ran",
    "presentContinuous": "is running",
    "pastContinuous": "was running",
    "presentPerfect": "has run",
    "pastPerfect": "had run"
  }
}

CRITICAL RULES FOR JSON:
VERBS (verbType):
   - If "partOfSpeech" is NOT a verb: set "_verbReasoning" to "n/a" and "verbType" to null.
   - If it IS a verb, fill "_verbReasoning" first. If Yes (-ed/-d), you MUST set "verbType": "regular". If No (like cut, put, bought), you MUST set "verbType": "irregular".`,
    },
    {
      role: "user",
      content: targetPartOfSpeech
        ? `Generate flashcard data for the word/form: "${word}". IMPORTANT: Treat it as a "${targetPartOfSpeech}" usage and return "partOfSpeech" as "${targetPartOfSpeech}".`
        : `Generate flashcard data for the word/form: "${word}"`,
    },
  ]

  return callOpenRouter<FlashcardAIResponse>(apiKey, messages, model, {
    type: "json_object",
  })
}

export async function reviseFlashcardByTranslation(
  apiKey: string,
  input: {
    word: string
    partOfSpeech: string
    translation: string
    efommMode?: boolean
    synonymsLevel?: number
    includeAlternativeForms?: boolean
    includeUsageNote?: boolean
  },
  model: string = "openai/gpt-4o-mini"
): Promise<FlashcardRevisionResponse> {
  const synonymsLevel = Math.max(0, Math.min(3, input.synonymsLevel ?? 2))
  const includeAlternativeForms = input.includeAlternativeForms ?? true
  const includeUsageNote = input.includeUsageNote ?? true
  const efommMode = input.efommMode ?? false

  const synonymsInstruction =
    synonymsLevel === 0
      ? `Do NOT generate synonyms or antonyms. Return "synonyms": [] and "antonyms": [].`
      : `Provide up to ${synonymsLevel} synonyms and up to ${synonymsLevel} antonyms that match the EXACT meaning implied by the translation.`

  const usageNoteInstruction = includeUsageNote
    ? `If needed, provide a short "usageNote" in Brazilian Portuguese. If not needed, return "" in "usageNote".`
    : `Always return "usageNote": "" .`

  const alternativeFormsInstruction = includeAlternativeForms
    ? `If relevant, include up to 2 alternative forms with correct English "word", their part of speech, Portuguese translation (use article for nouns), and an example sentence. Avoid meta-definitions like "o ato de...".`
    : `Always return "alternativeForms": [].`

  const efommInstruction = efommMode
    ? `EFOMM MODE (MARITIME): Prefer maritime/naval/port/shipping/logistics meanings and examples whenever plausible. If it changes the meaning vs everyday usage, briefly clarify it in "usageNote". Otherwise, do not mention maritime context explicitly.`
    : ``

  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: `You are a senior American English teacher specializing in teaching Brazilian Portuguese speakers.
Your base of knowledge is strictly AMERICAN ENGLISH.

${efommInstruction}

You will receive:
- an English word
- a fixed part of speech
- a NEW Portuguese translation chosen by the user

Your task:
- Keep the same English word and the same part of speech.
- Make all the other fields consistent with the new translation/sense.

Rules:
- Translation must be returned exactly as provided by the user (trimmed).
- For nouns, prefer using an article in Portuguese when helpful ("a proa", "o porto", etc.).
- Avoid meta-definitions like "o ato de..." for nouns unless that is truly the primary meaning and no natural noun translation exists.
- Synonyms/antonyms MUST include a type: "literal" | "figurative" | "slang".
  * literal: physical/direct denotation
  * figurative: metaphor/metaphorical/abstract sense
  * slang: very informal/idiomatic
- Fidelity: Only list synonyms/antonyms that fit this exact sense. Avoid lazy generic words unless truly best match.

Synonyms/antonyms instruction: ${synonymsInstruction}
Usage note instruction: ${usageNoteInstruction}
Alternative forms instruction: ${alternativeFormsInstruction}

Return JSON with this exact structure:
{
  "translation": "Portuguese translation",
  "usageNote": "string",
  "synonyms": [{"word": "x", "type": "literal" | "figurative" | "slang"}],
  "antonyms": [{"word": "y", "type": "literal" | "figurative" | "slang"}],
  "example": "American English example sentence matching this sense",
  "alternativeForms": [{"word": "form", "partOfSpeech": "noun", "translation": "a ...", "example": "..." }]
}`,
    },
    {
      role: "user",
      content: JSON.stringify({
        word: input.word,
        partOfSpeech: input.partOfSpeech,
        newTranslation: input.translation,
      }),
    },
  ]

  return callOpenRouter<FlashcardRevisionResponse>(apiKey, messages, model, { type: "json_object" })
}

export async function generateGrammarExercises(
  apiKey: string,
  flashcards: Flashcard[],
  exerciseType: "fill-blank" | "verb-conjugation" | "mixed",
  model: string = "openai/gpt-4o-mini",
  count: number = 5
): Promise<GrammarExercise[]> {
  const words = flashcards.map((f) => f.word).join(", ")

  const typeInstructions =
    exerciseType === "fill-blank"
      ? "Create fill-in-the-blank exercises where the student must complete the sentence with the correct word."
      : exerciseType === "verb-conjugation"
        ? "Create verb conjugation exercises where the student must conjugate the verb correctly (past tense, present continuous, etc.)."
        : "Create a mix of fill-in-the-blank and verb conjugation exercises."

  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: `You are an English grammar teacher creating exercises for Brazilian Portuguese speakers. ${typeInstructions}

Use ONLY these vocabulary words: ${words}

Respond in JSON format with this structure:
{
  "exercises": [
    {
      "id": "unique-id",
      "type": "fill-blank" or "verb-conjugation",
      "sentence": "The sentence with _____ for the blank OR the verb in parentheses",
      "answer": "the correct answer",
      "hint": "optional hint in Portuguese",
      "wordUsed": "the vocabulary word used"
    }
  ]
}

Create ${count} exercises. Make sentences natural and educational.`,
    },
    {
      role: "user",
      content: `Generate ${count} ${exerciseType === "mixed" ? "mixed" : exerciseType} grammar exercises using my vocabulary words.`,
    },
  ]

  const response = await callOpenRouter<{ exercises: GrammarExercise[] }>(
    apiKey,
    messages,
    model,
    { type: "json_object" }
  )

  return response.exercises
}
