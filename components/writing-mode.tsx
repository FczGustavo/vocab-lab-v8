"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { X, Pencil, Trophy, RotateCw, CheckCircle2, XCircle, Rotate3D, Languages, Volume2, Clock3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useAnimations } from "@/hooks/use-animations"
import { useStudyTimer } from "@/hooks/use-study-timer"
import type { Flashcard, PartOfSpeech } from "@/lib/types"

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
  verb: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/40 dark:text-blue-200",
  noun: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/40 dark:text-emerald-200",
  adjective: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/40 dark:text-amber-200",
  adverb: "bg-purple-500/10 text-purple-600 dark:bg-purple-500/40 dark:text-purple-200",
  preposition: "bg-rose-500/10 text-rose-600 dark:bg-rose-500/40 dark:text-rose-200",
  conjunction: "bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/40 dark:text-cyan-200",
  interjection: "bg-orange-500/10 text-orange-600 dark:bg-orange-500/40 dark:text-orange-200",
  phrase: "bg-teal-500/10 text-teal-600 dark:bg-teal-500/40 dark:text-teal-200",
  acronym: "bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/40 dark:text-indigo-200",
}

interface WritingModeProps {
  flashcards: Flashcard[]
  onExit: () => void
  onRemoveFromReview: (id: string) => Promise<boolean>
}

type Stage = "rate" | "write" | "correct" | "wrong"

function formatElapsedTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

