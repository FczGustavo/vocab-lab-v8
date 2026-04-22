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
  responseFormat?: { type: "json_object" }
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
      temperature: 0.7,
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
   - Cada sinônimo/antônimo DEVE incluir um tipo: "literal" | "figurative" | "slang".
     * literal: ação física / objeto concreto / denotação direta
     * figurative: uso metafórico/abstrato (não físico)
     * slang: expressão muito informal / coloquial / idiomática
   - Fidelidade ao contexto: não inclua palavras que servem apenas para outros sentidos da palavra (ex: se "drink" significa álcool no contexto social, não inclua "hydrate").
   - Exclusão: evite palavras genéricas ou preguiçosas ("get", "do", "go") a menos que sejam a melhor correspondência.
   - Antônimos: prefira opostos diretos do significado pretendido (ex: para "go drinking", prefira "stay sober").`

  const conjugationsInstruction = includeConjugations
    ? `6. CONJUGAÇÕES (Em Inglês Americano): Se "partOfSpeech" for "verb", forneça os 6 tempos verbais. Se NÃO for um verbo, defina "conjugations" como null.`
    : `6. CONJUGAÇÕES: Defina "conjugations" null.`

  const usageNoteInstruction = includeUsageNote
    ? `3b. NOTA DE USO (opcional): Seja EXTREMAMENTE DIDÁTICO, porém PRECISO e DIRETO AO PONTO (estilo flashcard, máximo absoluto de 2 frases curtas). 
   - SE A PALAVRA FOR UMA SIGLA (ex: CWQ), OBRIGATORIAMENTE escreva o que as letras significam em inglês.
   - Explique a essência do uso, nuance ou conceito técnico em PORTUGUÊS BRASILEIRO.
   - PROIBIDO usar introduções longas. Vá direto para a regra prática ou definição conceitual.
   - PROIBIDO dar "bronca" ou mencionar correções ortográficas/hífens errados que você ajustou no passo 1. Aja como se a palavra tivesse sido digitada perfeitamente.
   - Se a palavra não tiver nenhuma nuance especial e não for sigla, retorne "".`
    : `3b. NOTA DE USO: NÃO gere notas de uso. Sempre retorne "usageNote": "".`

  const alternativeFormsInstruction = includeAlternativeForms && !isCompoundOrAcronym
    ? `7. FORMAS ALTERNATIVAS (Derivações e Conversões): SEMPRE QUE POSSÍVEL, force a inclusão de até 2 formas derivadas ou de conversão de classe gramatical muito comuns no Inglês Americano. 
   - Exemplo prático: se o card for o verbo "run", busque listar o substantivo ("run" - a corrida) e um derivado ("runner" - o corredor, ou "runny" - escorrendo). Se for "use", traga "useful" e "usage".
