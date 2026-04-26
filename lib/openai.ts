import type { Flashcard, GrammarExercise, GrammarQuestionOption } from "./types"

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
export const DEFAULT_AI_MODEL = process.env.DEFAULT_AI_MODEL ?? "openai/gpt-5.4-nano"
export const GRAMMAR_AI_MODEL = process.env.GRAMMAR_AI_MODEL ?? DEFAULT_AI_MODEL
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

function normalizeInlineWhitespace(value: unknown): string {
  return asTrimmedString(value).replace(/\s+/g, " ")
}

function normalizeTranslationText(value: unknown): string {
  const normalized = normalizeInlineWhitespace(value)
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!normalized.includes("/")) return normalized

  return normalized
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(" / ")
}

function pickPrimaryTranslation(value: string): string {
  const chunks = normalizeTranslationText(value)
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean)

  return chunks[0] ?? ""
}

function isAcronymCandidate(value: string): boolean {
  const token = normalizeInlineWhitespace(value)
  if (!/^[A-Za-z]{2,8}$/.test(token)) return false

  const lower = token.toLowerCase()
  const vowels = (lower.match(/[aeiou]/g) ?? []).length
  const hasTripleConsonant = /[bcdfghjklmnpqrstvwxyz]{3,}/i.test(token)

  // Strong signal for lowercase acronyms such as oow, eta, bwms.
  return vowels <= 2 || hasTripleConsonant
}

function inferPartOfSpeechWithAcronymFallback(params: {
  originalWord: string
  normalizedWord: string
  rawPartOfSpeech: string
  translation: string
  usageNote: string
}): { partOfSpeech: string; normalizedWord: string } {
  const rawPos = normalizePartOfSpeech(params.rawPartOfSpeech)
  const candidate = normalizeInlineWhitespace(params.originalWord)

  if (rawPos === "acronym") {
    return {
      partOfSpeech: "acronym",
      normalizedWord: normalizeInlineWhitespace(params.normalizedWord || candidate).toUpperCase(),
    }
  }

  const note = normalizeInlineWhitespace(params.usageNote).toLowerCase()
  const translation = normalizeInlineWhitespace(params.translation).toLowerCase()
  const hasAcronymSignal = /(sigla|acr[oô]nimo|stands for|abrevia[cç][aã]o|abreviação)/i.test(note + " " + translation)

  if (!isAcronymCandidate(candidate) || !hasAcronymSignal) {
    return {
      partOfSpeech: rawPos,
      normalizedWord: normalizeInlineWhitespace(params.normalizedWord || candidate),
    }
  }

  return {
    partOfSpeech: "acronym",
    normalizedWord: candidate.toUpperCase(),
  }
}

function normalizeTranslationByPreference(value: unknown, includeMultipleTranslations: boolean): string {
  const normalized = normalizeTranslationText(value)
  if (!normalized.includes("/")) return normalized

  const chunks = normalized
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean)

  if (chunks.length === 0) return ""

  if (!includeMultipleTranslations) {
    return chunks[0]
  }

  return chunks.slice(0, 2).join(" / ")
}

function isLikelyPtBrAdverbialChunk(value: string): boolean {
  const chunk = normalizeInlineWhitespace(value).toLowerCase()
  if (!chunk) return false

  const exactAdverbials = new Set([
    "bem",
    "bastante",
    "muito",
    "muito bem",
    "totalmente",
    "completamente",
    "relativamente",
    "um tanto",
    "moderadamente",
    "antes",
    "preferencialmente",
  ])

  if (exactAdverbials.has(chunk)) return true

  return /(mente)$/.test(chunk)
}

function guessPtBrTranslationKind(value: string):
  | "verb"
  | "noun_or_phrase"
  | "adverb"
  | "preposition"
  | "conjunction"
  | "interjection"
  | "adjective"
  | "unknown" {
  const chunk = normalizeInlineWhitespace(value).toLowerCase()
  if (!chunk) return "unknown"

  const prepositions = new Set([
    "a",
    "ante",
    "após",
    "ate",
    "até",
    "com",
    "contra",
    "de",
    "desde",
    "em",
    "entre",
    "para",
    "per",
    "perante",
    "por",
    "sem",
    "sob",
    "sobre",
    "tras",
    "trás",
  ])

  const conjunctions = new Set([
    "e",
    "ou",
    "mas",
    "porque",
    "pois",
    "porem",
    "porém",
    "entretanto",
    "todavia",
    "logo",
    "portanto",
    "que",
    "se",
    "quando",
    "embora",
  ])

  const interjections = new Set([
    "ola",
    "olá",
    "opa",
    "ei",
    "uau",
    "ah",
    "oh",
    "nossa",
    "poxa",
    "ixi",
    "viva",
  ])

  if (prepositions.has(chunk)) return "preposition"
  if (conjunctions.has(chunk)) return "conjunction"
  if (interjections.has(chunk)) return "interjection"
  if (isLikelyPtBrAdverbialChunk(chunk)) return "adverb"

  if (/\b\w+(ar|er|ir)\b/.test(chunk) && !/\s/.test(chunk)) {
    return "verb"
  }

  if (/^(o|a|os|as|um|uma|uns|umas)\b/.test(chunk) || /\s/.test(chunk)) {
    return "noun_or_phrase"
  }

  return "adjective"
}

function isTranslationKindCompatibleWithPartOfSpeech(kind: string, partOfSpeech: string): boolean {
  if (partOfSpeech === "verb") return kind === "verb"
  if (partOfSpeech === "adverb") return kind === "adverb"
  if (partOfSpeech === "preposition") return kind === "preposition"
  if (partOfSpeech === "conjunction") return kind === "conjunction"
  if (partOfSpeech === "interjection") return kind === "interjection"
  if (partOfSpeech === "noun") return kind === "noun_or_phrase"
  if (partOfSpeech === "phrase" || partOfSpeech === "acronym") {
    return kind === "noun_or_phrase" || kind === "adjective" || kind === "unknown"
  }

  // adjective (default): avoid obvious non-adjective chunks.
  if (partOfSpeech === "adjective") {
    return kind === "adjective" || kind === "noun_or_phrase" || kind === "unknown"
  }

  return true
}

function normalizeTranslationByPartOfSpeech(
  value: unknown,
  includeMultipleTranslations: boolean,
  partOfSpeech: string
): string {
  const normalized = normalizeTranslationText(value)
  if (!normalized.includes("/")) return normalized

  const chunks = normalized
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, arr) => arr.findIndex((x) => x.toLowerCase() === item.toLowerCase()) === index)

  if (chunks.length === 0) return ""

  const compatibleChunks = chunks.filter((chunk) => {
    const kind = guessPtBrTranslationKind(chunk)
    return isTranslationKindCompatibleWithPartOfSpeech(kind, partOfSpeech)
  })

  const selected = compatibleChunks.length > 0 ? compatibleChunks : chunks

  const ranked = [...selected].sort((a, b) => {
    const scoreA = scoreTranslationChunkByPartOfSpeech(a, partOfSpeech)
    const scoreB = scoreTranslationChunkByPartOfSpeech(b, partOfSpeech)
    if (scoreA === scoreB) {
      // Keep the model order when confidence ties.
      return selected.indexOf(a) - selected.indexOf(b)
    }
    return scoreB - scoreA
  })

  // Never force 2 translations: include up to two only when there are two coherent options.
  if (partOfSpeech === "acronym") return ranked[0]
  if (!includeMultipleTranslations) return ranked[0]
  return ranked.slice(0, 2).join(" / ")
}

