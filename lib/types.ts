export interface ClassifiedWord {
  word: string
  type: "literal" | "abstract"
}

export type PartOfSpeech = "verb" | "noun" | "adjective" | "adverb" | "preposition" | "conjunction" | "interjection"

export interface AlternativeForm {
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
  synonyms: ClassifiedWord[]
  antonyms: ClassifiedWord[]
  example: string
  alternativeForms: AlternativeForm[]
  conjugations?: {
    simplePresent: string
    simplePast: string
    presentContinuous: string
    pastContinuous: string
    presentPerfect: string
    pastPerfect: string
  }
  folderId: string | null
  createdAt: number
}

export interface FlashcardAIResponse {
  normalizedWord: string
  partOfSpeech: PartOfSpeech
  translation: string
  synonyms: ClassifiedWord[]
  antonyms: ClassifiedWord[]
  example: string
  alternativeForms: AlternativeForm[]
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
