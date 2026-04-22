import type { Flashcard, GrammarExercise } from "./types"

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
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

async function callOpenRouter<T>(
  messages: OpenRouterMessage[],
  model: string = DEFAULT_AI_MODEL,
  responseFormat?: { type: "json_object" }
): Promise<T> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error("OPENROUTER_API_KEY não configurada no servidor.")

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
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

  if (data.usage) {
    const { prompt_tokens, completion_tokens, total_tokens } = data.usage
    console.log(
      `[OpenRouter] model=${model} | prompt=${prompt_tokens} completion=${completion_tokens} total=${total_tokens}`
    )
  }

  return JSON.parse(content) as T
}

// ── Flashcard Generator ───────────────────────────────────────────────────

export interface FlashcardAIResponse {
  normalizedWord: string
  partOfSpeech: string
  translation: string
  usageNote: string
  synonyms: { word: string; type: "literal" | "figurative" | "slang" }[]
  antonyms: { word: string; type: "literal" | "figurative" | "slang" }[]
  example: string
  exampleTranslation: string
  alternativeForms: { word: string; partOfSpeech: string; translation: string; example: string }[]
  _verbReasoning: string
  verbType: "regular" | "irregular" | null
  conjugations: {
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
  model: string = "openai/gpt-5.4-nano",
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
    : `6. CONJUGAÇÕES: Defina "conjugations" como null.`

  const usageNoteInstruction = includeUsageNote
    ? `3b. NOTA DE USO: Seja didático e direto ao ponto (máximo de 2 frases curtas).
   - SE A PALAVRA FOR UMA SIGLA (ex: CWQ), explique o que as letras significam em inglês.
   - SIGNIFICADOS SECUNDÁRIOS / NUANCES: Cite APENAS se houver uma diferença clara de tom (ex: formal vs informal) ou um significado completamente diferente que ficou de fora (ex: o verbo "to beam" também significa "sorrir radiante").
   - REGRA ANTIRREDUNDÂNCIA ABSOLUTA: Proibido explicar a tradução com sinônimos. Se o card diz "shipping" = "o embarque", não escreva "refere-se a enviar cargas". Se a tradução já é clara, NÃO invente explicações óbvias.
   - SEM META-COMENTÁRIOS: É PROIBIDO justificar escolhas (ex: "este card foca...").
   - Se não houver uma nuance real, gíria ou significado secundário útil, OBRIGATORIAMENTE retorne a string vazia: "".`
    : `3b. NOTA DE USO: NÃO gere notas de uso. Sempre retorne "usageNote": "".`

  // Prompt original agressivo e perfeito restaurado (só é ativado para palavras únicas)
  const alternativeFormsInstruction = includeAlternativeForms && !isCompoundOrAcronym
    ? `7. FORMAS ALTERNATIVAS (Derivações e Conversões): SEMPRE inclua até 2 formas derivadas ou de conversão de classe gramatical muito comuns no Inglês Americano.
   REGRA PRINCIPAL: Se o card é substantivo/adjetivo, uma das formas alternativas DEVE ser o verbo ("to dwarf", "to run") com tradução precisa. Se o card é verbo, inclua o substantivo e/ou adjetivo.
   - Exemplo: card "dwarf" (noun, "o anão") → alternativas: [{"word": "to dwarf", "partOfSpeech": "verb", "translation": "apequenar / ofuscar", "example": "The new building dwarfs the old church."}] e [{"word": "dwarfed", "partOfSpeech": "adjective", "translation": "apequenado / ofuscado", "example": "The dwarfed village sat beneath the mountain."}]
   - Exemplo: card "to dwarf" (verb) → alternativas: [{"word": "dwarf", "partOfSpeech": "noun", "translation": "o anão", "example": "The dwarf star emits less light."}]
     IMPORTANTE:
   - Tente atingir o máximo de 2 formas sempre que existirem derivações naturais.
   - Não fornecer formas alternativas para siglas ou acrônimos (ex: "CWQ") ou expressões compostas (ex: "challenging water quality").
   - A classe gramatical ("partOfSpeech") dessas alternativas DEVE ser diferente da classe principal do card.
   - Para verbos nas formas alternativas, use o infinitivo com "to" (ex: "to dwarf", "to run").
   - Forneça uma tradução concisa e natural EM PORTUGUÊS BRASILEIRO (OBRIGATÓRIO incluir o artigo definido se for substantivo).
   - Evite meta-definições ("o ato de...").
   - Forneça uma frase de exemplo EM INGLÊS usando essa forma alternativa.`
    : `7. FORMAS ALTERNATIVAS: NÃO gere formas alternativas. Sempre retorne "alternativeForms": [].`

  const efommInstruction = efommMode
    ? `MODO EFOMM (Foco Naval):
REGRA DE OURO — SÓ INTERVENHA SE HOUVER MUDANÇA DE SENTIDO:
1. Se a palavra já é naturalmente do universo marítimo (ex: shipping, vessel, sailor, cargo), trate-a como uma PALAVRA COMUM. Não crie nota de uso naval, pois o sentido já é óbvio. Deixe usageNote: "".
2. Só crie nota de uso se houver um "FALSO AMIGO" TÉCNICO (palavras que mudam de sentido no mar, ex: "beam", "bow", "draft", "head").
   - Se houver essa mudança: Tradução = Sentido Comum | Nota de Uso = Explique o sentido naval real sem usar introduções redundantes como "Em contexto marítimo". Vá direto ao jargão.
   - CERTO (para beam): "Na marinha, indica a largura máxima da embarcação (boca). No dia a dia, é um feixe ou viga."
   - ERRADO: "Em contexto marítimo, shipping é o transporte..." (Redundante).
3. TRADUÇÃO PRINCIPAL: Mantenha sempre a tradução civil/geral no campo "translation".
4. EXEMPLO: Sempre use uma temática naval na frase em "example".

REGRA CRÍTICA 2 — ISOLAMENTO DE CLASSE: É ESTRITAMENTE PROIBIDO cruzar informações de classes gramaticais. O card do verbo NUNCA fala do substantivo, e vice-versa.`
    : ``

  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: `Você é um professor sênior de Inglês Americano especializado em ensinar falantes nativos de Português Brasileiro.
Sua base de conhecimento é estritamente INGLÊS AMERICANO.

${efommInstruction}

Quando receber uma palavra em inglês, siga estes passos para gerar dados de estudo:
0. DETECÇÃO DE INTENÇÃO:
   - Se a entrada começar com "to " (ex: "to dwarf", "to run"), é OBRIGATORIAMENTE um VERBO. Normalize removendo "to" e use partOfSpeech "verb".
   - Se a entrada terminar em "-ed" (ex: "dwarfed", "eclipsed"), classifique como ADJETIVO (particípio adjetival). Normalize para a forma -ed (ex: "dwarfed"). Traduza como adjetivo ("apequenado / ofuscado"). O verbo correspondente ("to dwarf") deve aparecer em alternativeForms.
   - Se a entrada terminar em "-ing", decida se é:
     * um SUBSTANTIVO VERBAL (noun) nomeando um objeto/sistema/processo fixo (ex: "mooring", "rigging", "wiring"), ou
     * um GERÚNDIO / PARTICÍPIO PRESENTE (verb) expressando ação.
     Prefira "noun" APENAS quando a forma -ing comumente nomeia um objeto/sistema no uso técnico.
     Se a palavra-base já é um substantivo concreto no dicionário (ex: "dwarf" = anão), NÃO nominalize — trate o -ing como gerúndio (verb).
   - Se a entrada for apenas a palavra-base sem "to" (ex: "dwarf", "run"), escolha a classe gramatical mais comum/útil para estudo.
1. NORMALIZAÇÃO E SIGLAS:
   - Se a entrada for uma sigla ou um termo técnico composto (ex: "challenging water quality (cwq)"), mantenha a forma original ou a sigla principal em "normalizedWord".
   - Se decidir que é um verbo, NORMALIZE para a forma base/infinitivo (ex: "running" → "run", "dwarfed" → "dwarf").
   - Se decidir que é um substantivo verbal (-ing), mantenha como está.
2. CLASSE GRAMATICAL ("partOfSpeech"): Classifique OBRIGATORIAMENTE a palavra. Use "noun", "verb", "adjective", etc. Se for uma sigla ou uma expressão com várias palavras, classifique como "phrase" ou "acronym".
3. Tradução em Português Brasileiro. Forneça exatamente 1 ou 2 traduções mais comuns e COMPLETAS em português, separadas por barra (/).
   - Seja específico. Se a palavra é marítima (ex: "shipping"), prefira traduções precisas ("o embarque / a expedição").
   - Prefira a tradução do significado MAIS PRIMÁRIO e mais frequente. Se a palavra tiver significados muito distintos (ex: "beam" = feixe + sorrir; "to beam" = irradiar + sorrir), inclua APENAS o(s) sentido(s) principal(is) na tradução e remeta os secundários à usageNote. NUNCA sobrecarregue a tradução com todos os significados de uma vez.
   - EXPRESSÕES COMPOSTAS / TERMOS TÉCNICOS: NÃO traduza palavra por palavra na ordem do inglês. Reorganize a frase para soar natural e idiomática em português. Exemplo: "challenging water quality" → "a qualidade da água adversa" (NÃO "a qualidade desafiadora da água"). Adapte adjetivos e substantivos à ordem natural do português.
   - IMPORTANTE (artigos): Se a classe gramatical for "noun", "phrase" ou "acronym", SEMPRE use artigo DEFINIDO em português ("o", "a", "os", "as"). NUNCA use artigo indefinido ("um", "uma"). Ex: "o anão", "a proa", "o porto".
   - IMPORTANTE (evite meta-definições): NÃO traduza com explicações como "o ato de ...", "a ação de ...", "o fato de ...", "o processo de ...", "a superação ...", "tornar-se ...". Traduza pelo significado concreto e direto da palavra como ela existe no dicionário.
   - PRECISÃO SEMÂNTICA: Capture a nuance exata. Não use sinônimos genéricos ou imprecisos.
   - IMPORTANTE (tradução de siglas): se a palavra for uma sigla a tradução deve ser correspondnete, exemplo "OOW" a tradução seria "Oficial de Quarto" JAMAIS "o OOW / o OOW", 
     no entando o contexto deve ser a explicação do contexto deve ser completa, exemplo "OOW = Officer of the Watch. Refere-se à pessoa responsável pelo turno de vigilância/condução do navio" NÃO APENAS "OOW = Officer of the Watch."
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
VERBOS (verbType e conjugations):
   - 🛑 SE A CLASSE GRAMATICAL ("partOfSpeech") NÃO FOR VERBO (ex: noun, adjective): Você é OBRIGADO a definir "_verbReasoning" como "n/a", "verbType" como null, e "conjugations" ESTRITAMENTE como null. NUNCA gere tempos verbais para substantivos ou adjetivos!
   - Se FOR verbo, preencha "_verbReasoning" primeiro. Se terminar em -ed/-d (Yes), você DEVE definir "verbType": "regular". Se não (No - como cut, put, bought), você DEVE definir "verbType": "irregular".`,
    },
    {
      role: "user",
      content: targetPartOfSpeech
        ? `Gere dados de flashcard para a palavra/forma/sigla: "${word}". IMPORTANTE: Trate-a EXCLUSIVAMENTE como "${targetPartOfSpeech}". Use a forma de DICIONÁRIO (lema) correspondente a essa classe gramatical:
- Se "${targetPartOfSpeech}" for "noun" e a entrada for flexionada (ex: "dwarfed", "dwarfing"), volte à raiz ("dwarf" = o anão).
- Se "${targetPartOfSpeech}" for "verb", normalize para infinitivo ("dwarfed" → "dwarf") e traduza a ação ("apequenar / ofuscar").
- Se "${targetPartOfSpeech}" for "adjective" e a entrada for um particípio ("dwarfed"), traduza como adjetivo ("apequenado / ofuscado").
NÃO nominalize nem force derivações artificiais. Retorne "partOfSpeech" como "${targetPartOfSpeech}". As alternativeForms devem mostrar as OUTRAS classes gramaticais da mesma família.`
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
  model: string = "openai/gpt-5.4-nano"
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

// Prompt original agressivo e perfeito restaurado (só é ativado para palavras únicas)
  const alternativeFormsInstruction = includeAlternativeForms && !isCompoundOrAcronym
    ? `7. FORMAS ALTERNATIVAS (Derivações e Conversões): SEMPRE inclua até 2 formas derivadas ou de conversão de classe gramatical muito comuns no Inglês Americano.
   REGRA PRINCIPAL: Se o card é substantivo/adjetivo, uma das formas alternativas DEVE ser o verbo ("to dwarf", "to run") com tradução precisa. Se o card é verbo, inclua o substantivo e/ou adjetivo.
   - Exemplo: card "dwarf" (noun, "o anão") → alternativas: [{"word": "to dwarf", "partOfSpeech": "verb", "translation": "apequenar / ofuscar", "example": "The new building dwarfs the old church."}] e [{"word": "dwarfed", "partOfSpeech": "adjective", "translation": "apequenado / ofuscado", "example": "The dwarfed village sat beneath the mountain."}]
   - Exemplo: card "to dwarf" (verb) → alternativas: [{"word": "dwarf", "partOfSpeech": "noun", "translation": "o anão", "example": "The dwarf star emits less light."}]
IMPORTANTE:
   - Tente atingir o máximo de 2 formas sempre que existirem derivações naturais.
   - A classe gramatical ("partOfSpeech") dessas alternativas DEVE ser diferente da classe principal do card.
   - REGRA DE PARTICÍPIO: Para criar adjetivos derivados de verbos irregulares, use a forma correta do PARTICÍPIO PASSADO (ex: o adjetivo de "overcome" é "overcome", e NUNCA "overcame").
   - Para verbos nas formas alternativas, use o infinitivo com "to" (ex: "to dwarf", "to run").
   - Forneça uma tradução concisa e natural EM PORTUGUÊS BRASILEIRO (OBRIGATÓRIO incluir o artigo definido se for substantivo).
   - Evite meta-definições ("o ato de...").
   - Forneça uma frase de exemplo EM INGLÊS usando essa forma alternativa.`
    : `7. FORMAS ALTERNATIVAS: NÃO gere formas alternativas. Sempre retorne "alternativeForms": [].`

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

// ── Grammar Lab MCQ generator (EFOMM / EN / AFA style) ───────────────────────

export interface GrammarQuestionAIResponse {
  _thoughtProcess: string
  /** A 1-2 sentence context passage that anchors referents when the question tests articles,
   *  pronouns, or any rule where a decontextualized sentence would be grammatically ambiguous.
   *  null when the test sentences are fully self-contained and unambiguous on their own. */
  contextPassage: string | null
  questionText: string
  options: { letter: "A" | "B" | "C" | "D" | "E"; text: string; isAnswer: boolean; explanation: string }[]
}

export async function generateGrammarQuestion(
  topicLabel: string,
  subtopics: string[],
  questionType: "correct" | "incorrect",
  model: string,
  userWords?: string[]
): Promise<GrammarQuestionAIResponse> {

  const tagLine =
    subtopics.length > 0
      ? subtopics.map((s) => `${topicLabel} › ${s}`).join(" + ")
      : topicLabel

  const isBlended = subtopics.length > 1

  const wordHint =
    userWords && userWords.length > 0
      ? `\nVOCABULARY INTEGRATION: You are provided with words the student knows: [ ${userWords.slice(0, 8).join(", ")} ]. You may use them, BUT NEVER force them if it makes the sentence sound absurd or distracts from the grammatical rule being tested.`
      : ""

  const blendDirective = isBlended
    ? `\n══ BLENDED QUESTION GUIDANCE ═══════════════════════════════════════\nThis question should naturally touch on two grammar areas:\n  PRIMARY TAG:   ${subtopics[0]}\n  SECONDARY TAG: ${subtopics[1]}\n\n- Treat the PRIMARY TAG as the main focus. The question and its key distractor must clearly test it.\n- The SECONDARY TAG should appear organically in the sentence context — only if it fits naturally. Never force both tags into every option.\n- If incorporating the secondary tag would make any sentence sound contrived or unnatural, simply let it appear in 1-2 options where it fits.\n- Explanations should mention both rules only when both genuinely appear in that option.\n═══════════════════════════════════════════════════════════════════`
    : ""

  const typeInstruction =
    questionType === "correct"
      ? `Question type: CORRECT — the student must identify the ONE grammatically correct option.\nThe other four options MUST each contain a different, unambiguous grammatical error directly related to the tag(s) "${tagLine}".\nPhrasing examples: "Choose the CORRECT sentence:", "Choose the grammatically correct alternative:"`
      : `Question type: INCORRECT — the student must identify the ONE option that contains a grammatical error directly related to the tag(s) "${tagLine}".\nThe other four options MUST be completely and unambiguously grammatically correct.\nPhrasing examples: "Choose the sentence with the INCORRECT use of ...", "Choose the option that is NOT grammatically correct:"`

  // Os exemplos servem apenas para mostrar o FORMATO. A IA vai aplicar a LÓGICA a qualquer tag.
  const fewShotExample =
    questionType === "incorrect"
      ? `
EXAMPLE (tag: Nominal › Countable vs Uncountable nouns):
{
  "_thoughtProcess": "1. RULE RETRIEVAL: Uncountable nouns cannot take plural 's'. 2. CONTEXT DECISION: The sentences are self-evidently wrong/right regardless of context — 'breads' is structurally impossible. contextPassage: null. 3. PLAN CORRECT OPTIONS: 4 sentences using uncountables correctly. 4. PLAN INCORRECT OPTION: Add 's' to 'bread'. 5. VERIFICATION: One error, coherent.",
  "contextPassage": null,
  "questionText": "Choose the sentence with the INCORRECT use of countable or uncountable nouns:",
  "options": [
    { "letter": "A", "text": "Breads are sold fresh every morning at the bakery.", "isAnswer": true, "explanation": "Incorreta: 'Bread' é incontável em inglês e não admite plural com 's'. O correto seria 'Bread is sold...' ou 'Loaves of bread are sold...'." },
    { "letter": "B", "text": "The ship carried four hundred passengers on board.", "isAnswer": false, "explanation": "Correta: Com numerais exatos, 'hundred' não vai para o plural (four hundred, não four hundreds)." },
    { "letter": "C", "text": "He has a lot of knowledge about maritime engineering.", "isAnswer": false, "explanation": "Correta: 'Knowledge' é incontável e está usado corretamente no singular." },
    { "letter": "D", "text": "Could you give me some information about the schedule?", "isAnswer": false, "explanation": "Correta: 'Information' é incontável e está usado corretamente com 'some'." },
    { "letter": "E", "text": "I would like to buy three dozen eggs, please.", "isAnswer": false, "explanation": "Correta: 'Dozen' não recebe 's' quando precedido por um numeral específico." }
  ]
}`
      : `
EXAMPLE (tag: Conditionals › Third Conditional):
{
  "_thoughtProcess": "1. RULE RETRIEVAL: Third Conditional = If + Past Perfect, would have + Past Participle. 2. CONTEXT DECISION: Conditional sentences are self-contained; no article ambiguity. contextPassage: null. 3. PLAN CORRECT OPTION: Perfect structure. 4. PLAN INCORRECT OPTIONS: Mix wrong tenses in if-clause or main clause. 5. VERIFICATION: One correct, coherent.",
  "contextPassage": null,
  "questionText": "Choose the grammatically CORRECT sentence:",
  "options": [
    { "letter": "A", "text": "If I would have known the answer, I would have told you.", "isAnswer": false, "explanation": "Incorreta: Na oração com 'If' da 3ª condicional, usa-se o Past Perfect (If I had known), e não 'would have'." },
    { "letter": "B", "text": "If the captain had seen the storm, he had changed course.", "isAnswer": false, "explanation": "Incorreta: A oração principal exige 'would have + particípio' (would have changed), não o Past Perfect de novo." },
    { "letter": "C", "text": "She would have arrived on time if she caught the earlier bus.", "isAnswer": false, "explanation": "Incorreta: A oração do 'if' exige Past Perfect (had caught), não o Simple Past." },
    { "letter": "D", "text": "If we had checked the engine, the ship would not have broken down.", "isAnswer": true, "explanation": "Correta: Estrutura perfeita da 3ª condicional (If + Past Perfect -> would have + Particípio)." },
    { "letter": "E", "text": "If they have sent the signal, we would have rescued them.", "isAnswer": false, "explanation": "Incorreta: Uso do Present Perfect ('have sent'). Na 3ª condicional, usa-se o Past Perfect ('had sent')." }
  ]
}`

  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: `You are an expert English grammar exam question writer for Brazilian military entrance exams (EFOMM, EN, AFA).
Methodological reference: Raymond Murphy "English Grammar in Use".
Return ONLY valid JSON.

══ CRITICAL RULES (UNIVERSAL ANTI-HALLUCINATION FRAMEWORK) ════════════════
Follow this exact sequence in "_thoughtProcess" before generating the question:

Step 1. RULE RETRIEVAL
  State the formal prescriptive grammar rule from Murphy's Grammar for each tag.

Step 2. CONTEXT DECISION
  Would any of your sentences be grammatically valid in a different context?
  If YES (e.g. "a" vs "the" depends on prior mention, pronoun needs an antecedent) → write a 1-2 sentence contextPassage that anchors the meaning. Set "contextPassage" to that text.
  If NO (structural errors that are wrong in every context) → set "contextPassage": null.

Step 3. DISTRACTOR SAFETY TEST — THE MOST IMPORTANT STEP
  For each planned distractor, ask: "Could a competent English speaker defend this sentence as grammatically correct in any reasonable context?"
  → If YES: DISCARD that distractor and write a new one with a clearer structural error.
  → Borderline cases that are merely UNUSUAL, UNCOMMON, or STYLISTICALLY AWKWARD are NOT valid distractors. An error must be structurally FORBIDDEN by prescriptive grammar rules.
  KNOWN DANGEROUS PATTERNS TO AVOID:
  • Adjective order with only 2-3 adjectives where native speakers regularly vary sequence (e.g. "pretty silent" vs "silent pretty" — both can be acceptable depending on interpretation of "pretty" as adverb vs adjective of opinion)
  • "a" vs "the" without contextPassage
  • Adverb placement in positions that are non-standard but not forbidden
  • Sentences where the error only exists because you invented a specific scenario

Step 4. PLAN CORRECT OPTION
  Write the correct sentence. Verify it is unambiguously correct in ALL contexts.

Step 5. VERIFICATION
  - Exactly ONE isAnswer: true
  - Every distractor has a clear, citable prescriptive rule violation
  - No distractor can be defended by invoking a different-but-valid context
  - Time markers and adverbs are logically coherent

══ contextPassage RULES ═══════════════════════════════════════════════════
USE when: any article (the/a/an/zero), pronoun reference, or specific-vs-generic noun is tested.
SKIP when: the error is purely structural (wrong tense, missing auxiliary, subject-verb disagreement, forbidden preposition).
Write it as 1-2 natural sentences from a naval/academic context. Max 40 words.

Only after completing this thought process, generate the JSON.
═══════════════════════════════════════════════════════════════════════════${blendDirective}`,
    },
    {
      role: "user",
      content: `Create ONE grammar multiple-choice question.

Tag(s): ${tagLine}
${typeInstruction}
${wordHint}

Requirements:
- Exactly 5 options labelled A, B, C, D, E.
- Difficulty: medium-to-high (military entrance exam standard).
- Distractors must use classic EFOMM/EN/AFA pitfalls specifically relevant to the tag(s).
- Each "explanation" in pt-BR must name every grammar rule at play in that option (all tags it touches).

${fewShotExample}

Now generate the JSON for the requested tag(s), starting with the 5-step _thoughtProcess. The JSON must include "contextPassage" (string or null):`
    },
  ]

