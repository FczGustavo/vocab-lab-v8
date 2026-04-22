import type { Flashcard, GrammarExercise, GrammarQuestionOption } from "./types"

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
export const DEFAULT_AI_MODEL = process.env.DEFAULT_AI_MODEL ?? "openai/gpt-5.4-nano"
export const REVISOR_AI_MODEL = process.env.REVISOR_AI_MODEL ?? DEFAULT_AI_MODEL

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

const VALID_PARTS_OF_SPEECH = [
  "verb",
  "noun",
  "adjective",
  "adverb",
  "preposition",
  "conjunction",
  "interjection",
  "phrase",
  "acronym",
] as const

const VALID_RELATION_TYPES = ["literal", "figurative", "slang", "abstract"] as const

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function normalizePartOfSpeech(value: unknown, fallback: string = "noun"): string {
  const normalized = asTrimmedString(value).toLowerCase()
  return VALID_PARTS_OF_SPEECH.includes(normalized as (typeof VALID_PARTS_OF_SPEECH)[number])
    ? normalized
    : fallback
}

function normalizeRelationType(value: unknown): (typeof VALID_RELATION_TYPES)[number] {
  const normalized = asTrimmedString(value).toLowerCase()
  return VALID_RELATION_TYPES.includes(normalized as (typeof VALID_RELATION_TYPES)[number])
    ? (normalized as (typeof VALID_RELATION_TYPES)[number])
    : "literal"
}