function scoreTranslationChunkByPartOfSpeech(chunk: string, partOfSpeech: string): number {
  const normalized = normalizeInlineWhitespace(chunk).toLowerCase()
  if (!normalized) return -100

  const startsWithConjunctionPattern = /^(antes que|desde que|para que|a fim de que|de modo que|contanto que|caso|embora)\b/.test(normalized)
  const preferenceAdverbials = /(em vez de|ao inv[eé]s de|de prefer[eê]ncia|preferencialmente|um tanto|bastante)/.test(
    normalized
  )

  let score = 0

  if (partOfSpeech === "adverb") {
    if (isLikelyPtBrAdverbialChunk(normalized)) score += 3
    if (preferenceAdverbials) score += 4
    if (startsWithConjunctionPattern) score -= 4
  }

  if (partOfSpeech === "conjunction") {
    if (startsWithConjunctionPattern) score += 4
    if (isLikelyPtBrAdverbialChunk(normalized)) score -= 2
  }

  if (partOfSpeech === "verb") {
    if (/\b\w+(ar|er|ir)\b/.test(normalized) && !/\s/.test(normalized)) score += 3
  }

  if (partOfSpeech === "preposition") {
    if (/^(a|ante|ap[oó]s|ate|at[eé]|com|contra|de|desde|em|entre|para|per|perante|por|sem|sob|sobre|tras|tr[aá]s)$/.test(normalized)) {
      score += 3
    }
  }

  return score
}

function normalizePtBrOrthography(value: unknown): string {
  let text = normalizeInlineWhitespace(value)
  if (!text) return ""

  const replacements: Array<[RegExp, string]> = [
    [/\bidéia\b/gi, "ideia"],
    [/\bidéias\b/gi, "ideias"],
    [/\bassembléia\b/gi, "assembleia"],
    [/\bassembléias\b/gi, "assembleias"],
    [/\bplatéia\b/gi, "plateia"],
    [/\bheróico\b/gi, "heroico"],
    [/\bheróicos\b/gi, "heroicos"],
    [/\bjóia\b/gi, "joia"],
    [/\bjóias\b/gi, "joias"],
    [/\bparanóia\b/gi, "paranoia"],
    [/\bparanóias\b/gi, "paranoias"],
    [/\bbóia\b/gi, "boia"],
    [/\bbóias\b/gi, "boias"],
    [/\bjibóia\b/gi, "jiboia"],
    [/\bjibóias\b/gi, "jiboias"],
    [/\bvôo\b/gi, "voo"],
    [/\bvôos\b/gi, "voos"],
    [/\benjôo\b/gi, "enjoo"],
    [/\benjôos\b/gi, "enjoos"],
    [/\bcrêem\b/gi, "creem"],
    [/\bdêem\b/gi, "deem"],
    [/\blêem\b/gi, "leem"],
    [/\bvêem\b/gi, "veem"],
    [/\bpára\b/gi, "para"],
  ]

  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement)
  }

  // Remove trema remnants from pre-accord spellings in PT-BR text.
  text = text.replace(/ü/g, "u").replace(/Ü/g, "U")

  return text
}

function normalizePtBrOrthographyMultiline(value: unknown): string {
  const raw = asTrimmedString(value)
  if (!raw) return ""

  const normalizedLines = raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => normalizeInlineWhitespace(line))
    .filter(Boolean)

  const normalized = normalizePtBrOrthography(normalizedLines.join("\n")).replace(/\s*\n\s*/g, "\n")

  // If the model returns block labels in a single line, force line breaks before each label.
  const labelPatterns = [
    "Uso principal",
    "Principais usos",
    "Preferencia",
    "Preferência",
    "Contraste",
    "Nuance",
    "Estrutura comum",
    "Estrutura",
    "Intensificador",
    "Atenuador",
    "Preferencia / Alternativa",
    "Preferência / Alternativa",
    "Como Adjetivo",
    "Como Adverbio",
    "Como Advérbio",
    "Como Substantivo",
    "Como Verbo",
  ]

  let withBreaks = normalized
  for (const label of labelPatterns) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const regex = new RegExp(`\\s+(${escapedLabel}:)`, "gi")
    withBreaks = withBreaks.replace(regex, "\n$1")
  }

  return withBreaks
}

function getUsagePrimaryLabel(partOfSpeech: string): string {
  switch (partOfSpeech) {
    case "verb":
      return "Como Verbo"
    case "noun":
      return "Como Substantivo"
    case "adjective":
      return "Como Adjetivo"
    case "adverb":
      return "Como Advérbio"
    case "preposition":
      return "Como Preposição"
    case "conjunction":
      return "Como Conjunção"
    case "interjection":
      return "Como Interjeição"
    case "phrase":
      return "Como Expressão"
    case "acronym":
      return "Como Sigla"
    default:
      return "Uso principal"
  }
}

function stripLeadingConjunction(value: string): string {
  return value.replace(/^(mas|por[eé]m|entretanto|todavia|s[oó] que)\b[\s,:-]*/i, "")
}

function normalizeUsageSentence(value: string): string {
  let text = normalizeInlineWhitespace(value)
  if (!text) return ""

  text = stripLeadingConjunction(text)
  text = text
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/,\./g, ".")
    .replace(/\.\,+/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/\s{2,}/g, " ")
    .trim()

  return text.replace(/[.!?]$/, "").trim()
}

function normalizeUsageNoteByPartOfSpeech(value: unknown, partOfSpeech: string): string {
  const raw = normalizePtBrOrthographyMultiline(value)
  if (!raw) return ""

  const cleaned = raw
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()

  const primaryLabel = getUsagePrimaryLabel(partOfSpeech)

  // If model already returned labeled blocks, keep them but normalize line breaks and whitespace.
  if (/:/.test(cleaned) && /(como|uso|nuance|estrutura|intensificador|atenuador|prefer[eê]ncia|contraste)/i.test(cleaned)) {
    const rawBlocks = cleaned
      .replace(/\s+([A-Za-zÀ-ÿ][^:\n]{2,40}:)/g, "\n$1")
      .split("\n")
      .map((line) => normalizeInlineWhitespace(line))
      .filter(Boolean)
      .slice(0, 5)

    const blocks: string[] = rawBlocks.map((line) => {
      const labelMatch = line.match(/^([^:]{2,40}):\s*(.+)$/)
      if (!labelMatch) return normalizeUsageSentence(line)

      const label = normalizeInlineWhitespace(labelMatch[1])
      const content = normalizeUsageSentence(labelMatch[2])
      const lowerLabel = label.toLowerCase()
      const isPrimary =
        lowerLabel === primaryLabel.toLowerCase() ||
        lowerLabel === "uso principal" ||
        lowerLabel === "principal"

      // First line should not duplicate the card tag label.
      return isPrimary ? content : `${label}: ${content}`
    }).filter(Boolean)

    if (blocks.length > 0) return blocks.join("\n")
  }

  const normalizedForSplit = cleaned
    .replace(/\s+(Mas|Por[eé]m|Tamb[eé]m|Em fala|No uso informal|Na fala)\b/gi, ". $1")
    .replace(/\.+/g, ".")

  const sentences = normalizedForSplit
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)

  if (sentences.length === 0) return ""

  const lines: string[] = []
  lines.push(`${normalizeUsageSentence(sentences[0])}.`)

  if (sentences[1]) {
    lines.push(`Nuance: ${normalizeUsageSentence(sentences[1])}.`)
  }

  if (sentences[2]) {
    lines.push(`Estrutura comum: ${normalizeUsageSentence(sentences[2])}.`)
  }

  return lines.slice(0, 3).join("\n")
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
      const word = normalizeInlineWhitespace(value?.word)
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

