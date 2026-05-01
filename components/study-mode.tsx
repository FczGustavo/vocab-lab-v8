"use client"

import { useState, useCallback, useEffect } from "react"
import { X, CheckCircle2, XCircle, Volume2, Trophy, RotateCw, Languages, Rotate3D } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useGrammarProgress } from "@/hooks/use-grammar-progress"
import type { Flashcard, PartOfSpeech } from "@/lib/types"
import { useAnimations } from "@/hooks/use-animations"
import { useAiPreferences } from "@/hooks/use-ai-preferences"

function shuffleFlashcards(cards: Flashcard[]): Flashcard[] {
  const next = [...cards]
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

const partOfSpeechLabels: Record<PartOfSpeech, string> = {
  verb: "Verbo",
  noun: "Substantivo",
  adjective: "Adjetivo",
  adverb: "Advérbio",
  preposition: "Preposição",
  conjunction: "Conjunção",
  interjection: "Interjeição",
  phrase: "Expressão",
  acronym: "Sigla",
}

const partOfSpeechColors: Record<PartOfSpeech, string> = {
  verb: "ghost-tag bg-blue-500/10 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300",
  noun: "ghost-tag bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
  adjective: "ghost-tag bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300",
  adverb: "ghost-tag bg-purple-500/10 text-purple-700 dark:bg-purple-400/10 dark:text-purple-300",
  preposition: "ghost-tag bg-rose-500/10 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300",
  conjunction: "ghost-tag bg-cyan-500/10 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-300",
  interjection: "ghost-tag bg-orange-500/10 text-orange-700 dark:bg-orange-400/10 dark:text-orange-300",
  phrase: "ghost-tag bg-teal-500/10 text-teal-700 dark:bg-teal-400/10 dark:text-teal-300",
  acronym: "ghost-tag bg-indigo-500/10 text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-300",
}

interface StudyModeProps {
  flashcards: Flashcard[]
  folderName: string
  onExit: () => void
  onMarkForReview?: (id: string) => Promise<boolean>
}

type StudyState = "studying" | "finished"

export function StudyMode({ flashcards, folderName, onExit, onMarkForReview }: StudyModeProps) {
  const { saveStudySession } = useGrammarProgress()
  const { enabled: animationsEnabled } = useAnimations()
  const { includeUsageNote } = useAiPreferences()
  
  // queue: palavras restantes. wrong: palavras erradas que voltam ao final
  const [queue, setQueue] = useState<Flashcard[]>(() => shuffleFlashcards(flashcards))
  const [wrongCount, setWrongCount] = useState<Record<string, number>>({})
  const [knownIds, setKnownIds] = useState<Set<string>>(new Set())
  const [correctFirstTryIds, setCorrectFirstTryIds] = useState<Set<string>>(new Set())
  const [isFlipped, setIsFlipped] = useState(false)
  const [showExampleTranslation, setShowExampleTranslation] = useState(false)
  const [studyState, setStudyState] = useState<StudyState>("studying")
  const [animating, setAnimating] = useState(false)
  const [direction, setDirection] = useState<"left" | "right" | null>(null)
  const [sessionSaved, setSessionSaved] = useState(false)
  const [reviewedWords, setReviewedWords] = useState<Set<string>>(new Set())
  const transitionMs = animationsEnabled ? 180 : 0

  const current = queue[0]
  const remaining = queue.length
  const totalKnown = knownIds.size
  const totalCards = flashcards.length

  useEffect(() => {
    setShowExampleTranslation(false)
  }, [current?.id])

  // Save session when finished
  useEffect(() => {
    if (studyState === "finished" && !sessionSaved) {
      const wordsToReview = Object.entries(wrongCount)
        .filter(([, count]) => count > 0)
        .map(([id]) => flashcards.find((f) => f.id === id)?.word || "")
        .filter(Boolean)

      saveStudySession({
        folderName,
        totalCards,
        correctFirstTry: correctFirstTryIds.size,
        wordsToReview,
      })
      setSessionSaved(true)
    }
  }, [studyState, sessionSaved, wrongCount, flashcards, folderName, totalCards, correctFirstTryIds, saveStudySession])

  const speak = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = "en-US"
    speechSynthesis.speak(utterance)
  }

  const advance = useCallback(
    (knew: boolean) => {
      if (animating || !current) return

      const dir = knew ? "right" : "left"
      setDirection(dir)
      setAnimating(true)

      window.setTimeout(() => {
        setQueue((prev) => {
          const [head, ...rest] = prev
          if (knew) {
            // Remove da fila
            const next = rest
            if (next.length === 0) setStudyState("finished")
            return next
          } else {
            // Volta para o final da fila
            return [...rest, head]
          }
        })

        if (knew) {
          setKnownIds((prev) => new Set([...prev, current.id]))
          // Track if it was correct on first try (never marked wrong before)
          if (!wrongCount[current.id]) {
            setCorrectFirstTryIds((prev) => new Set([...prev, current.id]))
          }
        } else {
          setWrongCount((prev) => ({
            ...prev,
            [current.id]: (prev[current.id] ?? 0) + 1,
          }))
          // Mark for review if first time getting this card wrong
          if (!wrongCount[current.id] && onMarkForReview) {
            onMarkForReview(current.id)
          }
        }

        setIsFlipped(false)
        setAnimating(false)
        setDirection(null)
      }, transitionMs)
    },
    [animating, current, transitionMs, wrongCount, onMarkForReview]
  )

  const restart = () => {
    setQueue(shuffleFlashcards(flashcards))
    setWrongCount({})
    setKnownIds(new Set())
    setCorrectFirstTryIds(new Set())
    setReviewedWords(new Set())
    setIsFlipped(false)
    setStudyState("studying")
    setDirection(null)
    setAnimating(false)
    setSessionSaved(false)
  }

  // --- Tela de conclusao ---
  if (studyState === "finished") {
    const sortedWrongs = Object.entries(wrongCount)
      .sort((a, b) => b[1] - a[1])
      .filter(([id]) => !reviewedWords.has(id))

    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white p-4 dark:bg-slate-950 sm:p-6">
        <div className="w-full max-w-md space-y-6 text-center sm:space-y-8">
          <div className="size-24 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
            <Trophy className="size-12 text-primary" />
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl font-black uppercase tracking-tighter text-slate-900 dark:text-white sm:text-4xl">
              Sessão Concluída!
            </h2>
            <p className="text-slate-500 dark:text-slate-400 font-medium">
              Você estudou todos os {totalCards} cartões de &ldquo;{folderName}&rdquo;
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6">
              <div className="text-4xl font-black text-primary">{totalKnown}</div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Acertos</div>
            </div>
            <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6">
              <div className="text-4xl font-black text-slate-900 dark:text-white">
                {Object.values(wrongCount).reduce((a, b) => a + b, 0)}
              </div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Erros totais</div>
            </div>
          </div>

          {/* Palavras para revisar */}
          {sortedWrongs.length > 0 && (
            <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6 text-left space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Palavras para revisar</p>
                <Badge variant="outline" className="text-[10px] border-primary/20 text-primary">
                  {sortedWrongs.length} pendentes
                </Badge>
              </div>
              
              <div className="space-y-2 max-h-40 overflow-y-auto pr-2 scrollbar-hide">
                {sortedWrongs.map(([id, count]) => {
                  const card = flashcards.find((f) => f.id === id)
                  return card ? (
                    <div key={id} className="flex items-center justify-between bg-white dark:bg-white/5 p-2 rounded-lg border border-slate-100 dark:border-white/5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">{card.word}</span>
                        <span className="text-[10px] text-destructive font-bold">({count}x)</span>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 text-[10px] font-bold text-primary hover:text-primary hover:bg-primary/10"
                        onClick={() => setReviewedWords(prev => new Set([...prev, id]))}
                      >
                        <CheckCircle2 className="size-3 mr-1" />
                        Marcar como revisado
                      </Button>
                    </div>
                  ) : null
                })}
              </div>
            </div>
          )}

          {sortedWrongs.length === 0 && Object.keys(wrongCount).length > 0 && (
            <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 flex items-center justify-center gap-2">
              <CheckCircle2 className="size-5 text-primary" />
              <p className="text-sm font-bold text-primary uppercase tracking-tight">Tudo revisado!</p>
            </div>
          )}

          <div className="flex flex-col gap-3 pt-4">
            <Button className="w-full h-14 bg-primary hover:bg-primary/90 text-white font-bold text-lg rounded-xl shadow-lg shadow-primary/20" onClick={restart}>
              <RotateCw className="size-5 mr-2" />
              ESTUDAR NOVAMENTE
            </Button>
            <Button
              variant="ghost"
              className="w-full h-12 text-slate-500 hover:text-slate-900 font-bold uppercase tracking-widest"
              onClick={onExit}
            >
              Sair para o início
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // --- Tela principal de estudo ---
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-3 dark:border-white/10 sm:px-6 sm:py-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground dark:text-white/70 dark:hover:text-white dark:hover:bg-white/10"
            onClick={onExit}
          >
            <X className="size-5" />
          </Button>
          <div>
            <p className="text-sm font-medium text-foreground dark:text-white">{folderName}</p>
            <p className="text-xs text-muted-foreground dark:text-white/50">
              {remaining} restante{remaining !== 1 ? "s" : ""}
              {totalKnown > 0 && ` · ${totalKnown} aprendida${totalKnown !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mx-2 flex-1 sm:mx-8">
          <div className="h-1.5 bg-muted dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-success rounded-full transition-all duration-500"
              style={{ width: `${(totalKnown / totalCards) * 100}%` }}
            />
          </div>
        </div>

        <span className="text-xs font-semibold text-muted-foreground dark:text-white/70 sm:text-sm">
          {totalKnown}/{totalCards}
        </span>
      </div>

      {/* Card area */}
      <div className="flex flex-1 items-center justify-center bg-slate-50 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] dark:bg-slate-950/50 sm:p-6">
        {current && (
          <div
            className={cn(
              "w-full max-w-xl transform-gpu will-change-transform transition-all",
              animationsEnabled ? "duration-200" : "duration-0",
              animating && direction === "right" && "translate-x-32 rotate-12 opacity-0",
              animating && direction === "left" && "-translate-x-32 -rotate-12 opacity-0"
            )}
          >
            {/* Flashcard */}
            <div
              className="perspective-1000 h-[62vh] min-h-[360px] max-h-[450px] cursor-pointer select-none sm:h-[450px]"
              onClick={() => !animating && setIsFlipped((f) => !f)}
            >
              <div
                className={cn(
                  "relative h-full w-full transform-gpu will-change-transform transform-style-3d rounded-2xl transition-transform",
                  animationsEnabled ? "duration-500" : "duration-0",
                  isFlipped && "rotate-y-180"
                )}
              >
                {/* Front */}
                <div className="surface-card surface-card-elevated interactive-lift absolute inset-0 flex flex-col rounded-[22px] bg-card p-5 backface-hidden sm:rounded-[26px] sm:p-8">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2 items-center">
                      <Badge className={cn("text-xs font-medium border-0", partOfSpeechColors[current.partOfSpeech || "noun"])}>
                        {partOfSpeechLabels[current.partOfSpeech || "noun"]}
                      </Badge>
                      {current.verbType && (
                        <Badge variant="outline" className="ghost-tag border-0 bg-primary/10 text-[10px] uppercase tracking-wider text-primary">
                          {current.verbType}
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation()
                        speak(current.word)
                      }}
                    >
                      <Volume2 className="size-4" />
                    </Button>
                  </div>

                  <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                    <h2 className="text-center text-4xl font-medium tracking-tight text-foreground sm:text-6xl">
                      {current.word}
                    </h2>
                  </div>

                  <Rotate3D className="minimal-rotate-hint size-4 text-muted-foreground" />
                </div>

                {/* Back */}
                <div className="surface-card surface-card-elevated interactive-lift absolute inset-0 flex flex-col overflow-hidden rounded-[22px] bg-card p-5 backface-hidden rotate-y-180 sm:rounded-[26px] sm:p-8">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex gap-2 items-center">
                      <Badge className={cn("text-xs font-medium border-0", partOfSpeechColors[current.partOfSpeech || "noun"])}>
                        {partOfSpeechLabels[current.partOfSpeech || "noun"]}
                      </Badge>
                      {current.verbType && (
                        <Badge variant="outline" className="ghost-tag border-0 bg-primary/10 text-[10px] uppercase tracking-wider text-primary">
                          {current.verbType}
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation()
                        speak(current.word)
                      }}
                    >
                      <Volume2 className="size-4" />
                    </Button>
                  </div>

                  <div className="flex-1 space-y-5 overflow-y-auto pr-1 scrollbar-hide sm:space-y-6">
                    <p className="border-b border-border/50 pb-2 text-2xl font-medium text-foreground sm:text-4xl">{current.translation}</p>

                    <div>
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Exemplo</span>
                      <p className="text-base text-foreground italic mt-2 leading-relaxed">
                        &ldquo;{current.example}&rdquo;
                      </p>
                      {current.exampleTranslation && (
                        <div className="mt-2">
                          <button
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary/70 hover:text-primary transition-colors"
                            onClick={(e) => { e.stopPropagation(); setShowExampleTranslation((v) => !v) }}
                          >
                            <Languages className="size-3.5" />
                            {showExampleTranslation ? "Ocultar tradução" : "Traduzir frase"}
                          </button>
                          {showExampleTranslation && (
                            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                              {current.exampleTranslation}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {includeUsageNote && !!current.usageNote && (
                      <div className="bg-muted/30 rounded-xl p-4">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                          Contexto
                        </span>
                        <p className="text-sm text-foreground mt-2 leading-relaxed">
                          {current.usageNote}
                        </p>
                      </div>
                    )}
                  </div>

                  <Rotate3D className="minimal-rotate-hint size-4 text-muted-foreground" />
                </div>
              </div>
            </div>

            {/* Action buttons — always visible */}
            <div className="mt-5 flex gap-3 sm:mt-8 sm:gap-4">
              <Button
                size="lg"
                variant="outline"
                className="h-12 flex-1 border-destructive/20 text-base font-bold text-destructive hover:bg-destructive/10 sm:h-16 sm:text-lg"
                onClick={() => advance(false)}
                disabled={animating}
              >
                <XCircle className="size-6 mr-2" />
                Errei
              </Button>

              <Button
                size="lg"
                className="h-12 flex-1 bg-success text-base font-bold text-white hover:bg-success/90 sm:h-16 sm:text-lg"
                onClick={() => advance(true)}
                disabled={animating}
              >
                <CheckCircle2 className="size-6 mr-2" />
                Acertei
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