export function WritingMode({ flashcards, onExit, onRemoveFromReview }: WritingModeProps) {
  const { enabled: animationsEnabled } = useAnimations()
  const { enabled: studyTimerEnabled } = useStudyTimer()
  const totalCards = flashcards.length
  const [queue, setQueue] = useState<Flashcard[]>(() => [...flashcards])
  const [inputValue, setInputValue] = useState("")
  const [stage, setStage] = useState<Stage>("rate")
  const [sessionCorrect, setSessionCorrect] = useState(0)
  const [sessionWrong, setSessionWrong] = useState(0)
  const [doneCount, setDoneCount] = useState(0)
  const [isFinished, setIsFinished] = useState(false)
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set())
  const [isFlipped, setIsFlipped] = useState(false)
  const [showExampleTranslation, setShowExampleTranslation] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const sessionStartedAtRef = useRef<number>(Date.now())
  const inputRef = useRef<HTMLInputElement>(null)

  const current = queue[0]
  const needsMandatoryWrite = Boolean(current && failedIds.has(current.id))

  useEffect(() => {
    if (!current) return
    setInputValue("")
    setStage(failedIds.has(current.id) ? "write" : "rate")
    setIsFlipped(false)
    setShowExampleTranslation(false)
  }, [current?.id])

  useEffect(() => {
    if (stage === "write") {
      setIsFlipped(true)
      const t = setTimeout(() => inputRef.current?.focus(), 80)
      return () => clearTimeout(t)
    }
  }, [stage, current?.id])

  useEffect(() => {
    if (!studyTimerEnabled || isFinished) return

    const tick = () => {
      const seconds = Math.floor((Date.now() - sessionStartedAtRef.current) / 1000)
      setElapsedSeconds(Math.max(0, seconds))
    }

    tick()
    const timerId = window.setInterval(tick, 1000)
    return () => window.clearInterval(timerId)
  }, [isFinished, studyTimerEnabled])

  const speak = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = "en-US"
    speechSynthesis.speak(utterance)
  }

  const completeCurrentCard = useCallback(() => {
    setQueue((prev) => {
      const next = prev.slice(1)
      if (next.length === 0) setIsFinished(true)
      return next
    })
    setDoneCount((prev) => prev + 1)
    setInputValue("")
    setStage("rate")
  }, [])

  const rotateCurrentToEnd = useCallback(() => {
    setQueue((prev) => {
      if (prev.length <= 1) return prev
      const [head, ...rest] = prev
      return [...rest, head]
    })
    setInputValue("")
    setStage("rate")
  }, [])

  const markAsLearned = useCallback(
    async (cardId: string) => {
      setRemovedIds((prev) => new Set([...prev, cardId]))
      await onRemoveFromReview(cardId)
    },
    [onRemoveFromReview]
  )

  const handleRate = useCallback(
    async (knew: boolean) => {
      if (!current || stage !== "rate") return
      setIsFlipped(false)

      if (knew) {
        setSessionCorrect((prev) => prev + 1)
        setStage("correct")
        await markAsLearned(current.id)
        completeCurrentCard()
        return
      }

      setSessionWrong((prev) => prev + 1)
      setFailedIds((prev) => new Set([...prev, current.id]))
      setStage("wrong")
      rotateCurrentToEnd()
    },
    [current, stage, markAsLearned, completeCurrentCard, rotateCurrentToEnd]
  )

  const handleVerifyWriting = useCallback(async () => {
    if (!current || stage !== "write") return

    const answer = inputValue.trim().toLowerCase()
    const expected = current.word.trim().toLowerCase()
    if (!answer) return

    if (answer === expected) {
      setSessionCorrect((prev) => prev + 1)
      setStage("correct")
      await markAsLearned(current.id)
      completeCurrentCard()
      return
    }

    setSessionWrong((prev) => prev + 1)
    setStage("wrong")
    setInputValue("")
    rotateCurrentToEnd()
  }, [current, stage, inputValue, markAsLearned, completeCurrentCard, rotateCurrentToEnd])

  const restart = () => {
    setQueue([...flashcards])
    setInputValue("")
    setStage("rate")
    setSessionCorrect(0)
    setSessionWrong(0)
    setDoneCount(0)
    setIsFinished(false)
    setRemovedIds(new Set())
    setFailedIds(new Set())
    sessionStartedAtRef.current = Date.now()
    setElapsedSeconds(0)
  }

  if (isFinished) {
    const kept = totalCards - removedIds.size
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-background p-3 sm:p-5">
        <div className="mx-auto w-full max-w-[720px] space-y-4 py-2 text-center sm:space-y-5">
          <div className="size-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto sm:size-20">
            <Trophy className="size-8 text-primary sm:size-10" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900 dark:text-white sm:text-3xl">
              Revisão Concluída!
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium sm:text-base">
              Você praticou {totalCards} {totalCards === 1 ? "palavra" : "palavras"} por escrita
            </p>
          </div>

          <div className={cn("grid grid-cols-1 gap-2 sm:gap-3", studyTimerEnabled ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
            <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4 sm:p-5">
              <div className="text-3xl font-black text-success sm:text-4xl">{sessionCorrect}</div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Acertos</div>
            </div>
            <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4 sm:p-5">
              <div className="text-3xl font-black text-destructive sm:text-4xl">{sessionWrong}</div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Erros</div>
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

          {removedIds.size > 0 && (
            <div className="bg-success/5 border border-success/20 rounded-2xl p-4 flex items-center justify-center gap-2">
              <CheckCircle2 className="size-5 text-success" />
              <p className="text-sm font-bold text-success">
                {removedIds.size} {removedIds.size === 1 ? "palavra removida" : "palavras removidas"} da revisão!
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2 sm:pt-3">
            {kept > 0 && (
              <Button
                className="w-full h-11 bg-primary hover:bg-primary/90 text-white font-bold text-base rounded-xl shadow-lg shadow-primary/20 sm:h-12 sm:text-lg"
                onClick={restart}
              >
                <RotateCw className="size-4 mr-2 sm:size-5" />
                REPETIR REVISÃO
              </Button>
            )}
            <Button
              variant="ghost"
              className="w-full h-10 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white font-bold uppercase tracking-widest sm:h-11"
              onClick={onExit}
            >
              Sair para o início
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!current) return null

  const progress = (doneCount / totalCards) * 100
  const remaining = queue.length

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background dark:bg-slate-900">
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
            <p className="text-sm font-medium text-foreground dark:text-white flex items-center gap-1.5">
              <Pencil className="size-3.5" />
              Escrita Obrigatória
            </p>
            <p className="text-xs text-muted-foreground dark:text-white/50">
              {remaining} restante{remaining !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="mx-2 flex-1 sm:mx-8">
          <div className="h-1.5 bg-muted dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className={cn("h-full bg-success rounded-full transition-all", animationsEnabled ? "duration-500" : "duration-0")}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <span className="text-xs font-semibold text-muted-foreground dark:text-white/70 sm:text-sm">
          {doneCount}/{totalCards}
        </span>
        {studyTimerEnabled && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground dark:text-white/70 sm:text-sm">
            <Clock3 className="size-3.5" />
            {formatElapsedTime(elapsedSeconds)}
          </span>
        )}
      </div>

      <div className="flex flex-1 items-center justify-center bg-slate-50 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] dark:bg-slate-950/50 sm:p-6">
        <div className="w-full max-w-xl">
          <div
            className={cn(
              "w-full max-w-xl transform-gpu will-change-transform transition-all",
              animationsEnabled ? "duration-200" : "duration-0"
            )}
          >
            <div
              className="perspective-1000 h-[62vh] min-h-[360px] max-h-[450px] cursor-pointer select-none sm:h-[450px]"
              onClick={() => {
                if (stage === "write") return
                setIsFlipped((f) => !f)
              }}
            >
            <div
              className={cn(
                "relative h-full w-full transform-gpu will-change-transform transform-style-3d rounded-2xl transition-transform",
                animationsEnabled ? "duration-500" : "duration-0",
                isFlipped && "rotate-y-180"
              )}
            >
              <div
                className="surface-card surface-card-elevated interactive-lift absolute inset-0 flex flex-col rounded-[22px] bg-card p-5 backface-hidden sm:rounded-[26px] sm:p-8"
              >
                <div className="flex items-center justify-between">
                  <div className="flex gap-2 items-center">
                    <Badge
                      className={cn(
                        "text-xs font-medium border-0",
                        partOfSpeechColors[current.partOfSpeech || "noun"]
                      )}
                    >
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
                    disabled={stage === "write"}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (stage === "write") return
                      setIsFlipped((v) => !v)
                    }}
                  >
                    <Rotate3D className="size-4" />
                  </Button>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                  <h2 className="text-center text-4xl font-medium tracking-tight text-foreground sm:text-6xl">
                    {current.word}
                  </h2>
                </div>

                {stage !== "write" && <Rotate3D className="minimal-rotate-hint size-4 text-muted-foreground" />}
              </div>

              <div
                className="surface-card surface-card-elevated interactive-lift absolute inset-0 flex flex-col overflow-hidden rounded-[22px] bg-card p-5 backface-hidden rotate-y-180 sm:rounded-[26px] sm:p-8"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex gap-2 items-center">
                    <Badge
                      className={cn(
                        "text-xs font-medium border-0",
                        partOfSpeechColors[current.partOfSpeech || "noun"]
                      )}
                    >
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
                  <p className="border-b border-border/50 pb-2 text-2xl font-medium text-foreground sm:text-4xl">
                    {current.translation}
                  </p>

                  {current.example && (
                    <div>
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Exemplo</span>
                      <p className="text-base text-foreground italic mt-2 leading-relaxed">&ldquo;{current.example}&rdquo;</p>
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
                            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{current.exampleTranslation}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {stage !== "write" && current.usageNote && (
                    <div className="bg-muted/30 rounded-xl p-4">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Contexto</span>
                      <p className="text-sm text-foreground mt-2 leading-relaxed">{current.usageNote}</p>
                    </div>
                  )}

                  {stage === "write" && (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                      <p className="text-sm font-semibold text-primary">Agora escreva a palavra em inglês.</p>
                    </div>
                  )}
                </div>

                <Rotate3D className="minimal-rotate-hint size-4 text-muted-foreground" />
              </div>
            </div>
          </div>
          </div>

          {(stage === "rate" || stage === "correct" || stage === "wrong") && (
            <>
              <div className="mt-4 flex gap-2 sm:mt-6 sm:gap-3">
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-10 flex-1 border-destructive/20 text-sm font-bold text-destructive hover:bg-destructive/10 sm:h-12 sm:text-base"
                    onClick={() => void handleRate(false)}
                    disabled={stage !== "rate"}
                  >
                    <XCircle className="size-5 mr-1.5" />
                    Errei
                  </Button>
                  <Button
                    size="lg"
                    className="h-10 flex-1 bg-success text-sm font-bold text-white hover:bg-success/90 sm:h-12 sm:text-base"
                    onClick={() => void handleRate(true)}
                    disabled={stage !== "rate"}
                  >
                    <CheckCircle2 className="size-5 mr-1.5" />
                    Acertei
                  </Button>
              </div>
              <Button
                variant="ghost"
                className="mt-2 h-9 w-full text-xs font-semibold text-muted-foreground hover:text-foreground"
                onClick={onExit}
              >
                Voltar ao início
              </Button>
            </>
          )}

          {stage === "write" && (
            <div className="space-y-3">
              <input
                ref={inputRef}
                type="text"
                placeholder="Digite em inglês..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleVerifyWriting()
                }}
                className={cn(
                  "w-full rounded-full border bg-card px-5 py-3 text-center text-xl font-medium outline-none transition-colors sm:px-6 sm:py-4 sm:text-2xl",
                  "placeholder:text-muted-foreground/40 placeholder:font-normal placeholder:text-xl",
                  "border-border/50 focus:border-primary dark:border-white/10 dark:focus:border-primary"
                )}
              />
              <Button
                className="h-12 w-full text-base font-bold sm:h-14 sm:text-lg"
                onClick={() => void handleVerifyWriting()}
                disabled={!inputValue.trim()}
              >
                Verificar escrita
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