function normalizeLexicalRelations(raw: unknown, maxItems: number) {
  if (!Array.isArray(raw) || maxItems <= 0) return []

  const seen = new Set<string>()
  const normalized = raw
    .map((item) => {
      const value = item as { word?: unknown; type?: unknown }
      const word = asTrimmedString(value?.word)
      if (!word) return null
      return {
        word,
        type: normalizeRelationType(value?.type),
      }
    })
    .filter((item): item is { word: string; type: (typeof VALID_RELATION_TYPES)[number] } => Boolean(item))
    .filter((item) => {
      const key = item.word.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, maxItems)

  return normalized
}

function normalizeAlternativeForms(
  raw: unknown,
  mainPartOfSpeech: string,
  includeAlternativeForms: boolean,
  isCompoundOrAcronym: boolean
) {
  if (!includeAlternativeForms || isCompoundOrAcronym || !Array.isArray(raw)) return []

  const seen = new Set<string>()
  const normalized = raw
    .map((item) => {
      const value = item as {
        word?: unknown
        partOfSpeech?: unknown
        translation?: unknown
        example?: unknown
      }
      const word = asTrimmedString(value?.word)
      const partOfSpeech = normalizePartOfSpeech(value?.partOfSpeech)
      const translation = asTrimmedString(value?.translation)
      const example = asTrimmedString(value?.example)

      if (!word || !translation || !example) return null
      if (partOfSpeech === mainPartOfSpeech) return null

      return {
        word,
        partOfSpeech,
        translation,
        example,
      }
    })
    .filter(
      (
        item
      ): item is { word: string; partOfSpeech: string; translation: string; example: string } => Boolean(item)
    )
    .filter((item) => {
      const key = item.word.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 2)

  return normalized
}

function normalizeConjugations(raw: unknown): FlashcardAIResponse["conjugations"] {
  if (!raw || typeof raw !== "object") return null
  const value = raw as Partial<NonNullable<FlashcardAIResponse["conjugations"]>>

  const simplePresent = asTrimmedString(value.simplePresent)
  const simplePast = asTrimmedString(value.simplePast)
  const presentContinuous = asTrimmedString(value.presentContinuous)
  const pastContinuous = asTrimmedString(value.pastContinuous)
  const presentPerfect = asTrimmedString(value.presentPerfect)
  const pastPerfect = asTrimmedString(value.pastPerfect)

  const allFilled =
    simplePresent &&
    simplePast &&
    presentContinuous &&
    pastContinuous &&
    presentPerfect &&
    pastPerfect

  if (!allFilled) return null

  return {
    simplePresent,
    simplePast,
    presentContinuous,
    pastContinuous,
    presentPerfect,
    pastPerfect,
  }
}

function inferVerbTypeFromSimplePast(simplePast: string): "regular" | "irregular" {
  const normalized = simplePast.toLowerCase().trim()
  return normalized.endsWith("ed") || normalized.endsWith("d") ? "regular" : "irregular"
}

function normalizeFlashcardResponse(
  raw: FlashcardAIResponse,
  originalWord: string,
  options: {
    includeConjugations: boolean
    includeAlternativeForms: boolean
    synonymsLevel: number
    isCompoundOrAcronym: boolean
    targetPartOfSpeech?: string
  }
): FlashcardAIResponse {
  const normalizedWord = asTrimmedString(raw?.normalizedWord) || originalWord.trim()
  const targetPos = options.targetPartOfSpeech
    ? normalizePartOfSpeech(options.targetPartOfSpeech)
    : undefined
  const partOfSpeech = targetPos ?? normalizePartOfSpeech(raw?.partOfSpeech)
  const translation = asTrimmedString(raw?.translation)
  const usageNote = asTrimmedString(raw?.usageNote)
  const example = asTrimmedString(raw?.example)
  const exampleTranslation = asTrimmedString(raw?.exampleTranslation)

  const maxRelations = options.synonymsLevel
  const synonyms = normalizeLexicalRelations(raw?.synonyms, maxRelations)
  const antonyms = normalizeLexicalRelations(raw?.antonyms, maxRelations)
  const alternativeForms = normalizeAlternativeForms(
    raw?.alternativeForms,
    partOfSpeech,
    options.includeAlternativeForms,
    options.isCompoundOrAcronym
  )

  const shouldHaveConjugations = options.includeConjugations && partOfSpeech === "verb"
  const conjugations = shouldHaveConjugations ? normalizeConjugations(raw?.conjugations) : null

  const verbTypeFromModel = asTrimmedString(raw?.verbType)
  const inferredVerbType = conjugations?.simplePast
    ? inferVerbTypeFromSimplePast(conjugations.simplePast)
    : "irregular"
  const verbType =
    partOfSpeech === "verb"
      ? verbTypeFromModel === "regular" || verbTypeFromModel === "irregular"
        ? (verbTypeFromModel as "regular" | "irregular")
        : inferredVerbType
      : null

  const _verbReasoning =
    partOfSpeech === "verb"
      ? asTrimmedString(raw?._verbReasoning) ||
        `Passado é ${conjugations?.simplePast ?? "n/a"}. Termina em -ed/-d? ${verbType === "regular" ? "Yes" : "No"}. Tipo: ${verbType}`
      : "n/a"

  return {
    normalizedWord,
    partOfSpeech,
    translation,
    usageNote,
    synonyms,
    antonyms,
    example,
    exampleTranslation,
    alternativeForms,
    _verbReasoning,
    verbType,
    conjugations,
  }
}

function parseJsonContent<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    const fenced = raw.match(/```json\s*([\s\S]*?)\s*```/i)
    if (fenced?.[1]) {
      return JSON.parse(fenced[1]) as T
    }

    const firstBrace = raw.indexOf("{")
    const lastBrace = raw.lastIndexOf("}")
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1)) as T
    }

    throw new Error("Resposta da IA não veio em JSON válido.")
  }
}

async function callOpenRouter<T>(
  messages: OpenRouterMessage[],
  model: string = DEFAULT_AI_MODEL,
  responseFormat?: { type: "json_object" },
  options?: { temperature?: number }
): Promise<T> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY não configurada no servidor.")
  }

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      // Compute referer safely for both browser and server environments without relying on `process` identifier
      "HTTP-Referer":
        (typeof window !== "undefined" && window.location?.origin) ||
        ((globalThis as any).process?.env?.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
      "X-OpenRouter-Title": "Meu App de Flashcards",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      ...(responseFormat && { response_format: responseFormat }),
    }),
  })

  if (!response.ok) {
    const rawError = await response.text()
    let message = `Erro na chamada da API do OpenRouter (status ${response.status})`

    try {
      const parsed = JSON.parse(rawError) as { error?: { message?: string } }
      if (parsed?.error?.message) {
        message = parsed.error.message
      }
    } catch {
      if (rawError.trim()) {
        message = `${message}: ${rawError.slice(0, 300)}`
      }
    }

    throw new Error(message)
  }

  const data: OpenRouterResponse = await response.json()
  const content = data.choices[0].message.content

  if (!content) {
    throw new Error("Resposta da IA vazia")
  }

  return parseJsonContent<T>(content)
}

