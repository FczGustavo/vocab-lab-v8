"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { X, CheckCircle2, XCircle, Volume2, Trophy, RotateCw, Languages, Rotate3D, Clock3 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useGrammarProgress } from "@/hooks/use-grammar-progress"
import type { Flashcard, PartOfSpeech } from "@/lib/types"
import { useAnimations } from "@/hooks/use-animations"
import { useAiPreferences } from "@/hooks/use-ai-preferences"
import { useStudyTimer } from "@/hooks/use-study-timer"

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

function formatElapsedTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

export function StudyMode({ flashcards, folderName, onExit, onMarkForReview }: StudyModeProps) {
  const { saveStudySession } = useGrammarProgress()
  const { enabled: animationsEnabled } = useAnimations()
  const { enabled: studyTimerEnabled } = useStudyTimer()
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
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const sessionStartedAtRef = useRef<number>(Date.now())
  const transitionMs = animationsEnabled ? 180 : 0

  const current = queue[0]
  const remaining = queue.length
  const totalKnown = knownIds.size
  const totalCards = flashcards.length

  useEffect(() => {
    setShowExampleTranslation(false)
  }, [current?.id])

  useEffect(() => {
    if (!studyTimerEnabled || studyState !== "studying") return

    const tick = () => {
      const seconds = Math.floor((Date.now() - sessionStartedAtRef.current) / 1000)
      setElapsedSeconds(Math.max(0, seconds))
    }

    tick()
    const timerId = window.setInterval(tick, 1000)
    return () => window.clearInterval(timerId)
  }, [studyState, studyTimerEnabled])

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

      // Prevent answer bleed while swipe-out transition is running.
      setIsFlipped(false)
      setShowExampleTranslation(false)

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
    sessionStartedAtRef.current = Date.now()
    setElapsedSeconds(0)
  }

  // --- Tela de conclusao ---
  if (studyState === "finished") {
    const sortedWrongs = Object.entries(wrongCount)
      .sort((a, b) => b[1] - a[1])
      .filter(([id]) => !reviewedWords.has(id))

    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-white p-3 dark:bg-slate-950 sm:p-5">
        <div className="mx-auto w-full max-w-[720px] space-y-4 py-2 text-center sm:space-y-5">
          <div className="size-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto sm:size-20">
            <Trophy className="size-8 text-primary sm:size-10" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900 dark:text-white sm:text-3xl">
              Sessão Concluída!
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium sm:text-base">
              Você estudou todos os {totalCards} cartões de &ldquo;{folderName}&rdquo;
            </p>
          </div>

          <div className={cn("grid grid-cols-1 gap-2 sm:gap-3", studyTimerEnabled ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
            <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4 sm:p-5">
              <div className="text-3xl font-black text-primary sm:text-4xl">{totalKnown}</div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Acertos</div>
            </div>
            <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4 sm:p-5">
              <div className="text-3xl font-black text-slate-900 dark:text-white sm:text-4xl">
                {Object.values(wrongCount).reduce((a, b) => a + b, 0)}
              </div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Erros totais</div>
            </div>
            {studyTimerEnabled && (
              <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4 sm:p-5">
                <div className="text-3xl font-black tabular-nums text-slate-900 dark:text-white sm:text-4xl">
                  {formatElapsedTime(elapsedSeconds)}
                </div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Tempo final</div>
              </div>
            )}
          </div>

          {/* Palavras para revisar */}
          {sortedWrongs.length > 0 && (
            <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4 text-left space-y-3 sm:p-5 sm:space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Palavras para revisar</p>
                <Badge variant="outline" className="text-[10px] border-primary/20 text-primary">
                  {sortedWrongs.length} pendentes
                </Badge>
              </div>
              
              <div className="space-y-2 max-h-36 overflow-y-auto pr-2 scrollbar-hide sm:max-h-40">
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

          <div className="flex flex-col gap-2 pt-2 sm:pt-3">
            <Button className="w-full h-11 bg-primary hover:bg-primary/90 text-white font-bold text-base rounded-xl shadow-lg shadow-primary/20 sm:h-12 sm:text-lg" onClick={restart}>
              <RotateCw className="size-4 mr-2 sm:size-5" />
              ESTUDAR NOVAMENTE
            </Button>
            <Button
              variant="ghost"
              className="w-full h-10 text-xs text-slate-500 hover:text-slate-900 font-bold uppercase tracking-widest sm:h-11"
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
        {studyTimerEnabled && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground dark:text-white/70 sm:text-sm">
            <Clock3 className="size-3.5" />
            {formatElapsedTime(elapsedSeconds)}
          </span>
        )}
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
            <div className="mt-4 flex gap-2 sm:mt-6 sm:gap-3">
              <Button
                size="lg"
                variant="outline"
                className="h-10 flex-1 border-destructive/20 text-sm font-bold text-destructive hover:bg-destructive/10 sm:h-12 sm:text-base"
                onClick={() => advance(false)}
                disabled={animating}
              >
                <XCircle className="size-5 mr-1.5" />
                Errei
              </Button>

              <Button
                size="lg"
                className="h-10 flex-1 bg-success text-sm font-bold text-white hover:bg-success/90 sm:h-12 sm:text-base"
                onClick={() => advance(true)}
                disabled={animating}
              >
                <CheckCircle2 className="size-5 mr-1.5" />
                Acertei
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
