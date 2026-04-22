"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { X, Pencil, Trophy, RotateCw, CheckCircle2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
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

type FeedbackState = "idle" | "correct" | "wrong-first" | "wrong-auto"

export function WritingMode({ flashcards, onExit, onRemoveFromReview }: WritingModeProps) {
  const totalCards = flashcards.length
  const [queue, setQueue] = useState<Flashcard[]>(() => [...flashcards])
  const [inputValue, setInputValue] = useState("")
  const [feedbackState, setFeedbackState] = useState<FeedbackState>("idle")
  const [attemptCount, setAttemptCount] = useState(0)
  const [sessionCorrect, setSessionCorrect] = useState(0)
  const [sessionWrong, setSessionWrong] = useState(0)
  const [doneCount, setDoneCount] = useState(0)
  const [isFinished, setIsFinished] = useState(false)
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  const current = queue[0]

  useEffect(() => {
    if (feedbackState === "idle" || feedbackState === "wrong-first") {
      const t = setTimeout(() => inputRef.current?.focus(), 80)
      return () => clearTimeout(t)
    }
  }, [current?.id, feedbackState])

  const advanceCard = useCallback(() => {
    setQueue((prev) => {
      const next = prev.slice(1)
      if (next.length === 0) setIsFinished(true)
      return next
    })
    setDoneCount((prev) => prev + 1)
    setInputValue("")
    setFeedbackState("idle")
    setAttemptCount(0)
  }, [])

  const handleSubmit = useCallback(() => {
    if (!current) return
    if (feedbackState === "correct" || feedbackState === "wrong-auto") return

    const answer = inputValue.trim().toLowerCase()
    const expected = current.word.trim().toLowerCase()

    if (answer === expected) {
      setFeedbackState("correct")
      if (attemptCount === 0) {
        setSessionCorrect((prev) => prev + 1)
        setRemovedIds((prev) => new Set([...prev, current.id]))
        onRemoveFromReview(current.id)
        setTimeout(() => advanceCard(), 1500)
      } else {
        setTimeout(() => advanceCard(), 900)
      }
    } else {
      const newCount = attemptCount + 1
      setAttemptCount(newCount)

      if (newCount >= 2) {
        setFeedbackState("wrong-auto")
        setSessionWrong((prev) => prev + 1)
        setTimeout(() => advanceCard(), 2200)
      } else {
        setFeedbackState("wrong-first")
        setInputValue("")
      }
    }
  }, [current, feedbackState, inputValue, attemptCount, onRemoveFromReview, advanceCard])

  const restart = () => {
    setQueue([...flashcards])
    setInputValue("")
    setFeedbackState("idle")
    setAttemptCount(0)
    setSessionCorrect(0)
    setSessionWrong(0)
    setDoneCount(0)
    setIsFinished(false)
    setRemovedIds(new Set())
  }

  if (isFinished) {
    const kept = totalCards - removedIds.size
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background p-4 sm:p-6">
        <div className="w-full max-w-md space-y-6 text-center sm:space-y-8">
          <div className="size-24 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
            <Trophy className="size-12 text-primary" />
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl font-black uppercase tracking-tighter text-slate-900 dark:text-white sm:text-4xl">
              Revisão Concluída!
            </h2>
            <p className="text-slate-500 dark:text-slate-400 font-medium">
              Você praticou {totalCards} {totalCards === 1 ? "palavra" : "palavras"} por escrita
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6">
              <div className="text-4xl font-black text-success">{sessionCorrect}</div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Acertos na 1ª</div>
            </div>
            <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6">
              <div className="text-4xl font-black text-destructive">{sessionWrong}</div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Com erro</div>
            </div>
          </div>

          {removedIds.size > 0 && (
            <div className="bg-success/5 border border-success/20 rounded-2xl p-4 flex items-center justify-center gap-2">
              <CheckCircle2 className="size-5 text-success" />
              <p className="text-sm font-bold text-success">
                {removedIds.size} {removedIds.size === 1 ? "palavra removida" : "palavras removidas"} da revisão!
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3 pt-4">
            {kept > 0 && (
              <Button
                className="w-full h-14 bg-primary hover:bg-primary/90 text-white font-bold text-lg rounded-xl shadow-lg shadow-primary/20"
                onClick={restart}
              >
                <RotateCw className="size-5 mr-2" />
                REPETIR REVISÃO
              </Button>
            )}
            <Button
              variant="ghost"
              className="w-full h-12 text-slate-500 hover:text-slate-900 dark:hover:text-white font-bold uppercase tracking-widest"
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
            <p className="text-sm font-medium text-foreground dark:text-white flex items-center gap-1.5">
              <Pencil className="size-3.5" />
              Escrita Obrigatória
            </p>
            <p className="text-xs text-muted-foreground dark:text-white/50">
              {doneCount} de {totalCards} concluídos
            </p>
          </div>
        </div>

        <div className="mx-2 flex-1 sm:mx-8">
          <div className="h-1.5 bg-muted dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-success rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <span className="text-xs font-semibold text-muted-foreground dark:text-white/70 sm:text-sm">
          {doneCount}/{totalCards}
        </span>
      </div>

      {/* Content */}
      <div className="flex flex-1 items-center justify-center bg-muted/20 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:p-6">
        <div className="w-full max-w-xl space-y-4 sm:space-y-6">
          {/* Translation card */}
          <div className="surface-card surface-card-elevated space-y-4 p-4 sm:p-6">
            <div className="flex items-center gap-2">
              <Badge
                className={cn(
                  "text-xs font-medium border-0",
                  partOfSpeechColors[current.partOfSpeech || "noun"]
                )}
              >
                {partOfSpeechLabels[current.partOfSpeech || "noun"]}
              </Badge>
            </div>
            <p className="text-3xl font-medium leading-tight text-foreground sm:text-4xl">{current.translation}</p>
            {current.usageNote && (
              <div className="bg-muted/30 rounded-xl p-3">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Contexto</span>
                <p className="text-sm text-foreground mt-1 leading-relaxed">{current.usageNote}</p>
              </div>
            )}
          </div>

          {/* Feedback: wrong */}
          {(feedbackState === "wrong-first" || feedbackState === "wrong-auto") && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex items-start gap-3">
              <XCircle className="size-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-destructive">
                  {feedbackState === "wrong-auto" ? "Resposta incorreta — avançando…" : "Resposta incorreta!"}
                </p>
                <p className="text-sm text-foreground mt-1">
                  Resposta correta:{" "}
                  <span className="font-bold">{current.word}</span>
                </p>
                {feedbackState === "wrong-first" && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Digite a resposta correta para continuar.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Feedback: correct */}
          {feedbackState === "correct" && (
            <div className="bg-success/10 border border-success/30 rounded-xl p-4 flex items-center gap-3">
              <CheckCircle2 className="size-5 text-success" />
              <div>
                <p className="text-sm font-bold text-success">Correto!</p>
                <p className="text-sm font-medium text-foreground">{current.word}</p>
              </div>
            </div>
          )}

          {/* Input area */}
          <div className="space-y-3">
            <input
              ref={inputRef}
              type="text"
              placeholder="Digite em inglês..."
              value={inputValue}
              onChange={(e) => {
                if (feedbackState === "idle" || feedbackState === "wrong-first") {
                  setInputValue(e.target.value)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit()
              }}
              disabled={feedbackState === "correct" || feedbackState === "wrong-auto"}
              className={cn(
                "w-full rounded-full border bg-card px-5 py-3 text-center text-xl font-medium outline-none transition-colors sm:px-6 sm:py-4 sm:text-2xl",
                "placeholder:text-muted-foreground/40 placeholder:font-normal placeholder:text-xl",
                "disabled:cursor-not-allowed",
                feedbackState === "idle" &&
                  "border-border/50 focus:border-primary dark:border-white/10 dark:focus:border-primary",
                feedbackState === "correct" && "border-success bg-success/5 text-success",
                (feedbackState === "wrong-first" || feedbackState === "wrong-auto") &&
                  "border-destructive/50 bg-destructive/5"
              )}
            />
            <Button
              className="h-12 w-full text-base font-bold sm:h-14 sm:text-lg"
              onClick={handleSubmit}
              disabled={
                !inputValue.trim() ||
                feedbackState === "correct" ||
                feedbackState === "wrong-auto"
              }
            >
              Verificar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
