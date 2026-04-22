export interface ClassifiedWord {
  word: string
  type: "literal" | "figurative" | "slang" | "abstract"
}

export type PartOfSpeech = "verb" | "noun" | "adjective" | "adverb" | "preposition" | "conjunction" | "interjection" | "phrase" | "acronym"

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
  isReviewFolder?: boolean
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

// ── Grammar Lab MCQ system (EFOMM / EN / AFA style) ──────────────────────────

export interface GrammarQuestionOption {
  letter: "A" | "B" | "C" | "D" | "E"
  text: string
  /** true = this is the option the student must select */
  isAnswer: boolean
  /** per-option explanation shown after answering, in pt-BR */
  explanation: string
}

export interface GrammarQuestion {
  id: string
  topic: string
  subtopic?: string
  questionText: string
  /** Optional 1-2 sentence context passage to anchor article/pronoun/reference choices */
  contextPassage?: string
  /** "correct" = find the grammatically correct sentence; "incorrect" = find the error */
  questionType: "correct" | "incorrect"
  options: GrammarQuestionOption[]
  createdAt: number
}

export interface GrammarAnsweredRecord {
  questionId: string
  chosenLetter: string
  correct: boolean
  answeredAt: number
}

export interface GrammarFolder {
  id: string
  name: string
  createdAt: number
}

export interface GrammarList {
  id: string
  name: string
  folderId: string | null
  questionIds: string[]
  createdAt: number
}
