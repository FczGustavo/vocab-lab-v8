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
  model: string = "openai/gpt-5.4-nano",
  responseFormat?: { type: "json_object" }
): Promise<T> {
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
      ? `4. NÃO gere sinônimos ou antônimos. Retorne "synonyms": [] e "antonyms": [].`
      : `4. SINÔNIMOS E ANTÔNIMOS (Em Inglês Americano): Forneça até ${synonymsLevel} sinônimos e até ${synonymsLevel} antônimos que correspondam EXATAMENTE ao sentido do card (mesma classe gramatical + mesmo significado). Se não existirem, retorne [].
   - Cada sinônimo/antônimo DEVE incluir um tipo: "literal" | "figurative" | "slang".
     * literal: ação física / objeto concreto / denotação direta
     * figurative: uso metafórico/abstrato (não físico)
     * slang: expressão muito informal / coloquial / idiomática
   - Fidelidade ao contexto: não inclua palavras que servem apenas para outros sentidos da palavra (ex: se "drink" significa álcool no contexto social, não inclua "hydrate").
   - Exclusão: evite palavras genéricas ou preguiçosas ("get", "do", "go") a menos que sejam a melhor correspondência.
   - Antônimos: prefira opostos diretos do significado pretendido (ex: para "go drinking", prefira "stay sober").`

  const conjugationsInstruction = includeConjugations
    ? `6. CONJUGAÇÕES (Em Inglês Americano): Se "partOfSpeech" for "verb", forneça os 6 tempos verbais. Se NÃO for um verbo, defina "conjugations" como null.`
    : `6. CONJUGAÇÕES: Defina "conjugations" como null.`

  const usageNoteInstruction = includeUsageNote
    ? `3b. NOTA DE USO (opcional): Seja EXTREMAMENTE DIDÁTICO, porém PRECISO e DIRETO AO PONTO (estilo flashcard, máximo absoluto de 2 frases curtas). 
   - Explique a essência do uso, nuance ou contexto em PORTUGUÊS BRASILEIRO.
   - PROIBIDO usar introduções longas (ex: não escreva "Esta palavra costuma indicar...", vá direto para "Indica...").
   - Foque na regra prática. Exemplo bom: "Indica passagem física (go through) ou duração contínua (through the night). Comum com verbos de envio."
   - Se a palavra não tiver nenhuma nuance especial de uso, retorne "".`
    : `3b. NOTA DE USO: NÃO gere notas de uso. Sempre retorne "usageNote": "".`

  const alternativeFormsInstruction = includeAlternativeForms
    ? `7. FORMAS ALTERNATIVAS: Se a palavra for comumente usada como outra classe gramatical no inglês americano (ex: substantivo e verbo), inclua até 2 formas alternativas. Faça isso APENAS quando o significado for comumente usado e significativamente diferente do sentido principal.
IMPORTANTE:
   - Para cada forma alternativa, forneça a palavra/forma correta em INGLÊS em "word" (ex: "elevation" para substantivo, "elevated" para adjetivo).
   - Forneça uma tradução concisa e natural EM PORTUGUÊS BRASILEIRO (inclua o artigo se for substantivo, ex: "a elevação").
   - Evite meta-definições como "o ato de..." para substantivos alternativos. Se a única tradução possível for uma explicação de "ato de...", NÃO inclua essa forma alternativa.
   - Forneça uma frase de exemplo EM INGLÊS usando exatamente essa forma alternativa.
Não repita a classe gramatical principal.`
    : `7. FORMAS ALTERNATIVAS: NÃO gere formas alternativas. Sempre retorne "alternativeForms": [].`

  const efommInstruction = efommMode
    ? `MODO EFOMM (MARÍTIMO): Priorize significados e frases de exemplo do contexto marítimo/naval/portuário/logístico no Inglês Americano, se aplicável e natural. NÃO force se ficar antinatural.
Se alterar o significado em comparação com o uso diário, aplique a mesma regra de essência na "usageNote": seja ULTRA CONCISO (máx 1 a 2 frases diretas, sem enrolação). Não mencione o contexto marítimo explicitamente se não alterar o sentido.`
    : ``

  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: `Você é um professor sênior de Inglês Americano especializado em ensinar falantes nativos de Português Brasileiro.
Sua base de conhecimento é estritamente INGLÊS AMERICANO.

${efommInstruction}

Quando receber uma palavra em inglês, siga estes passos para gerar dados de estudo:
0. MORFOLOGIA (-ing): Se a palavra terminar em "-ing", decida se é:
   - um SUBSTANTIVO VERBAL (noun) nomeando um objeto, sistema, atividade estabelecida ou processo fixo (ex: "mooring", "rigging", "wiring"), ou
   - um GERÚNDIO / PARTICÍPIO PRESENTE (verb) expressando uma ação em andamento.
   Prefira "noun" quando a forma -ing comumente nomeia um objeto/sistema, especialmente no uso técnico.
1. Normalização:
   - Se decidir que é um verbo, NORMALIZE para a forma base/infinitivo (ex: "running" → "run") e retorne em "normalizedWord".
   - Se decidir que é um substantivo verbal, mantenha como está em "normalizedWord" e trate a classe gramatical (partOfSpeech) primária como "noun".
2. A classe gramatical primária no Inglês Americano ("partOfSpeech").
3. Tradução em Português Brasileiro. Forneça exatamente 1 ou 2 traduções mais comuns e precisas em português, separadas por barra (/).
   - Prefira uma tradução neutra e padrão (sem gírias locais ou construções muito informais, salvo se a original for assim).
   - IMPORTANTE (artigos): Se a classe gramatical for "noun" (substantivo), SEMPRE inclua o artigo mais natural em português junto com a tradução (ex: "a proa", "o porto", "a âncora"). Use "o/a" para singular e "os/as" para plural.
   - IMPORTANTE (evite meta-definições): NÃO traduza substantivos com explicações como "o ato de ..." / "a ação de ...". Prefira traduções concisas (ex: para "drink" como substantivo, use "a bebida" em vez de "o ato de beber").
   - Evite traduções ultra-específicas a menos que seja o significado principal (ex: NÃO use "encontro romântico" como padrão para "date", a menos que esse seja o sentido primário focado).
   - Se duas traduções forem sinônimos perfeitos (ex: "beber / tomar"), escolha APENAS a que soa mais natural e retorne uma só.
${usageNoteInstruction}
${synonymsInstruction}
5. Uma frase de exemplo natural em INGLÊS AMERICANO.
${conjugationsInstruction}
${alternativeFormsInstruction}

Retorne um JSON com esta estrutura exata (MANTENHA AS CHAVES DO JSON EM INGLÊS):
{
  "normalizedWord": "a palavra",
  "partOfSpeech": "verb" | "noun" | "adjective" | "adverb" | "preposition" | "conjunction" | "interjection",
  "translation": "tradução em português (com artigo para substantivos)",
  "usageNote": "nota curta em português ou string vazia",
  "synonyms": [{"word": "synonym1", "type": "literal" | "figurative" | "slang"}],
  "antonyms": [{"word": "antonym1", "type": "literal" | "figurative" | "slang"}],
  "example": "Frase de exemplo em inglês.",
  "alternativeForms": [{"word": "elevation", "partOfSpeech": "noun", "translation": "a elevação", "example": "The elevation is 2,000 meters."}],
  "_verbReasoning": "Template: 'Passado é [palavra]. Termina em -ed/-d? [Yes/No]. Tipo: [regular/irregular]'",
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

REGRAS CRÍTICAS PARA O JSON:
VERBOS (verbType):
   - Se "partOfSpeech" NÃO for verbo: defina "_verbReasoning" como "n/a" e "verbType" como null.
   - Se FOR verbo, preencha "_verbReasoning" primeiro. Se terminar em -ed/-d (Yes), você DEVE definir "verbType": "regular". Se não (No - como cut, put, bought), você DEVE definir "verbType": "irregular".`,
    },
    {
      role: "user",
      content: targetPartOfSpeech
        ? `Gere dados de flashcard para a palavra/forma: "${word}". IMPORTANTE: Trate-a com o uso de "${targetPartOfSpeech}" e retorne "partOfSpeech" como "${targetPartOfSpeech}".`
        : `Gere dados de flashcard para a palavra/forma: "${word}"`,
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
  model: string = "openai/gpt-5.4-mini"
): Promise<FlashcardRevisionResponse> {
  const synonymsLevel = Math.max(0, Math.min(3, input.synonymsLevel ?? 2))
  const includeAlternativeForms = input.includeAlternativeForms ?? true
  const includeUsageNote = input.includeUsageNote ?? true
  const efommMode = input.efommMode ?? false

  const synonymsInstruction =
    synonymsLevel === 0
      ? `NÃO gere sinônimos ou antônimos. Retorne "synonyms": [] e "antonyms": [].`
      : `Forneça até ${synonymsLevel} sinônimos e até ${synonymsLevel} antônimos em INGLÊS que correspondam ao sentido EXATO implícito pela tradução.`

  const alternativeFormsInstruction = includeAlternativeForms
    ? `Se relevante, inclua até 2 formas alternativas com a palavra "word" correta em inglês, sua classe gramatical, tradução para o português (use artigo para substantivos) e uma frase de exemplo em inglês. Evite meta-definições como "o ato de...".`
    : `Sempre retorne "alternativeForms": [].`

  const usageNoteInstruction = includeUsageNote
    ? `NOTA DE USO (opcional): Seja EXTREMAMENTE DIDÁTICO, porém PRECISO e DIRETO AO PONTO (estilo flashcard, máximo absoluto de 2 frases curtas). 
   - Explique a essência do uso, nuance ou contexto em PORTUGUÊS BRASILEIRO.
   - PROIBIDO usar introduções longas. Vá direto para a regra prática.
   - Se a palavra não tiver nenhuma nuance especial de uso, retorne "".`
    : `NOTA DE USO: NÃO gere notas de uso. Sempre retorne "usageNote": "".`

  const efommInstruction = efommMode
    ? `MODO EFOMM (MARÍTIMO): Dê preferência a contextos navais e marítimos se for plausível. Se alterar o significado diário, aplique a mesma regra de essência na "usageNote": seja ULTRA CONCISO (máx 1 a 2 frases).`
    : ``

  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: `Você é um professor sênior de Inglês Americano ensinando falantes de Português Brasileiro.
Sua base de conhecimento é estritamente INGLÊS AMERICANO.

${efommInstruction}

Você receberá:
- uma palavra em inglês
- uma classe gramatical fixa
- uma NOVA tradução em português escolhida pelo usuário

Sua tarefa:
- Mantenha a mesma palavra em inglês e a mesma classe gramatical.
- Atualize todos os outros campos para ficarem consistentes com essa NOVA tradução/sentido.

Regras:
- "translation" DEVE ser retornada exatamente como fornecida pelo usuário.
- Para substantivos (nouns), caso você gere outras formas alternativas, use artigos em português ("a proa", "o porto").
- Sinônimos/antônimos (em inglês) DEVEM incluir um tipo: "literal" | "figurative" | "slang".
- Fidelidade: Liste apenas sinônimos e exemplos que se encaixem perfeitamente nesse novo sentido.

Instrução de sinônimos/antônimos: ${synonymsInstruction}
Instrução de nota de uso: ${usageNoteInstruction}
Instrução de formas alternativas: ${alternativeFormsInstruction}

Retorne o JSON com esta estrutura exata (Chaves em inglês):
{
  "translation": "tradução fornecida pelo usuário",
  "usageNote": "string em português",
  "synonyms": [{"word": "x", "type": "literal" | "figurative" | "slang"}],
  "antonyms": [{"word": "y", "type": "literal" | "figurative" | "slang"}],
  "example": "Frase de exemplo em Inglês Americano para este sentido",
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

  return callOpenRouter<FlashcardRevisionResponse>(apiKey, messages, model, { type: "json_object" })
}

export async function generateGrammarExercises(
  apiKey: string,
  flashcards: Flashcard[],
  exerciseType: "fill-blank" | "verb-conjugation" | "mixed",
  model: string = "openai/gpt-5.4-mini",
  count: number = 5
): Promise<GrammarExercise[]> {
  const words = flashcards.map((f) => f.word).join(", ")

  const typeInstructions =
    exerciseType === "fill-blank"
      ? "Crie exercícios de preencher as lacunas (fill-in-the-blank) onde o aluno deve completar a frase com a palavra correta."
      : exerciseType === "verb-conjugation"
        ? "Crie exercícios de conjugação verbal onde o aluno deve conjugar o verbo corretamente no tempo verbal indicado no contexto (passado, presente contínuo, etc)."
        : "Crie uma mistura de exercícios de preencher lacunas e de conjugação verbal."

  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: `Você é um professor de inglês criando exercícios focados para alunos falantes de Português Brasileiro. ${typeInstructions}

Use APENAS estas palavras de vocabulário do aluno: ${words}

Responda em formato JSON com esta estrutura (MANTENHA AS CHAVES EM INGLÊS):
{
  "exercises": [
    {
      "id": "id-unico",
      "type": "fill-blank" ou "verb-conjugation",
      "sentence": "Frase em inglês com _____ para a lacuna OU o verbo entre parênteses indicando a ação",
      "answer": "a resposta correta em inglês",
      "hint": "dica útil EM PORTUGUÊS BRASILEIRO para ajudar o aluno",
      "wordUsed": "a palavra do vocabulário que foi utilizada"
    }
  ]
}

Crie ${count} exercícios. As frases devem ser naturais no Inglês Americano e muito didáticas.`,
    },
    {
      role: "user",
      content: `Gere ${count} exercícios gramaticais do tipo ${exerciseType === "mixed" ? "mixed (misturados)" : exerciseType} usando minhas palavras de vocabulário.`,
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