export interface FlashcardAIResponse {
  normalizedWord: string
  partOfSpeech: string
  translation: string
  usageNote?: string
  synonyms: { word: string; type: "literal" | "figurative" | "slang" | "abstract" }[]
  antonyms: { word: string; type: "literal" | "figurative" | "slang" | "abstract" }[]
  example: string
  exampleTranslation?: string
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
  exampleTranslation?: string
  alternativeForms: {
    word: string
    partOfSpeech: string
    translation: string
    example: string
  }[]
}

export async function generateFlashcardData(
  word: string,
  model: string = DEFAULT_AI_MODEL,
  options?: GenerateFlashcardOptions
): Promise<FlashcardAIResponse> {
  const synonymsLevel = Math.max(0, Math.min(3, options?.synonymsLevel ?? 2))
  const includeConjugations = options?.includeConjugations ?? true
  const includeAlternativeForms = options?.includeAlternativeForms ?? true
  const includeUsageNote = options?.includeUsageNote ?? true
  const efommMode = options?.efommMode ?? false
  const targetPartOfSpeech = options?.targetPartOfSpeech

  console.log(`[OpenRouter] Calling ${model} for word: ${word}`)

  // Lógica TS para blindar siglas e expressões compostas
  const isCompoundOrAcronym = word.trim().includes(" ") || (word === word.toUpperCase() && word.length > 1);

  const synonymsInstruction =
    synonymsLevel === 0
      ? `4. NÃO gere sinônimos ou antônimos. Retorne "synonyms": [] e "antonyms": [].`
      : `4. SINÔNIMOS E ANTÔNIMOS (Em Inglês Americano): Forneça até ${synonymsLevel} sinônimos e até ${synonymsLevel} antônimos que correspondam EXATAMENTE ao sentido do card (mesma classe gramatical + mesmo significado). Se não existirem, retorne [].
   - Cada sinônimo/antônimo DEVE incluir um tipo: "literal" | "figurative" | "slang" | "abstract".
     * literal: ação física / objeto concreto / denotação direta
     * figurative: uso metafórico/abstrato (não físico)
     * slang: expressão muito informal / coloquial / idiomática
     * abstract: conceito geral/intelectual sem foco em fisicalidade
   - Fidelidade ao contexto: não inclua palavras que servem apenas para outros sentidos da palavra.
   - Exclusão: evite palavras genéricas ou preguiçosas ("get", "do", "go") a menos que sejam a melhor correspondência.
   - Antônimos: prefira opostos diretos do significado pretendido.`

  const conjugationsInstruction = includeConjugations
    ? `6. CONJUGAÇÕES (Em Inglês Americano): Se "partOfSpeech" for "verb", forneça os 6 tempos verbais. Se NÃO for um verbo, defina "conjugations" como null.`
    : `6. CONJUGAÇÕES: Defina "conjugations" null.`

  const usageNoteInstruction = includeUsageNote
    ? `3b. NOTA DE USO / CONTEXTO (opcional): Seja ULTRA CONCISO e DIRETO (estilo flashcard, máximo de 1 a 2 frases curtas). 
   - PROIBIDO usar introduções narrativas ou metalinguagem (NÃO escreva "A palavra X descreve...", "Diz-se quando...", "É comum em...").
   - Escreva DIRETAMENTE a regra ou nuance (Ex: "Usado para indicar inferioridade em tamanho ou escala." em vez de "Dwarfing é uma palavra usada para indicar...").
   - SE A PALAVRA FOR UMA SIGLA, OBRIGATORIAMENTE escreva o que as letras significam em inglês.
   - Explique a essência em PORTUGUÊS BRASILEIRO.
   - PROIBIDO dar "bronca" ou mencionar correções ortográficas que você ajustou.
   - Se a palavra não tiver nuance especial, retorne "".`
    : `3b. NOTA DE USO: NÃO gere notas de uso. Sempre retorne "usageNote": "".`

  const alternativeFormsInstruction = includeAlternativeForms && !isCompoundOrAcronym
    ? `7. FORMAS ALTERNATIVAS (Derivações e Conversões): SEMPRE QUE POSSÍVEL, force a inclusão de até 2 formas derivadas comuns no Inglês Americano. 
   - TRAVA DE EXPRESSÕES: Se a sua palavra final contiver ESPAÇOS, ABORTE esta regra e retorne "alternativeForms": [] obrigatoriamente.
   - A classe gramatical ("partOfSpeech") DEVE ser diferente da principal.
   - A "word" deve ser em INGLÊS.
   - Forneça uma tradução SECA e DIRETA EM PORTUGUÊS BRASILEIRO (OBRIGATÓRIO incluir o artigo se for substantivo).
   - Evite meta-definições ("o ato de...").
   - Forneça uma frase de exemplo EM INGLÊS usando essa forma alternativa.`
    : `7. FORMAS ALTERNATIVAS: NÃO gere formas alternativas. Sempre retorne "alternativeForms": [].`

 const efommInstruction = efommMode
    ? `MODO EFOMM (MARÍTIMO/NAVAL): APENAS aplique este modo se a palavra possuir um jargão ou significado TÉCNICO ESPECÍFICO no contexto marítimo, naval, portuário ou logístico que seja diferente do uso cotidiano.
   - REGRA ANTI-ALUCINAÇÃO: Se a palavra for de uso geral (ex: "dwarfing", "water", "run", "big") e significar exatamente a mesma coisa no mar e em terra, IGNORE este modo. 
   - PROIBIDO forçar cenários navais em palavras comuns. NÃO crie notas de uso dizendo "Em contexto naval, refere-se a embarcações..." se a palavra não for exclusiva para isso. Apenas trate-a como Inglês Geral.`
    : ``

  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: `Você é um professor sênior de Inglês Americano especializado em ensinar brasileiros.
Sua base de conhecimento é estritamente INGLÊS AMERICANO.

${efommInstruction}

Siga estes passos para gerar dados de estudo:
0. MORFOLOGIA (-ing): Se a palavra terminar em "-ing", decida se é um SUBSTANTIVO VERBAL (noun - ex: "mooring") ou GERÚNDIO/PARTICÍPIO (verb). Prefira "noun" quando nomeia um objeto/sistema.
1. NORMALIZAÇÃO:
   - ERRO DE HÍFEN EM VERBOS/EXPRESSÕES: Corrija silenciosamente ("look-forward-to" -> "look forward to"). PROIBIDO juntar as palavras.
   - ERRO DE INFINITIVO: Remova o "to" ("to-steer" -> "steer").
   - HÍFEN CORRETO: Mantenha em substantivos/adjetivos que exigem (ex: "make-up").
2. CLASSE GRAMATICAL ("partOfSpeech"): Classifique OBRIGATORIAMENTE usando APENAS as classes do JSON. 
   - Retorne "acronym" para siglas. 
   - Retorne "phrase" APENAS para expressões com mais de uma palavra SEPARADAS POR ESPAÇO.
3. TRADUÇÃO (SECA E DIRETA): Forneça 1 ou 2 traduções mais comuns em português, separadas por barra (/).
   - REGRA DE OURO: PROIBIDO incluir parênteses, explicações, contextos ou frases dentro do campo de tradução (NÃO faça: "ofuscamento (em relação a algo maior)").
   - PROIBIDO usar meta-definições ou frases ("o ato de...", "ficar menor que..."). A tradução deve ser a palavra equivalente, não o significado dela.
   - IMPORTANTE (artigos): Se for "noun" ou "phrase", SEMPRE inclua o artigo (ex: "a proa", "o porto").
   - TRADUÇÃO TÉCNICA: Evite traduções literais em jargões.
${usageNoteInstruction}
${synonymsInstruction}
5. EXEMPLO: Uma frase de exemplo natural em INGLÊS AMERICANO.
${conjugationsInstruction}
${alternativeFormsInstruction}

REGRAS DE ANTI-ALUCINAÇÃO (OBRIGATÓRIAS):
- NÃO invente significado técnico específico se ele não for consagrado.
- Se houver dúvida semântica, prefira saída conservadora: "usageNote": "", "synonyms": [], "antonyms": [], "alternativeForms": [].
- NÃO use Markdown, cercas de código, comentários, texto fora do JSON ou chaves extras.
- NÃO contradiga a classe gramatical escolhida.
- "normalizedWord" deve ser apenas a forma final normalizada da palavra (sem explicações).

Retorne um JSON exato (MANTENHA AS CHAVES EM INGLÊS):
{
  "normalizedWord": "a palavra",
  "partOfSpeech": "verb" | "noun" | "adjective" | "adverb" | "preposition" | "conjunction" | "interjection" | "phrase" | "acronym",
  "translation": "tradução seca (com artigo para substantivos)",
  "usageNote": "nota super direta ou string vazia",
  "synonyms": [{"word": "synonym1", "type": "literal" | "figurative" | "slang" | "abstract"}],
  "antonyms": [{"word": "antonym1", "type": "literal" | "figurative" | "slang" | "abstract"}],
  "example": "Frase de exemplo em inglês.",
  "exampleTranslation": "Tradução natural da frase em Português Brasileiro.",
  "alternativeForms": [{"word": "elevation", "partOfSpeech": "noun", "translation": "a elevação", "example": "The elevation is 2,000 meters."}],
  "_verbReasoning": "Template: 'Passado é [palavra]. Termina em -ed/-d? [Yes/No]. Tipo: [regular/irregular]'",
  "verbType": "regular" | "irregular" | null,
  "conjugations": { ... }
}

REGRAS CRÍTICAS DE VERBOS:
  - Se NÃO for verbo: "_verbReasoning": "n/a", "verbType": null e "conjugations": null.
   - Se FOR verbo: "_verbReasoning" decide. Se passado termina em -ed/-d (Yes), "verbType": "regular". Senão, "verbType": "irregular".`,
    },
    {
      role: "user",
      content: targetPartOfSpeech
        ? `Gere dados de flashcard para: "${word}". Trate-a EXCLUSIVAMENTE com o uso de "${targetPartOfSpeech}" e retorne "partOfSpeech" como "${targetPartOfSpeech}".`
        : `Gere dados de flashcard para: "${word}"`,
    },
  ]

  const raw = await callOpenRouter<FlashcardAIResponse>(
    messages,
    model,
    {
      type: "json_object",
    },
    {
      temperature: 0.2,
    }
  )

  return normalizeFlashcardResponse(raw, word, {
    includeConjugations,
    includeAlternativeForms,
    synonymsLevel,
    isCompoundOrAcronym,
    targetPartOfSpeech,
  })
}