  return callOpenRouter<GrammarQuestionAIResponse>(messages, model, {
    type: "json_object",
  })
}

// ── Grammar Lab: Revisor (Evaluator step) ────────────────────────────────────

interface GrammarReviewerResponse {
  status?: "APPROVED" | "FIXED" // Tornamos opcional caso a IA o omita
  question?: GrammarQuestionAIResponse // A estrutura esperada
  options?: any[] // Para detetar se a IA retornou a questão diretamente na raiz
  _thoughtProcess?: string
  questionText?: string
}

export async function evaluateGrammarQuestion(
  question: GrammarQuestionAIResponse,
  questionType: "correct" | "incorrect",
  topicLabel: string,
  model: string = process.env.REVISOR_AI_MODEL || "openai/gpt-4o-mini"
): Promise<GrammarQuestionAIResponse> {
  const answerOption = question.options.find((o) => o.isAnswer === true || String(o.isAnswer) === "true")
  const answerLetter = answerOption?.letter ?? question.options[0]?.letter ?? "?"

  // 1. CORREÇÃO DA LÓGICA DE SABOTAGEM
  const typeDescription =
    questionType === "correct"
      ? `CORRECT — The ONE 'isAnswer': true option MUST have PERFECT English grammar. The other 4 (distractors) MUST have clear grammatical errors. DO NOT fix the errors in the 4 distractors!`
      : `INCORRECT — The ONE 'isAnswer': true option MUST CONTAIN A GRAMMATICAL ERROR. DO NOT fix the grammar of the 'isAnswer': true option! The other 4 (distractors) MUST have PERFECT English grammar.`

  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: `You are an implacable grammar auditor for Brazilian military entrance exams (EFOMM, EN, AFA).
You receive a JSON grammar question produced by a generator AI. Your job is silent correction.

══ AUDIT CHECKLIST ════════════════════════════════════════════════════════

1. ANSWER LOGIC (CRITICAL)
   Question Type is: "${questionType}"
   ${typeDescription}

2. DISTRACTOR INCONTESTABILITY
   For options that are supposed to have errors, ensure the error is STRUCTURAL and UNDENIABLE.
   For options that are supposed to be perfect, ensure they don't contain accidental slang, wrong prepositions, or bad adjective order.

3. EXPLANATION QUALITY
   Each explanation must be ONE objective, technical sentence in pt-BR.
   ✗ BANNED PHRASES: "o gabarito original", "Corrigido:", "A IA errou", "Na verdade..."
   Start the explanation directly (e.g., "Incorreta: O verbo exige...", "Correta: A estrutura...").

4. JSON TYPES (CRITICAL)
   "isAnswer" MUST be a strict boolean (true or false). NO STRINGS like "true".

══ OUTPUT FORMAT ══════════════════════════════════════════════════════════
Return ONLY valid JSON.
{
  "status": "APPROVED" | "FIXED",
  "question": {
    "_thoughtProcess": "One short line per option: letter | verdict (OK/FIXED) | reason",
    "contextPassage": "string or null",
    "questionText": "string",
    "options": [
      { "letter": "A", "text": "string", "isAnswer": false, "explanation": "string" },
      { ... }
    ]
  }
}`,
    },
    {
      role: "user",
      content: `Question type: "${questionType}"
Topic: "${topicLabel}"
Original Answer letter: "${answerLetter}"

Audit and return the JSON:
${JSON.stringify(question, null, 2)}`,
    },
  ]

  console.log(`[Revisor] model=${model} | auditing question (type=${questionType}, answer=${answerLetter})`)

  const result = await callOpenRouter<GrammarReviewerResponse>(messages, model, {
    type: "json_object",
  })

  console.log(`[Revisor] status=${result.status || "OMITTED_BY_AI"}`)

  // 2. CORREÇÃO DO BUG DE JSON ANINHADO (FALLBACK)
  let reviewed: GrammarQuestionAIResponse;
  
  if (result.question && result.question.options) {
    reviewed = result.question; // A IA seguiu a regra da "capa"
  } else if (result.options) {
    reviewed = result as unknown as GrammarQuestionAIResponse; // A IA ignorou a "capa" e retornou a questão direto
  } else {
    console.error("[Revisor] Failed to parse reviewer response, falling back to original question.");
    return question; // Falha segura: devolve a original em vez de estourar erro 500 no app
  }

  // 3. CORREÇÃO DA SÍNDROME DA STRING E NORMALIZAÇÃO
  reviewed.options = reviewed.options.map(o => ({
    ...o,
    // Força a conversão para boolean real, mesmo que a IA mande string "true"
    isAnswer: o.isAnswer === true || String(o.isAnswer).toLowerCase() === "true"
  }));

  const confirmedAnswers = reviewed.options.filter((o) => o.isAnswer === true)
  
  if (confirmedAnswers.length !== 1) {
    console.warn(`[Revisor] Detected ${confirmedAnswers.length} answers. Enforcing single answer.`)
    const sole =
      confirmedAnswers[0] ??
      reviewed.options.find((o) => o.letter === answerLetter) ??
      reviewed.options[0]
      
    reviewed.options = reviewed.options.map((o) => ({
      ...o,
      isAnswer: o.letter === sole?.letter,
    }))
  }

  return reviewed
}