const DERIVATIONAL_SUFFIXES = [
  "ly",
  "ness",
  "ment",
  "tion",
  "sion",
  "ity",
  "al",
  "ial",
  "ic",
  "ical",
  "ous",
  "ive",
  "able",
  "ible",
  "ful",
  "less",
  "er",
  "est",
  "ed",
  "ing",
  "ise",
  "ize",
  "ify",
  "ism",
  "ist",
] as const

function buildDerivationalStems(word: string): string[] {
  const lower = normalizeInlineWhitespace(word).toLowerCase()
  if (!lower) return []

  const stems = new Set<string>()
  stems.add(lower)

  if (lower.endsWith("y") && lower.length > 3) {
    stems.add(lower.slice(0, -1))
    stems.add(`${lower.slice(0, -1)}i`)
  }

  if (lower.endsWith("e") && lower.length > 3) {
    stems.add(lower.slice(0, -1))
  }

  for (const suffix of ["ly", "er", "est", "ed", "ing"]) {
    if (lower.endsWith(suffix) && lower.length > suffix.length + 2) {
      stems.add(lower.slice(0, -suffix.length))
    }
  }

  return [...stems].filter((stem) => stem.length >= 3)
}

function isLikelyDerivation(mainWord: string, candidateWord: string): boolean {
  const main = normalizeInlineWhitespace(mainWord).toLowerCase()
  const candidate = normalizeInlineWhitespace(candidateWord).toLowerCase()
  if (!main || !candidate) return false
  if (main === candidate) return false

  const lengthDiff = Math.abs(candidate.length - main.length)
  if (lengthDiff <= 1 && !candidate.startsWith(main) && !main.startsWith(candidate)) {
    return false
  }

  if (candidate.startsWith(main)) {
    const suffix = candidate.slice(main.length)
    return DERIVATIONAL_SUFFIXES.includes(suffix as (typeof DERIVATIONAL_SUFFIXES)[number])
  }

  const stems = buildDerivationalStems(main)
  for (const stem of stems) {
    if (!candidate.includes(stem)) continue

    if (candidate.startsWith(stem)) {
      const suffix = candidate.slice(stem.length)
      if (DERIVATIONAL_SUFFIXES.includes(suffix as (typeof DERIVATIONAL_SUFFIXES)[number])) {
        return true
      }
    }

    if (candidate.endsWith(stem)) {
      const prefix = candidate.slice(0, candidate.length - stem.length)
      if (prefix === "un" || prefix === "in" || prefix === "im" || prefix === "dis" || prefix === "non") {
        return true
      }
    }
  }

  return false
}

