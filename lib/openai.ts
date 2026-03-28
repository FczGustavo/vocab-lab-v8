'use server'

import type { FlashcardAIResponse, GrammarExercise, Flashcard } from "@/lib/types"

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"

interface OpenAIMessage {
  role: "system" | "user" | "assistant"
  content: string
}

interface OpenAIResponse {
  choices: {
    message: {
      content: string
    }
  }[]
}

async function callOpenAI<T>(
  apiKey: string,
  messages: OpenAIMessage[],
  responseFormat?: { type: "json_object" }
): Promise<T> {
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.7,
      ...(responseFormat && { response_format: responseFormat }),
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error?.message || `API Error: ${response.status}`)
  }

  const data: OpenAIResponse = await response.json()
  const content = data.choices[0]?.message?.content

  if (!content) {
    throw new Error("No response from API")
  }

  return JSON.parse(content) as T
}

export async function generateFlashcardData(
  apiKey: string,
  word: string
): Promise<FlashcardAIResponse> {
  const messages: OpenAIMessage[] = [
    {
      role: "system",
      content: `You are a helpful English language teacher for Portuguese speakers. When given an English word:
1. If it's a verb in any form (e.g., "running", "ran", "lifts"), NORMALIZE it to its base form/infinitive (e.g., "run", "lift"). Return this in "normalizedWord".
2. Its primary part of speech.
3. Portuguese translation.
4. Synonyms and antonyms.
5. An example sentence.
6. IMPORTANT: If the part of speech is "verb", provide its conjugation in these 6 English tenses: Simple Present (3rd person singular), Simple Past, Present Continuous, Past Continuous, Present Perfect, and Past Perfect.

Return a JSON with this exact structure:
{
  "normalizedWord": "the English word in base form",
  "partOfSpeech": "verb" | "noun" | "adjective" | "adverb" | "preposition" | "conjunction" | "interjection",
  "translation": "Portuguese translation",
  "synonyms": [{"word": "synonym1", "type": "literal"}],
  "antonyms": [{"word": "antonym1", "type": "literal"}],
  "example": "Example sentence.",
  "alternativeForms": [],
  "conjugations": {
    "simplePresent": "runs",
    "simplePast": "ran",
    "presentContinuous": "is running",
    "pastContinuous": "was running",
    "presentPerfect": "has run",
    "pastPerfect": "had run"
  }
}

If a tense doesn't apply or exist for the word, use "n/a".
If the word is not a verb, return "conjugations" as null.`,
    },
    {
      role: "user",
      content: `Generate flashcard data for the word/form: "${word}"`,
    },
  ]

  return callOpenAI<FlashcardAIResponse>(apiKey, messages, {
    type: "json_object",
  })
}

export async function generateGrammarExercises(
  apiKey: string,
  flashcards: Flashcard[],
  exerciseType: "fill-blank" | "verb-conjugation" | "mixed",
  count: number = 5
): Promise<GrammarExercise[]> {
  const words = flashcards.map((f) => f.word).join(", ")

  const typeInstructions =
    exerciseType === "fill-blank"
      ? "Create fill-in-the-blank exercises where the student must complete the sentence with the correct word."
      : exerciseType === "verb-conjugation"
        ? "Create verb conjugation exercises where the student must conjugate the verb correctly (past tense, present continuous, etc.)."
        : "Create a mix of fill-in-the-blank and verb conjugation exercises."

  const messages: OpenAIMessage[] = [
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

  const response = await callOpenAI<{ exercises: GrammarExercise[] }>(
    apiKey,
    messages,
    { type: "json_object" }
  )

  return response.exercises
}