export async function reviseFlashcardByTranslation(
  input: {
    word: string
    partOfSpeech: string
    translation: string
    efommMode?: boolean
    synonymsLevel?: number
    includeAlternativeForms?: boolean
    includeUsageNote?: boolean
  },
  model: string = DEFAULT_AI_MODEL
): Promise<FlashcardRevisionResponse> {
  const synonymsLevel = Math.max(0, Math.min(3, input.synonymsLevel ?? 2))
  const includeAlternativeForms = input.includeAlternativeForms ?? true
  const includeUsageNote = input.includeUsageNote ?? true
  const efommMode = input.efommMode ?? false

  const isCompoundOrAcronym = input.word.trim().includes(" ") || (input.word === input.word.toUpperCase() && input.word.length > 1);

  const synonymsInstruction =
    synonymsLevel === 0
      ? `NÃO gere sinônimos ou antônimos. Retorne "synonyms": [] e "antonyms": [].`
      : `Forneça até ${synonymsLevel} sinônimos e até ${synonymsLevel} antônimos em INGLÊS que correspondam ao sentido EXATO implícito pela nova tradução.`

  const alternativeFormsInstruction = includeAlternativeForms && !isCompoundOrAcronym
    ? `FORMAS ALTERNATIVAS: SEMPRE QUE POSSÍVEL, inclua até 2 formas derivadas.
   - A classe gramatical deve ser diferente da classe principal.
   - Forneça tradução SECA em PORTUGUÊS BRASILEIRO (com artigo para substantivos) e um exemplo em INGLÊS.
   - PROIBIDO meta-definições ("o ato de...").`
    : `Sempre retorne "alternativeForms": [].`

  const usageNoteInstruction = includeUsageNote
    ? `NOTA DE USO (opcional): Seja ULTRA CONCISO e DIRETO AO PONTO (estilo flashcard, máx 1 a 2 frases curtas). 
   - PROIBIDO usar introduções narrativas (NÃO escreva "A palavra descreve..."). Vá direto para a regra.
   - SE FOR SIGLA, escreva o que as letras significam em inglês.
   - Se não tiver nuance especial, retorne "".`
    : `NOTA DE USO: NÃO gere notas de uso. Sempre retorne "usageNote": "".`

  const efommInstruction = efommMode
    ? `MODO EFOMM (MARÍTIMO): Dê preferência a contextos navais e marítimos se for plausível. Se alterar o significado, aponte isso na "usageNote" de forma direta e curta.`
    : ``

  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: `Você é um professor sênior de Inglês Americano ensinando falantes de Português Brasileiro.

${efommInstruction}

Você receberá:
- uma palavra/sigla em inglês
- uma classe gramatical fixa
- uma NOVA tradução em português

Sua tarefa:
- Mantenha a palavra e classe gramatical idênticas.
- Atualize os campos para ficarem consistentes com a NOVA tradução.

Regras:
- "translation" DEVE ser retornada exatamente como fornecida.
- Sinônimos/antônimos (em inglês) DEVEM incluir um tipo: "literal" | "figurative" | "slang".
- Fidelidade: Liste apenas sinônimos e exemplos que se encaixem perfeitamente nesse novo sentido.

Instrução de sinônimos/antônimos: ${synonymsInstruction}
Instrução de nota de uso: ${usageNoteInstruction}
Instrução de formas alternativas: ${alternativeFormsInstruction}

Retorne o JSON exato:
{
  "translation": "tradução fornecida pelo usuário",
  "usageNote": "nota super direta em português",
  "synonyms": [{"word": "x", "type": "literal" | "figurative" | "slang"}],
  "antonyms": [{"word": "y", "type": "literal" | "figurative" | "slang"}],
  "example": "Frase de exemplo em Inglês",
  "exampleTranslation": "Tradução natural da frase",
  "alternativeForms": [{"word": "form", "partOfSpeech": "noun", "translation": "o/a ...", "example": "..." }]
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

  return callOpenRouter<FlashcardRevisionResponse>(messages, model, { type: "json_object" })
}

export async function generateGrammarExercises(
  flashcards: Flashcard[],
  exerciseType: "fill-blank" | "verb-conjugation" | "mixed",
  model: string = DEFAULT_AI_MODEL,
  count: number = 5
): Promise<GrammarExercise[]> {
  const words = flashcards.map((f) => f.word).join(", ")

  const typeInstructions =
    exerciseType === "fill-blank"
      ? "Crie exercícios de preencher as lacunas (fill-in-the-blank) onde o aluno deve completar a frase com a palavra/sigla correta."
      : exerciseType === "verb-conjugation"
        ? "Crie exercícios de conjugação verbal onde o aluno deve conjugar o verbo corretamente no tempo verbal indicado no contexto (passado, presente contínuo, etc)."
        : "Crie uma mistura de exercícios de preencher lacunas e de conjugação verbal."

  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: `Você é um professor de inglês criando exercícios focados para alunos falantes de Português Brasileiro. ${typeInstructions}

Use APENAS estas palavras ou siglas do vocabulário do aluno: ${words}

Responda em formato JSON com esta estrutura (MANTENHA AS CHAVES EM INGLÊS):
{
  "exercises": [
    {
      "id": "id-unico",
      "type": "fill-blank" ou "verb-conjugation",
      "sentence": "Frase em inglês com _____ para a lacuna OU o verbo entre parênteses indicando a ação",
      "answer": "a resposta correta em inglês",
      "hint": "dica útil EM PORTUGUÊS BRASILEIRO para ajudar o aluno",
      "wordUsed": "a palavra ou sigla do vocabulário que foi utilizada"
    }
  ]
}

Crie ${count} exercícios. As frases devem ser naturais no Inglês Americano e muito didáticas.`,
    },
    {
      role: "user",
      content: `Gere ${count} exercícios gramaticais do tipo ${exerciseType === "mixed" ? "mixed (misturados)" : exerciseType} usando meu vocabulário.`,
    },
  ]

  const response = await callOpenRouter<{ exercises: GrammarExercise[] }>(
    messages,
    model,
    { type: "json_object" }
  )

  return response.exercises
}

interface GrammarQuestionResponse {
  questionText: string
  contextPassage?: string | null
  options: GrammarQuestionOption[]
}

function normalizeOptions(raw: unknown): GrammarQuestionOption[] {
  const letters: GrammarQuestionOption["letter"][] = ["A", "B", "C", "D", "E"]
  const fallback = letters.map((letter, idx) => ({
    letter,
    text: `Option ${idx + 1}`,
    isAnswer: letter === "A",
    explanation: "",
  }))

  if (!Array.isArray(raw)) return fallback

  const mapped = raw
    .map((opt, idx) => {
      const value = opt as Partial<GrammarQuestionOption>
      const letter = letters[idx]
      return {
        letter,
        text: typeof value?.text === "string" && value.text.trim() ? value.text : `Option ${idx + 1}`,
        isAnswer: Boolean(value?.isAnswer),
        explanation: typeof value?.explanation === "string" ? value.explanation : "",
      }
    })
    .slice(0, 5)

  while (mapped.length < 5) {
    const letter = letters[mapped.length]
    mapped.push({ letter, text: `Option ${mapped.length + 1}`, isAnswer: false, explanation: "" })
  }

  if (!mapped.some((o) => o.isAnswer)) {
    mapped[0].isAnswer = true
  }

  return mapped
}

export async function generateGrammarQuestion(
  topicLabel: string,
  subtopics: string[],
  questionType: "correct" | "incorrect",
  model: string = DEFAULT_AI_MODEL,
  userWords?: string[]
): Promise<GrammarQuestionResponse> {
  const scope = [topicLabel, ...subtopics].filter(Boolean).join(" > ")
  const userWordsHint = Array.isArray(userWords) && userWords.length > 0
    ? `Use naturalmente algumas destas palavras do aluno quando fizer sentido: ${userWords.slice(0, 20).join(", ")}.`
    : ""

  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: `Você é um professor de Inglês Americano para brasileiros. Gere 1 questão de múltipla escolha com 5 alternativas (A-E).

Tipo da questão:
- correct: apenas 1 frase está gramaticalmente correta.
- incorrect: apenas 1 frase está gramaticalmente incorreta.

Regras:
- Tema principal: ${topicLabel}.
- Subtópicos: ${subtopics.join(", ") || "(nenhum)"}.
- Dificuldade: intermediário.
- Frases naturais em inglês americano.
- Forneça explicações curtas em português brasileiro para cada alternativa.
- Não use conteúdo ofensivo.
${userWordsHint}

Retorne JSON com exatamente:
{
  "questionText": "...",
  "contextPassage": "..." | null,
  "options": [
    { "letter": "A", "text": "...", "isAnswer": false, "explanation": "..." },
    { "letter": "B", "text": "...", "isAnswer": false, "explanation": "..." },
    { "letter": "C", "text": "...", "isAnswer": false, "explanation": "..." },
    { "letter": "D", "text": "...", "isAnswer": false, "explanation": "..." },
    { "letter": "E", "text": "...", "isAnswer": false, "explanation": "..." }
  ]
}

Garanta exatamente uma alternativa correta para o tipo solicitado.`,
    },
    {
      role: "user",
      content: `Crie uma questão do tipo "${questionType}" para o escopo: ${scope || topicLabel}.`,
    },
  ]

  const generated = await callOpenRouter<GrammarQuestionResponse>(messages, model, {
    type: "json_object",
  })

  return {
    questionText: generated?.questionText ?? "Choose the best option.",
    contextPassage: generated?.contextPassage ?? null,
    options: normalizeOptions(generated?.options),
  }
}

export async function evaluateGrammarQuestion(
  generated: GrammarQuestionResponse,
  questionType: "correct" | "incorrect",
  tagLabel: string,
  model: string = REVISOR_AI_MODEL
): Promise<GrammarQuestionResponse> {
  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: `Você é um revisor de qualidade para questões de gramática em Inglês Americano.
Revise a questão recebida, preserve o mesmo tipo (${questionType}) e retorne somente JSON na mesma estrutura.
Garanta:
- 5 alternativas (A-E)
- exatamente uma resposta correta
- explicações curtas em português brasileiro
- texto natural e sem ambiguidade

Retorne apenas:
{
  "questionText": "...",
  "contextPassage": "..." | null,
  "options": [
    { "letter": "A", "text": "...", "isAnswer": false, "explanation": "..." },
    { "letter": "B", "text": "...", "isAnswer": false, "explanation": "..." },
    { "letter": "C", "text": "...", "isAnswer": false, "explanation": "..." },
    { "letter": "D", "text": "...", "isAnswer": false, "explanation": "..." },
    { "letter": "E", "text": "...", "isAnswer": false, "explanation": "..." }
  ]
}`,
    },
    {
      role: "user",
      content: JSON.stringify({ tagLabel, questionType, generated }),
    },
  ]

  const reviewed = await callOpenRouter<GrammarQuestionResponse>(messages, model, {
    type: "json_object",
  })

  return {
    questionText: reviewed?.questionText ?? generated.questionText,
    contextPassage: reviewed?.contextPassage ?? generated.contextPassage ?? null,
    options: normalizeOptions(reviewed?.options),
  }
}