IMPORTANTE:
   - TRAVA DE EXPRESSÕES: Se após a normalização (no passo 1) a sua palavra final contiver ESPAÇOS (ou seja, se transformou em uma "phrase"), ABORTE esta regra e retorne "alternativeForms": [] obrigatoriamente.
   - Tente atingir o máximo de 2 formas sempre que existirem derivações naturais.
   - A classe gramatical ("partOfSpeech") dessas alternativas DEVE ser diferente da classe principal do card.
   - A "word" deve ser a forma correta em INGLÊS. Pode ser a mesma palavra-raiz atuando em outra classe gramatical.
   - Forneça uma tradução concisa e natural EM PORTUGUÊS BRASILEIRO (OBRIGATÓRIO incluir o artigo se for substantivo, ex: "a elevação").
   - Evite meta-definições ("o ato de...").
   - Forneça uma frase de exemplo EM INGLÊS usando essa forma alternativa.`
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
1. NORMALIZAÇÃO (CORREÇÃO DE ERROS E HÍFEN - SILENCIOSA):
   - ERRO DE HÍFEN EM VERBOS/EXPRESSÕES: Se o usuário enviou verbos compostos, modais ou phrasal verbs com hífen indevido (ex: "look-forward-to", "rely-on", "should-have", "carry-out"), CORRIJA SILENCIOSAMENTE substituindo o hífen por um ESPAÇO em "normalizedWord" (ex: "look forward to", "rely on"). PROIBIDO juntar as palavras. NÃO comente sobre esse erro na Nota de Uso.
   - ERRO DE INFINITIVO: Se o usuário enviar "to-steer" ou "to steer", remova o "to" silenciosamente e normalize apenas para "steer".
   - HÍFEN CORRETO: Substantivos ou adjetivos que exigem hífen (ex: "make-up", "might-be") mantêm o hífen.
   - Siglas e termos compostos corretos (ex: "challenging water quality"): mantenha a forma original.
2. CLASSE GRAMATICAL ("partOfSpeech"): Classifique OBRIGATORIAMENTE a palavra usando APENAS as classes do JSON. 
   - Retorne "acronym" para siglas. 
   - Retorne "phrase" APENAS para expressões com mais de uma palavra SEPARADAS POR ESPAÇO (ex: "look forward to", "rely on", "should have"). Palavras ligadas por hífen NÃO são "phrase", classifique-as por sua função (geralmente "noun" ou "adjective").
3. Tradução em Português Brasileiro. Forneça exatamente 1 ou 2 traduções mais comuns e precisas em português, separadas por barra (/).
   - Prefira uma tradução neutra e padrão.
   - TRADUÇÃO TÉCNICA (ANTI-ROBÔ): Para expressões compostas e siglas técnicas, evite traduções literais palavra por palavra. Use jargão natural. Exemplo: não traduza "challenging" em contexto de engenharia como "desafiadora", prefira "adversa", "crítica" ou "fora do padrão".
   - IMPORTANTE (artigos): Se a classe gramatical for "noun" ou "phrase", SEMPRE inclua o artigo mais natural em português junto com a tradução (ex: "a proa", "o porto", "a qualidade"). Use "o/a" para singular e "os/as" para plural.
   - IMPORTANTE (evite meta-definições): NÃO traduza substantivos com explicações como "o ato de ..." / "a ação de ...".
${usageNoteInstruction}
${synonymsInstruction}
5. Uma frase de exemplo natural em INGLÊS AMERICANO.
${conjugationsInstruction}
${alternativeFormsInstruction}

Retorne um JSON com esta estrutura exata (MANTENHA AS CHAVES DO JSON EM INGLÊS):
{
  "normalizedWord": "a palavra",
  "partOfSpeech": "verb" | "noun" | "adjective" | "adverb" | "preposition" | "conjunction" | "interjection" | "phrase" | "acronym",
  "translation": "tradução em português (com artigo para substantivos)",
  "usageNote": "nota curta em português ou string vazia",
  "synonyms": [{"word": "synonym1", "type": "literal" | "figurative" | "slang"}],
  "antonyms": [{"word": "antonym1", "type": "literal" | "figurative" | "slang"}],
  "example": "Frase de exemplo em inglês.",
  "exampleTranslation": "Tradução natural da frase acima em Português Brasileiro.",
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
        ? `Gere dados de flashcard para a palavra/forma/sigla: "${word}". IMPORTANTE: Trate-a com o uso de "${targetPartOfSpeech}" e retorne "partOfSpeech" como "${targetPartOfSpeech}".`
        : `Gere dados de flashcard para a palavra/forma/sigla: "${word}"`,
    },
  ]

  return callOpenRouter<FlashcardAIResponse>(messages, model, {
    type: "json_object",
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
      : `Forneça até ${synonymsLevel} sinônimos e até ${synonymsLevel} antônimos em INGLÊS que correspondam ao sentido EXATO implícito pela tradução.`

  const alternativeFormsInstruction = includeAlternativeForms && !isCompoundOrAcronym
    ? `FORMAS ALTERNATIVAS (Derivações e Conversões): SEMPRE QUE POSSÍVEL, inclua até 2 formas derivadas ou de conversão de classe gramatical.
   - Tente atingir o máximo de 2 formas sempre que existirem derivações naturais.
   - A classe gramatical deve ser diferente da classe principal.
   - A palavra deve estar em INGLÊS. Forneça tradução natural em PORTUGUÊS BRASILEIRO (com artigo para substantivos) e um exemplo em INGLÊS.
   - Evite meta-definições ("o ato de...").`
    : `Sempre retorne "alternativeForms": [].`

  const usageNoteInstruction = includeUsageNote
    ? `NOTA DE USO (opcional): Seja EXTREMAMENTE DIDÁTICO, porém PRECISO e DIRETO AO PONTO (estilo flashcard, máximo absoluto de 2 frases curtas). 
   - SE A PALAVRA FOR UMA SIGLA, OBRIGATORIAMENTE escreva o que as letras significam em inglês.
   - Explique a essência do uso, nuance ou conceito em PORTUGUÊS BRASILEIRO.
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
- uma palavra, sigla ou termo em inglês
- uma classe gramatical fixa
- uma NOVA tradução em português escolhida pelo usuário

Sua tarefa:
- Mantenha a mesma palavra/sigla em inglês e a mesma classe gramatical.
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
  "exampleTranslation": "Tradução natural da frase acima em Português Brasileiro.",
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