function normalizeAlternativeForms(
  raw: unknown,
  mainWord: string,
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
      const word = normalizeInlineWhitespace(value?.word)
      const partOfSpeech = normalizePartOfSpeech(value?.partOfSpeech)
      const translation = normalizeTranslationText(value?.translation)
      const example = normalizeInlineWhitespace(value?.example)
      const isSameWord = word.toLowerCase() === mainWord.toLowerCase()

      if (!word || !translation || !example) return null
      if (isSameWord && partOfSpeech === mainPartOfSpeech) return null
      if (word.includes(" ")) return null
      if (partOfSpeech === "phrase" || partOfSpeech === "acronym") return null
      if (!isSameWord && !isLikelyDerivation(mainWord, word)) return null

      return {
        word,
        partOfSpeech,
        translation: normalizePtBrOrthography(translation),
        example,
      }
    })
    .filter(
      (
        item
      ): item is { word: string; partOfSpeech: string; translation: string; example: string } => Boolean(item)
    )
    .filter((item) => {
      const key = `${item.word.toLowerCase()}::${item.partOfSpeech}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

  const preferred = normalized.filter((item) => item.partOfSpeech !== mainPartOfSpeech)
  if (preferred.length > 0) {
    return preferred.slice(0, 2)
  }

  // Fallback: if model missed POS conversion but produced real derivations, keep them.
  return normalized.slice(0, 2)
}

function normalizeConjugations(raw: unknown): FlashcardAIResponse["conjugations"] {
  if (!raw || typeof raw !== "object") return null
  const value = raw as Partial<NonNullable<FlashcardAIResponse["conjugations"]>>

  const simplePresent = normalizeSimplePresentConjugation(asTrimmedString(value.simplePresent))
  const simplePast = asTrimmedString(value.simplePast)
  const presentContinuous = normalizePresentContinuousConjugation(asTrimmedString(value.presentContinuous))
  const pastContinuous = asTrimmedString(value.pastContinuous)
  const presentPerfect = normalizePresentPerfectConjugation(asTrimmedString(value.presentPerfect))
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

function toThirdPersonSingular(baseVerb: string): string {
  const base = baseVerb.toLowerCase().trim()
  if (!base) return ""

  const irregularMap: Record<string, string> = {
    be: "is",
    have: "has",
    do: "does",
    go: "goes",
  }

  if (irregularMap[base]) return irregularMap[base]
  if (/(s|x|z|ch|sh|o)$/.test(base)) return `${base}es`
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ies`
  return `${base}s`
}

function normalizeSimplePresentConjugation(value: string): string {
  const normalized = normalizeInlineWhitespace(value)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(I|you|we|they|he|she|it)\b/gi, " ")
    .replace(/\b(am|is|are|have|has|had)\b/gi, " ")
    .replace(/[,;|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  const tokens = normalized
    .split(/\s*\/\s*|\s+/)
    .map((token) => token.replace(/[^A-Za-z'-]/g, "").toLowerCase())
    .filter(Boolean)

  if (tokens.length === 0) return ""

  const unique = [...new Set(tokens)]
  const baseCandidate = unique.find((t) => !t.endsWith("s")) ?? unique[0]
  const thirdCandidate = unique.find(
    (t) => t !== baseCandidate && (t === toThirdPersonSingular(baseCandidate) || t.endsWith("s"))
  )
  const third = thirdCandidate ?? toThirdPersonSingular(baseCandidate)

  return third && third !== baseCandidate ? `${baseCandidate} / ${third}` : baseCandidate
}

function normalizePresentContinuousConjugation(value: string): string {
  const normalized = normalizeInlineWhitespace(value)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(am|is|are|was|were)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()

  const ingMatch = normalized.match(/\b([A-Za-z'-]+ing)\b/i)
  if (ingMatch?.[1]) return ingMatch[1].toLowerCase()

  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.toLowerCase())
    .filter(Boolean)
  return tokens[tokens.length - 1] ?? ""
}

function normalizePresentPerfectConjugation(value: string): string {
  const normalized = normalizeInlineWhitespace(value)
    .replace(/\([^)]*\)/g, " ")
    .replace(/^\s*(have|has|had)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim()

  if (!normalized) return ""

  const chunks = normalized
    .split("/")
    .map((chunk) => normalizeInlineWhitespace(chunk))
    .filter(Boolean)

  return chunks[0] ?? normalized
}

function inferVerbTypeFromSimplePast(simplePast: string): "regular" | "irregular" {
  const normalized = simplePast.toLowerCase().trim()
  return normalized.endsWith("ed") || normalized.endsWith("d") ? "regular" : "irregular"
}

function countWords(value: string): number {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

function looksLikeSimpleTranslation(partOfSpeech: string, translation: string): boolean {
  const normalized = normalizeInlineWhitespace(translation).toLowerCase()
  if (!normalized) return false
  if (/[;:()]/.test(normalized)) return false

  const chunks = normalized
    .split("/")
    .map((item) => normalizeInlineWhitespace(item))
    .filter(Boolean)

  if (chunks.length === 0 || chunks.length > 2) return false

  const allChunksSimple = chunks.every((chunk) => {
    const words = countWords(chunk)
    return words > 0 && words <= 2 && !/[;:()]/.test(chunk)
  })

  if (!allChunksSimple) return false

  if (partOfSpeech === "noun" || partOfSpeech === "phrase") {
    return chunks.every((chunk) => /^(o|a|os|as)\s+/.test(chunk))
  }

  return true
}

function isLikelyBrazilianLearnerTrapWord(word: string): boolean {
  const normalized = normalizeInlineWhitespace(word).toLowerCase()
  if (!normalized) return false

  const traps = new Set([
    "rather",
    "actually",
    "eventually",
    "pretend",
    "sensible",
    "realize",
    "library",
    "parents",
    "support",
    "assist",
    // Homograph verbs: same spelling, different etymology, different conjugation
    "lie",
    "wind",
    "wound",
    "bear",
    "ring",
    "fly",
    "bat",
  ])

  return traps.has(normalized)
}

function shouldSuppressUsageAndExample(params: {
  word: string
  partOfSpeech: string
  translation: string
  usageNote: string
  synonymsCount: number
  antonymsCount: number
  alternativeFormsCount: number
  efommMode?: boolean
  contextMode?: "smart" | "always"
}): boolean {
  if (params.contextMode === "always") return false

  const pos = params.partOfSpeech
  const supportedParts = new Set([
    "verb",
    "noun",
    "adjective",
    "adverb",
    "preposition",
    "conjunction",
    "interjection",
  ])

  if (!supportedParts.has(pos)) return false
  if (!looksLikeSimpleTranslation(pos, params.translation)) return false
  const isTrapWord = isLikelyBrazilianLearnerTrapWord(params.word)
  if (isTrapWord) return false

  const note = normalizeInlineWhitespace(params.usageNote)
  const hasDoNotConfuse = /n[aã]o confundir/i.test(note)
  const hasHighValueInterpretationSplit =
    /(falso cognato|diferen[cç]a|sentido figurado|sentido literal|idiom[aá]tic|modal|registro|tom|armadilha|preposi[cç][aã]o)/i.test(
      note
    )
  const hasInterpretationSplit = hasHighValueInterpretationSplit || (hasDoNotConfuse && isTrapWord)

  const hasMaritimeKeywords =
    Boolean(params.efommMode) && /(mar[ií]t|naval|portu[aá]ri|log[ií]stic|jarg[aã]o|t[eé]cnic|opera[cç][aã]o)/i.test(note)
  const hasExplicitContrastCue =
    /(em contraste|ao contr[aá]rio|diferente de|versus|no uso geral|fora do contexto|n[aã]o no sentido)/i.test(note)
  const hasMaritimeTechnicalContrast = hasMaritimeKeywords && hasExplicitContrastCue

  // Keep context only when there is true multi-interpretation guidance
  // or explicit maritime/technical contrast in EFOMM mode.
  if (hasInterpretationSplit || hasMaritimeTechnicalContrast) return false

  // Keep context when alternative forms indicate meaningful contrast.
  if (params.alternativeFormsCount > 0) return false

  // Straightforward, 1:1 concrete vocabulary -> suppress context/example noise.
  return true
}

function normalizeTranslationByLexicalGuards(word: string, translation: string): string {
  const normalizedWord = normalizeInlineWhitespace(word).toLowerCase()
  const normalizedTranslation = normalizeTranslationText(translation)

  // Deterministic fix for a frequent nautical hallucination.
  if (normalizedWord === "portside") {
    return "bombordo / lado esquerdo"
  }

  return normalizedTranslation
}

function logRevisionAudit(
  event: "generate" | "revise",
  payload: {
    word: string
    partOfSpeech?: string
    translation: string
    usageNote: string
    example: string
    exampleTranslation?: string
    internalReview?: InternalReviewBlock
  }
) {
  const note = normalizeInlineWhitespace(payload.usageNote)
  const translation = normalizeInlineWhitespace(payload.translation)
  const example = normalizeInlineWhitespace(payload.example)
  const exampleTranslation = normalizeInlineWhitespace(payload.exampleTranslation ?? "")
  const checks = payload.internalReview?.checks ?? []
  const failedChecks = checks.filter((item) => item.status === "fail").map((item) => item.rule)

  const audit = {
    event,
    word: normalizeInlineWhitespace(payload.word),
    partOfSpeech: payload.partOfSpeech ?? "n/a",
    translationOk: Boolean(translation) && !/[()]/.test(translation),
    contextOk: note.length === 0 || (!/[\n#*]/.test(note) && note.length <= 260),
    exampleOk: Boolean(example) && Boolean(exampleTranslation),
    internalReviewStatus: payload.internalReview?.finalStatus ?? "missing",
    failedChecks,
    ts: new Date().toISOString(),
  }

  console.log(`[AI_REVIEW_AUDIT] ${JSON.stringify(audit)}`)
}

function normalizeFlashcardResponse(
  raw: FlashcardAIResponseWithReview,
  originalWord: string,
  options: {
    includeConjugations: boolean
    includeAlternativeForms: boolean
    includeMultipleTranslations: boolean
    synonymsLevel: number
    isCompoundOrAcronym: boolean
    contextMode?: "smart" | "always"
    efommMode?: boolean
    targetPartOfSpeech?: string
  }
): FlashcardAIResponse {
  const initialNormalizedWord = normalizeInlineWhitespace(raw?.normalizedWord) || normalizeInlineWhitespace(originalWord)
  const targetPos = options.targetPartOfSpeech
    ? normalizePartOfSpeech(options.targetPartOfSpeech)
    : undefined
  const fallbackResult = inferPartOfSpeechWithAcronymFallback({
    originalWord,
    normalizedWord: initialNormalizedWord,
    rawPartOfSpeech: raw?.partOfSpeech ?? "noun",
    translation: normalizeTranslationText(raw?.translation),
    usageNote: asTrimmedString(raw?.usageNote),
  })
  const partOfSpeech = targetPos ?? fallbackResult.partOfSpeech
  const normalizedWord = partOfSpeech === "acronym" ? fallbackResult.normalizedWord : initialNormalizedWord
  const translationByPartOfSpeech = normalizeTranslationByPartOfSpeech(
    raw?.translation,
    options.includeMultipleTranslations,
    partOfSpeech
  )
  const translation = normalizePtBrOrthography(normalizeTranslationByLexicalGuards(normalizedWord, translationByPartOfSpeech))
  const usageNote = normalizeUsageNoteByPartOfSpeech(raw?.usageNote, partOfSpeech)
  const example = normalizeInlineWhitespace(raw?.example)
  const exampleTranslation = normalizePtBrOrthography(raw?.exampleTranslation)

  const maxRelations = options.synonymsLevel
  const synonyms = normalizeLexicalRelations(raw?.synonyms, maxRelations)
  const antonyms = normalizeLexicalRelations(raw?.antonyms, maxRelations)
  const alternativeForms = normalizeAlternativeForms(
    raw?.alternativeForms,
    normalizedWord,
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
      ? normalizeInlineWhitespace(raw?._verbReasoning) ||
        `Passado é ${conjugations?.simplePast ?? "n/a"}. Termina em -ed/-d? ${verbType === "regular" ? "Yes" : "No"}. Tipo: ${verbType}`
      : "n/a"

  const suppressUsageAndExample = shouldSuppressUsageAndExample({
    word: normalizedWord,
    partOfSpeech,
    translation,
    usageNote,
    synonymsCount: synonyms.length,
    antonymsCount: antonyms.length,
    alternativeFormsCount: alternativeForms.length,
    efommMode: options.efommMode,
    contextMode: options.contextMode,
  })

  return {
    normalizedWord,
    partOfSpeech,
    translation,
    usageNote: suppressUsageAndExample ? "" : usageNote,
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

function normalizeRevisionResponse(
  raw: FlashcardRevisionResponseWithReview,
  options: {
    word: string
    partOfSpeech: string
    includeAlternativeForms: boolean
    synonymsLevel: number
    isCompoundOrAcronym: boolean
    contextMode?: "smart" | "always"
    efommMode?: boolean
  }
): FlashcardRevisionResponse {
  const normalizedTranslation = normalizeTranslationByLexicalGuards(options.word, normalizeTranslationText(raw?.translation))
  const translation = normalizePtBrOrthography(
    normalizePartOfSpeech(options.partOfSpeech) === "acronym"
      ? pickPrimaryTranslation(normalizedTranslation)
      : normalizedTranslation
  )
  const usageNote = normalizeUsageNoteByPartOfSpeech(raw?.usageNote, normalizePartOfSpeech(options.partOfSpeech))
  const synonyms = normalizeLexicalRelations(raw?.synonyms, options.synonymsLevel)
  const antonyms = normalizeLexicalRelations(raw?.antonyms, options.synonymsLevel)
  const example = normalizeInlineWhitespace(raw?.example)
  const exampleTranslation = normalizePtBrOrthography(raw?.exampleTranslation)
  const alternativeForms = normalizeAlternativeForms(
    raw?.alternativeForms,
    normalizeInlineWhitespace(options.word),
    normalizePartOfSpeech(options.partOfSpeech),
    options.includeAlternativeForms,
    options.isCompoundOrAcronym
  )

  const suppressUsageAndExample = shouldSuppressUsageAndExample({
    word: options.word,
    partOfSpeech: normalizePartOfSpeech(options.partOfSpeech),
    translation,
    usageNote,
    synonymsCount: synonyms.length,
    antonymsCount: antonyms.length,
    alternativeFormsCount: alternativeForms.length,
    efommMode: options.efommMode,
    contextMode: options.contextMode,
  })

  return {
    translation,
    usageNote: suppressUsageAndExample ? "" : usageNote,
    synonyms,
    antonyms,
    example,
    exampleTranslation,
    alternativeForms,
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
  contextMode?: "smart" | "always"
  includeMultipleTranslations?: boolean
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

interface InternalReviewItem {
  rule:
    | "zero_fluff_audit"
    | "consistency"
    | "translation_sync"
    | "synonym_accuracy"
    | "alternative_forms_validity"
    | "usage_note_format"
    | "ptbr_orthography"
    | "anti_hallucination"
  status: "pass" | "fail"
  fixApplied: string
}

interface InternalReviewBlock {
  finalStatus: "pass" | "fail"
  checks: InternalReviewItem[]
}

type FlashcardAIResponseWithReview = FlashcardAIResponse & {
  _internalReview?: InternalReviewBlock
}

type FlashcardRevisionResponseWithReview = FlashcardRevisionResponse & {
  _internalReview?: InternalReviewBlock
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
  const contextMode = options?.contextMode ?? "smart"
  const includeMultipleTranslations = options?.includeMultipleTranslations ?? false
  const efommMode = options?.efommMode ?? false
  const targetPartOfSpeech = options?.targetPartOfSpeech

  console.log(`[OpenRouter] Calling ${model} for word: ${word}`)

  // Lógica TS para blindar siglas e expressões compostas
  const isCompoundOrAcronym = word.trim().includes(" ") || isAcronymCandidate(word)

  const synonymsInstruction =
    synonymsLevel === 0
      ? `STEP 4 — SYNONYMS AND ANTONYMS: Do NOT generate synonyms or antonyms. Return "synonyms": [] and "antonyms": [].`
      : `STEP 4 — SYNONYMS AND ANTONYMS (American English)
Provide up to ${synonymsLevel} synonym(s) and up to ${synonymsLevel} antonym(s) that match EXACTLY the same part of speech AND meaning context as the main entry. If none exist, return [].
- Each item MUST include a type: "literal" | "figurative" | "slang" | "abstract"
  * literal: physical action, concrete object, or direct denotation
  * figurative: metaphorical or abstract usage (non-physical)
  * slang: very informal, colloquial, or idiomatic expression
  * abstract: broad intellectual concept without emphasis on physicality
- STRICT CONTEXT FIDELITY: Do NOT include words that only apply to other senses of the entry.
- EXCLUSION: Avoid vague or overloaded words ("get", "do", "go") unless they are genuinely the best match.
- Antonyms: prefer direct opposites of the intended meaning.`

  const conjugationsInstruction = includeConjugations
    ? `STEP 7 — VERB CONJUGATIONS (American English)
If "partOfSpeech" is "verb", provide all 6 tenses. If NOT a verb, set "conjugations" to null.
- HOMOGRAPH LOCK: If the word has two completely different etymological origins with different conjugations (e.g., "lie" = to tell a falsehood [regular: lied/lied] vs "lie" = to recline [irregular: lay/lain]), conjugate ONLY the meaning expressed by the "translation" field. Do NOT mix conjugations from the other homograph.
- FORMAT LOCK (CRITICAL):
  * simplePresent must be only base + 3rd person, in compact form: "lie / lies" (never include pronouns).
  * presentContinuous must be only the -ing form: "lying" (never include am/is/are).
  * presentPerfect must be only the past participle: "lied" (never include have/has).
- verbType MUST match the conjugation you actually provided, not the other homograph's pattern.`
    : `STEP 7 — VERB CONJUGATIONS: Set "conjugations" to null.`

  const usageNoteInstruction = includeUsageNote
    ? `STEP 3 — USAGE NOTE (Brazilian Portuguese, 2009 Orthographic Agreement)
Be ULTRA CONCISE and DIRECT (flashcard style, 2–3 short sentences maximum).
- PROHIBITED: Markdown syntax (**, *, #), bullet points, or embedded line breaks (\\n). The text must be continuous and plain.
- ZERO-FLUFF RULE (CRITICAL): DO NOT state the obvious. If the word is a basic object, animal, color, common action, or everyday 1:1 translation (e.g., "apple", "car", "blue", "run", "bought", "house", "dog"), YOU MUST RETURN "usageNote": "".
- ONLY write a usage note IF AND ONLY IF there is a high risk of confusion for Brazilian learners: false cognates (e.g., "actually"), tricky modals ("rather"), preposition mismatches ("depend on"), strict maritime technical jargon, or HOMOGRAPH TRAPS (see below).
- When a usage note is needed, prefer a block-like sequence with short inline titles (e.g., "Preferência:", "Nuance:", "Contraste:", "Estrutura:") so each idea is clearly separated.
- HOMOGRAPH TRAP RULE: If the word is a verb that shares its spelling with another verb of completely different etymology and conjugation pattern (e.g., "lie" = mentir [regular: lied/lied] vs "lie" = deitar [irregular: lay/lain]), you MUST include a usage note warning: state the meaning being translated, its conjugation pattern (regular/irregular), and briefly contrast with the other homograph's meaning and conjugation. Example: "Este 'lie' significa mentir e é regular (lied/lied). Não confundir com 'lie' = deitar, que é irregular (lay/lain)."
- VERSATILE ADVERB RULE: For highly versatile adverbs (especially "rather"), prefer this compact structure in PT-BR: "Advérbio versátil. Principais usos: Preferência: ... Intensificador: ... Contraste: ...". Keep it plain text and concise.
- If generating a note, write naturally. You MAY use short inline labels like "Nuance:" to introduce a secondary use, but DO NOT repeat the word "Nuance:" multiple times in the same text.
- If the word is an ACRONYM, MANDATORY: spell out what each letter stands for (in English), then explain the meaning in Portuguese.`
    : `STEP 3 — USAGE NOTE: Do NOT generate a usage note. Always return "usageNote": "".`

  const contextPolicyInstruction =
    contextMode === "always"
      ? `CONTEXT POLICY: Keep "usageNote" for all entries.`
      : `CONTEXT POLICY: Default to minimal cards for basic words. For straightforward 1:1 concrete vocabulary, return "usageNote": "". However, ALWAYS generate the example fields.`

  const translationInstruction = includeMultipleTranslations
    ? `STEP 2 — TRANSLATION (Brazilian Portuguese, 2009 Orthographic Agreement)
Provide up to 2 EXACT and most common translations in Portuguese, separated by a slash (/).
- GOLDEN RULE: The chosen translation(s) MUST make complete, natural sense when mentally substituted into the example sentence you generate in STEP 5.
- ACRONYM OVERRIDE: if partOfSpeech is "acronym", always provide EXACTLY 1 translation (NO slash separators).
- DO NOT over-simplify adverbs or nuanced expressions (e.g., do NOT translate "rather" as just "mais"; use full nuance forms like "em vez de / bastante" or "um tanto").
- CONTEXT-FIRST RULE: prioritize the FUNCTION in the sentence, not a dictionary fragment. For modal patterns ("would rather", "had better", "used to"), translate the full function naturally in Portuguese.
- Specific guardrail for "rather":
  * "I'd rather stay home than go out tonight." → translation sense should map to "preferir" / "em vez de", never to "antes que".
  * Acceptable PT-BR example translation: "Eu prefiro ficar em casa em vez de sair hoje à noite."
- For nouns and phrases, ALWAYS include the definite article (e.g., "a proa", "o porto").
- DO NOT force 2 translations if no second perfect match exists.
- DO NOT include parentheses, explanatory notes, or slashes used as shortcuts inside this field.`
    : `STEP 2 — TRANSLATION (Brazilian Portuguese, 2009 Orthographic Agreement)
Provide EXACTLY 1 main translation in Portuguese (NO slash separators).
- GOLDEN RULE: The chosen translation MUST make complete, natural sense when mentally substituted into the example sentence you generate in STEP 5.
- DO NOT over-simplify adverbs or nuanced expressions (e.g., do NOT translate "rather" as just "mais").
- CONTEXT-FIRST RULE: prioritize the FUNCTION in the sentence, not a dictionary fragment. For modal patterns ("would rather", "had better", "used to"), translate the full function naturally in Portuguese.
- Specific guardrail for "rather": when the sentence expresses preference ("would rather"), the translation must map to "preferir" / "em vez de", not "antes que".
- For nouns and phrases, ALWAYS include the definite article (e.g., "a proa", "o porto").
- DO NOT include parentheses, explanatory notes, or slashes inside this field.`

  const alternativeFormsInstruction = includeAlternativeForms && !isCompoundOrAcronym
    ? `STEP 8 — ALTERNATIVE FORMS (Derivations and Cross-POS Conversions)
Follow STRICT morphological rules:
- PHRASE LOCK: If the final word contains SPACES, return "alternativeForms": [] unconditionally.
- PROHIBITED partOfSpeech values here: "phrase" or "acronym".
- SAME WORD, DIFFERENT CLASS: If the exact word can function as another part of speech WITHOUT changing spelling, list it (e.g., "pretty" adjective → "pretty" adverb).
- REAL DERIVATIONS ONLY: List only derived words that share the SAME ROOT and EXIST in official English dictionaries.
- ABSOLUTELY PROHIBITED: Do NOT invent forms (CRITICAL ERROR example: "rather" → "rathern"). If no real derivation exists, return [].
- ABSOLUTELY PROHIBITED: Do NOT group words by mere spelling similarity (CRITICAL ERROR example: "quite" adverb → "quiet" adjective; they are independent words).
- Provide a DRY TRANSLATION (with article for nouns) and an example sentence in English.`
    : `STEP 8 — ALTERNATIVE FORMS: Do NOT generate alternative forms. Always return "alternativeForms": [].`

  const efommInstruction = efommMode
    ? `
EFOMM MODE (MARITIME/NAVAL): Apply ONLY if the word has a SPECIFIC TECHNICAL meaning in maritime, naval, port, or logistics contexts that differs from everyday usage.
- ANTI-HALLUCINATION: If the word is general-purpose (e.g., "dwarfing", "water", "run") and means the same on land and at sea, IGNORE this mode entirely.
- PROHIBITED: Do NOT force naval scenarios onto common words.
- For acronyms/technical terms (e.g., CWQ, BWMS, EFOMM), prioritize established operational terminology from daily machinery and navigation practice.
`
    : ``

  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: `You are a senior American English professor specialized in teaching Brazilian Portuguese speakers. You create high-quality, precise study flashcards.

LANGUAGE RULES:
- Your internal reasoning is in English.
- The fields "translation", "usageNote", "exampleTranslation", and all user-facing Portuguese content MUST be written in Brazilian Portuguese following the 2009 New Orthographic Agreement.
${efommInstruction}
══════════════════════════════════════════
STEP 0 — INPUT NORMALIZATION
══════════════════════════════════════════
- Acronym expansion: If the input follows the pattern "full term (ACRONYM)", normalize to the ACRONYM in uppercase and set partOfSpeech to "acronym".
- CASE-INSENSITIVE ACRONYM CHECK: For one-token entries typed in lowercase/mixed case (e.g., "oow"), first test normal lexical classes; if none fits naturally and the form is an established acronym, convert to uppercase and set partOfSpeech to "acronym".
- "-ing" morphology: If the word ends in "-ing", determine whether it functions as a verbal noun (→ noun) or gerund/present participle (→ verb) based on standard usage.
- Silently correct hyphenation errors and bare infinitives before processing.

══════════════════════════════════════════
STEP 1 — PART OF SPEECH (partOfSpeech)
══════════════════════════════════════════
Classify using EXACTLY one of: verb | noun | adjective | adverb | preposition | conjunction | interjection | phrase | acronym
- Return "phrase" ONLY for multi-word expressions that contain a space.
- Use "acronym" only when the entry is an established abbreviation/sigla; do not force acronym for regular dictionary words.
- The chosen partOfSpeech GOVERNS every other field — never contradict it.

══════════════════════════════════════════
${translationInstruction}

══════════════════════════════════════════
${usageNoteInstruction}
${contextPolicyInstruction}

══════════════════════════════════════════
${synonymsInstruction}

══════════════════════════════════════════
STEP 5 — EXAMPLE SENTENCE (American English)
══════════════════════════════════════════
Write ONE natural American English sentence that clearly illustrates the EXACT meaning expressed by the translation in STEP 2.
- The example MUST be semantically synchronized: if the translation represents usage X, the example must demonstrate usage X — not usage Y.
- FUNCTIONAL ALIGNMENT TEST: after drafting the example, verify that replacing the English target with the Portuguese translation intent still yields a natural Portuguese meaning.
- For modal-preference constructions (e.g., "would rather"), ensure the Portuguese intent is "preferir"/"em vez de" instead of literal fragments like "antes que".
- MANDATORY: EVERY word, no matter how simple (e.g., "car", "apple", "blue"), MUST have an "example" and "exampleTranslation". NEVER leave them empty.
- Prefer sentences that highlight why the word is interesting or challenging for learners.

══════════════════════════════════════════
STEP 6 — EXAMPLE TRANSLATION (Brazilian Portuguese, 2009 Orthographic Agreement)
══════════════════════════════════════════
Provide a natural, fluent Brazilian Portuguese translation of the example sentence.
- Do not translate word-for-word; use natural phrasing.

══════════════════════════════════════════
${conjugationsInstruction}
- verbType: if simplePast ends in "-ed" or "-d", it is "regular"; otherwise "irregular".
- _verbReasoning format: "Past tense is [X]. Ends in -ed/-d? [Yes/No]. Type: [regular/irregular]."

══════════════════════════════════════════
${alternativeFormsInstruction}

══════════════════════════════════════════
STEP 9 — MANDATORY SELF-REVIEW (complete before writing final JSON)
══════════════════════════════════════════
Before outputting, you MUST fill a concise "_internalReview" object first, then correct issues in official fields:
1. CONSISTENCY: Is "partOfSpeech" fully consistent with translation, usageNote, example, synonyms, and antonyms?
2. TRANSLATION SYNC: Does the translation make natural sense when substituted into the example sentence, including idiom/modal patterns?
3. SYNONYM ACCURACY: Do all synonyms/antonyms share EXACTLY the same POS and meaning context?
4. ALTERNATIVE FORMS VALIDITY: Does every word in "alternativeForms" exist in official dictionaries?
5. USAGE NOTE FORMATTING: Does "usageNote" contain NO markdown, NO line breaks, NO bullet points?
6. PORTUGUESE ORTHOGRAPHY: Does all Portuguese text comply with the 2009 Agreement?
7. ANTI-HALLUCINATION: Are you fully confident about every claim regarding this word's meaning?
8. ZERO-FLUFF AUDIT: Is this a basic, everyday 1:1 vocabulary word (like 'car', 'blue', 'buy')? If YES, you MUST clear the "usageNote" field to "". Only keep notes for real learner traps.

Rules for "_internalReview":
- Keep it SHORT and STRUCTURED only.
- Include exactly one check item for each rule above with "pass"/"fail" and a brief "fixApplied" note.
- If any check is "fail", fix the corresponding official field before final output.
- Set "finalStatus" to "pass" only if all checks pass after fixes.
Output ONLY the corrected JSON after completing this structured review.

══════════════════════════════════════════
OUTPUT FORMAT
══════════════════════════════════════════
Return ONLY a valid JSON object. Do NOT wrap it in code blocks. Do NOT add comments.
{
  "_internalReview": {
    "finalStatus": "pass|fail",
    "checks": [
      {"rule": "zero_fluff_audit", "status": "pass|fail", "fixApplied": "cleared usageNote because word is a basic 1:1 translation"},
      {"rule": "consistency", "status": "pass|fail", "fixApplied": "short note"},
      {"rule": "translation_sync", "status": "pass|fail", "fixApplied": "short note"},
      {"rule": "synonym_accuracy", "status": "pass|fail", "fixApplied": "short note"},
      {"rule": "alternative_forms_validity", "status": "pass|fail", "fixApplied": "short note"},
      {"rule": "usage_note_format", "status": "pass|fail", "fixApplied": "short note"},
      {"rule": "ptbr_orthography", "status": "pass|fail", "fixApplied": "short note"},
      {"rule": "anti_hallucination", "status": "pass|fail", "fixApplied": "short note"}
    ]
  },
  "normalizedWord": "the word",
  "partOfSpeech": "verb|noun|adjective|adverb|preposition|conjunction|interjection|phrase|acronym",
  "translation": "Brazilian Portuguese translation",
  "usageNote": "plain Brazilian Portuguese text or empty string",
  "synonyms": [{"word": "synonym", "type": "literal|figurative|slang|abstract"}],
  "antonyms": [{"word": "antonym", "type": "literal|figurative|slang|abstract"}],
  "example": "American English sentence.",
  "exampleTranslation": "Brazilian Portuguese translation of the example.",
  "alternativeForms": [{"word": "form", "partOfSpeech": "noun", "translation": "a/o ...", "example": "English sentence."}],
  "_verbReasoning": "Past tense is X. Ends in -ed/-d? Yes/No. Type: regular/irregular.",
  "verbType": "regular|irregular|null",
  "conjugations": {"simplePresent": "...", "simplePast": "...", "presentContinuous": "...", "pastContinuous": "...", "presentPerfect": "...", "pastPerfect": "..."} | null
}`
    },
    {
      role: "user",
      content: targetPartOfSpeech
        ? `Generate flashcard data for: "${word}". Treat it EXCLUSIVELY as a "${targetPartOfSpeech}" and return "partOfSpeech" as "${targetPartOfSpeech}".`
        : `Generate flashcard data for: "${word}"`,
    },
  ]

  const raw = await callOpenRouter<FlashcardAIResponseWithReview>(
    messages,
    model,
    { type: "json_object" },
    { temperature: 0.2 }
  )

  const normalized = normalizeFlashcardResponse(raw, word, {
    includeConjugations,
    includeAlternativeForms,
    includeMultipleTranslations,
    synonymsLevel,
    isCompoundOrAcronym,
    contextMode,
    efommMode,
    targetPartOfSpeech,
  })

  logRevisionAudit("generate", {
    word: normalized.normalizedWord,
    partOfSpeech: normalized.partOfSpeech,
    translation: normalized.translation,
    usageNote: normalized.usageNote ?? "",
    example: normalized.example,
    exampleTranslation: normalized.exampleTranslation,
    internalReview: raw._internalReview,
  })

  return normalized
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
    contextMode?: "smart" | "always"
  },
  model: string = DEFAULT_AI_MODEL
): Promise<FlashcardRevisionResponse> {
  const synonymsLevel = Math.max(0, Math.min(3, input.synonymsLevel ?? 2))
  const includeAlternativeForms = input.includeAlternativeForms ?? true
  const includeUsageNote = input.includeUsageNote ?? true
  const contextMode = input.contextMode ?? "smart"
  const efommMode = input.efommMode ?? false

  const isCompoundOrAcronym = input.word.trim().includes(" ") || isAcronymCandidate(input.word)

  const synonymsInstruction =
    synonymsLevel === 0
      ? `Do NOT generate synonyms or antonyms. Return "synonyms": [] and "antonyms": [].`
      : `Provide up to ${synonymsLevel} synonym(s) and up to ${synonymsLevel} antonym(s) in ENGLISH that match EXACTLY the same part of speech AND meaning context implied by the new translation.`

  const alternativeFormsInstruction = includeAlternativeForms && !isCompoundOrAcronym
    ? `ALTERNATIVE FORMS: Follow STRICT morphological rules.
- PROHIBITED partOfSpeech values: "phrase" or "acronym".
- REAL DERIVATIONS ONLY: List only words that share the SAME ROOT and exist in official English dictionaries. PROHIBITED: Do NOT invent words.
- PROHIBITED: Do NOT group words by mere spelling similarity (e.g., "quite" vs "quiet" are independent words).
- Provide a DRY TRANSLATION (with article for nouns) and an example sentence in English.`
    : `Always return "alternativeForms": [].`

  const usageNoteInstruction = includeUsageNote
    ? `USAGE NOTE (Brazilian Portuguese, 2009 Orthographic Agreement):
Be ULTRA CONCISE and DIRECT (2–3 short sentences maximum).
- PROHIBITED: Markdown syntax (**, *, #), line breaks, or bullet points. Continuous plain text only.
- ZERO-FLUFF RULE (CRITICAL): DO NOT state the obvious. If the word is a basic object, animal, color, common action, or everyday 1:1 translation, YOU MUST RETURN "usageNote": "".
- ONLY write a usage note IF AND ONLY IF there is a high risk of confusion for Brazilian learners (false cognates, modals, etc).
- When a usage note is needed, prefer short labeled chunks (e.g., "Preferência:", "Nuance:", "Contraste:", "Estrutura:") so ideas are visually separated.
- For highly versatile adverbs (especially "rather"), prefer this compact format: "Advérbio versátil. Principais usos: Preferência: ... Intensificador: ... Contraste: ...".
- Write naturally. You MAY use short inline labels like "Nuance:" to introduce a secondary use, but DO NOT repeat the word "Nuance:" multiple times.`
    : `USAGE NOTE: Do NOT generate a usage note. Always return "usageNote": "".`

  const contextPolicyInstruction =
    contextMode === "always"
      ? `CONTEXT POLICY: Keep "usageNote" for all entries.`
      : `CONTEXT POLICY: Keep "usageNote" only when there is real learner value (false cognate, modal/idiomatic function, register shift, or technical maritime contrast). For straightforward 1:1 concrete vocabulary, return "usageNote": "". However, ALWAYS generate the example fields.`

  const efommInstruction = efommMode
    ? `EFOMM MODE (MARITIME): Prefer naval/port contexts if plausible and reflect this in "usageNote". Avoid forced literal translations for technical terms.`
    : ``

  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: `You are a senior American English professor teaching Brazilian Portuguese speakers.

LANGUAGE RULES:
- Reason in English.
- All Portuguese-facing fields ("translation", "usageNote", "exampleTranslation") MUST follow the 2009 New Orthographic Agreement.
${efommInstruction}

You will receive:
- A word/acronym in English
- A fixed part of speech
- A NEW translation in Portuguese

Your task:
- Keep the word and part of speech unchanged.
- Update ALL fields to be fully consistent with the NEW translation.
- The received partOfSpeech is mandatory. Do NOT mix other usages in the main context.
- MANDATORY SYNC: The "example" sentence MUST perfectly align with the NEW translation. NEVER leave example fields empty.
- If the received partOfSpeech is "acronym", translation MUST be a single form (NO slash separators).

Synonyms instruction: ${synonymsInstruction}
Usage note instruction: ${usageNoteInstruction}
Alternative forms instruction: ${alternativeFormsInstruction}
${contextPolicyInstruction}

══════════════════════════════════════════
MANDATORY SELF-REVIEW (complete before outputting)
══════════════════════════════════════════
Before outputting, you MUST fill a concise "_internalReview" object first, then correct issues in official fields:
1. CONSISTENCY: Is every field (example, synonyms, usageNote) consistent with the NEW translation and the given partOfSpeech?
2. TRANSLATION SYNC: Does the example sentence naturally illustrate the new translation, including idiom/modal patterns?
3. SYNONYM ACCURACY: Do all synonyms/antonyms match the same POS and new meaning context?
4. ALTERNATIVE FORMS VALIDITY: Does every word in "alternativeForms" exist in official dictionaries?
5. USAGE NOTE FORMATTING: Is "usageNote" plain text with no markdown, no line breaks, no bullet points?
6. PORTUGUESE ORTHOGRAPHY: Does all Portuguese text follow the 2009 agreement?
7. ZERO-FLUFF AUDIT: Is this a basic, everyday 1:1 vocabulary word? If YES, you MUST clear the "usageNote" field to "".

Rules for "_internalReview":
- Keep it SHORT and STRUCTURED only.
- Include exactly one check item per rule with "pass"/"fail" and a brief "fixApplied" note.
- If any check is "fail", fix the corresponding official field before final output.
- Set "finalStatus" to "pass" only if all checks pass after fixes.
Output ONLY the corrected JSON.

Return the exact JSON:
{
  "_internalReview": {
    "finalStatus": "pass|fail",
    "checks": [
      {"rule": "zero_fluff_audit", "status": "pass|fail", "fixApplied": "short note"},
      {"rule": "consistency", "status": "pass|fail", "fixApplied": "short note"},
      {"rule": "translation_sync", "status": "pass|fail", "fixApplied": "short note"},
      {"rule": "synonym_accuracy", "status": "pass|fail", "fixApplied": "short note"},
      {"rule": "alternative_forms_validity", "status": "pass|fail", "fixApplied": "short note"},
      {"rule": "usage_note_format", "status": "pass|fail", "fixApplied": "short note"},
      {"rule": "ptbr_orthography", "status": "pass|fail", "fixApplied": "short note"}
    ]
  },
  "translation": "translation provided by the user",
  "usageNote": "plain Brazilian Portuguese text, no markdown",
  "synonyms": [{"word": "x", "type": "literal|figurative|slang|abstract"}],
  "antonyms": [{"word": "y", "type": "literal|figurative|slang|abstract"}],
  "example": "Example sentence in American English.",
  "exampleTranslation": "Natural Brazilian Portuguese translation.",
  "alternativeForms": [{"word": "form", "partOfSpeech": "noun", "translation": "o/a ...", "example": "..." }]
}`
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

  const raw = await callOpenRouter<FlashcardRevisionResponseWithReview>(messages, model, { type: "json_object" }, {
    temperature: 0.2,
  })

  const normalized = normalizeRevisionResponse(raw, {
    word: input.word,
    partOfSpeech: input.partOfSpeech,
    includeAlternativeForms,
    synonymsLevel,
    isCompoundOrAcronym,
    contextMode,
    efommMode,
  })

  logRevisionAudit("revise", {
    word: input.word,
    partOfSpeech: input.partOfSpeech,
    translation: normalized.translation,
    usageNote: normalized.usageNote ?? "",
    example: normalized.example,
    exampleTranslation: normalized.exampleTranslation,
    internalReview: raw._internalReview,
  })

  return normalized
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
