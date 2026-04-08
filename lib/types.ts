export interface ClassifiedWord {
  word: string
  type: "literal" | "figurative" | "slang" | "abstract"
}

export type PartOfSpeech = "verb" | "noun" | "adjective" | "adverb" | "preposition" | "conjunction" | "interjection"

export interface AlternativeForm {
  word: string
  partOfSpeech: PartOfSpeech
  translation: string
  example: string
}

export interface Folder {
  id: string
  name: string
  createdAt: number
}

export interface Flashcard {
  id: string
  word: string
  partOfSpeech: PartOfSpeech
  translation: string
  usageNote?: string
  synonyms: ClassifiedWord[]
  antonyms: ClassifiedWord[]
  example: string
  exampleTranslation?: string
  alternativeForms: AlternativeForm[]
  conjugations?: {
    simplePresent: string
    simplePast: string
    presentContinuous: string
    pastContinuous: string
    presentPerfect: string
    pastPerfect: string
  }
  verbType?: "regular" | "irregular"
  falseCognate?: {
    isFalseCognate: boolean
    warning: string // Ex: "Não significa 'pretender', significa 'fingir'"
  }
  folderId: string | null
  createdAt: number
}

export interface FlashcardAIResponse {
  normalizedWord: string
  partOfSpeech: PartOfSpeech
  translation: string
  usageNote?: string
  synonyms: ClassifiedWord[]
  antonyms: ClassifiedWord[]
  example: string
  exampleTranslation?: string
  alternativeForms: AlternativeForm[]
  verbType?: "regular" | "irregular"
  falseCognate?: {
    isFalseCognate: boolean
    warning: string
  }
  conjugations?: {
    simplePresent: string
    simplePast: string
    presentContinuous: string
    pastContinuous: string
    presentPerfect: string
    pastPerfect: string
  }
}

export interface GrammarExercise {
  id: string
  type: "fill-blank" | "verb-conjugation"
  sentence: string
  answer: string
  hint?: string
  wordUsed: string
}

export interface GrammarExerciseSet {
  exercises: GrammarExercise[]
}
