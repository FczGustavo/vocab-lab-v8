"use client"

import { useState, useCallback, useEffect } from "react"
import { X, RotateCcw, CheckCircle2, XCircle, Volume2, ChevronRight, Trophy, RotateCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useGrammarProgress } from "@/hooks/use-grammar-progress"
import type { Flashcard, ClassifiedWord, PartOfSpeech } from "@/lib/types"

const partOfSpeechLabels: Record<PartOfSpeech, string> = {
  verb: "Verbo",
  noun: "Substantivo",
  adjective: "Adjetivo",
  adverb: "Advérbio",
  preposition: "Preposição",
  conjunction: "Conjunção",
  interjection: "Interjeição",
}

const partOfSpeechColors: Record<PartOfSpeech, string> = {
  verb: "bg-blue-500/40 text-blue-200",
  noun: "bg-emerald-500/40 text-emerald-200",
  adjective: "bg-amber-500/40 text-amber-200",
  adverb: "bg-purple-500/40 text-purple-200",
  preposition: "bg-rose-500/40 text-rose-200",
  conjunction: "bg-cyan-500/40 text-cyan-200",
  interjection: "bg-orange-500/40 text-orange-200",
}

interface StudyModeProps {
  flashcards: Flashcard[]
  folderName: string
  onExit: () => void
}

type StudyState = "studying" | "finished"

function ClassifiedWordList({ words, label }: { words: ClassifiedWord[]; label: string }) {
  if (!words || words.length === 0) return null
  return (
    <div>
      <span className="text-xs font-medium text-white/60 uppercase tracking-wider">{label}</span>
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {words.map((item, idx) => (
          <Badge
            key={idx}
            className={cn(
              "text-xs font-normal border-0",
              item.type === "literal"
                ? "bg-blue-500/30 text-blue-200"
                : "bg-purple-500/30 text-purple-200"
            )}
          >
            {item.word}
            <span className="ml-1 opacity-60 text-[10px]">
              ({item.type === "literal" ? "lit" : "abs"})
            </span>
          </Badge>
        ))}
      </div>
    </div>
  )
}

export function StudyMode({ flashcards, folderName, onExit }: StudyModeProps) {
  const { saveStudySession } = useGrammarProgress()
  
  // queue: palavras restantes. wrong: palavras erradas que voltam ao final
  const [queue, setQueue] = useState<Flashcard[]>(() => [...flashcards])
  const [wrongCount, setWrongCount] = useState<Record<string, number>>({})
  const [knownIds, setKnownIds] = useState<Set<string>>(new Set())
  const [correctFirstTryIds, setCorrectFirstTryIds] = useState<Set<string>>(new Set())
  const [isFlipped, setIsFlipped] = useState(false)
  const [studyState, setStudyState] = useState<StudyState>("studying")
  const [animating, setAnimating] = useState(false)
  const [direction, setDirection] = useState<"left" | "right" | null>(null)
  const [sessionSaved, setSessionSaved] = useState(false)

  const current = queue[0]
  const remaining = queue.length
  const totalKnown = knownIds.size
  const totalCards = flashcards.length

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

      setTimeout(() => {
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
        }

        setIsFlipped(false)
        setAnimating(false)
        setDirection(null)
      }, 350)
    },
    [animating, current]
  )

  const restart = () => {
    setQueue([...flashcards])
    setWrongCount({})
    setKnownIds(new Set())
    setCorrectFirstTryIds(new Set())
    setIsFlipped(false)
    setStudyState("studying")
    setDirection(null)
    setAnimating(false)
    setSessionSaved(false)
  }

  // --- Tela de conclusao ---
  if (studyState === "finished") {
    return (
      <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="size-24 rounded-full bg-success/20 border border-success/40 flex items-center justify-center mx-auto">
            <Trophy className="size-12 text-success" />
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl font-bold text-white">Sessao concluida!</h2>
            <p className="text-white/60">Voce estudou todos os {totalCards} flashcards de &ldquo;{folderName}&rdquo;</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/10 rounded-xl p-4">
              <div className="text-3xl font-bold text-success">{totalKnown}</div>
              <div className="text-sm text-white/60 mt-1">Acertos</div>
            </div>
            <div className="bg-white/10 rounded-xl p-4">
              <div className="text-3xl font-bold text-destructive">
                {Object.values(wrongCount).reduce((a, b) => a + b, 0)}
              </div>
              <div className="text-sm text-white/60 mt-1">Erros totais</div>
            </div>
          </div>

          {/* Palavras mais erradas */}
          {Object.keys(wrongCount).length > 0 && (
            <div className="bg-white/5 rounded-xl p-4 text-left space-y-2">
              <p className="text-xs font-medium text-white/50 uppercase tracking-wider">Palavras para revisar</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(wrongCount)
                  .sort((a, b) => b[1] - a[1])
                  .map(([id, count]) => {
                    const card = flashcards.find((f) => f.id === id)
                    return card ? (
                      <Badge key={id} className="bg-destructive/20 text-red-200 border-0">
                        {card.word} &times;{count}
                      </Badge>
                    ) : null
                  })}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 border-white/20 text-white hover:bg-white/10 hover:text-white bg-transparent"
              onClick={onExit}
            >
              <X className="size-4 mr-2" />
              Sair
            </Button>
            <Button className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground" onClick={restart}>
              <RotateCw className="size-4 mr-2" />
              Estudar novamente
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // --- Tela principal de estudo ---
  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-white/70 hover:text-white hover:bg-white/10"
            onClick={onExit}
          >
            <X className="size-5" />
          </Button>
          <div>
            <p className="text-sm font-medium text-white">{folderName}</p>
            <p className="text-xs text-white/50">
              {remaining} restante{remaining !== 1 ? "s" : ""}
              {totalKnown > 0 && ` · ${totalKnown} aprendida${totalKnown !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex-1 mx-8">
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-success rounded-full transition-all duration-500"
              style={{ width: `${(totalKnown / totalCards) * 100}%` }}
            />
          </div>
        </div>

        <span className="text-sm font-semibold text-white/70">
          {totalKnown}/{totalCards}
        </span>
      </div>

      {/* Card area */}
      <div className="flex-1 flex items-center justify-center p-6">
        {current && (
          <div
            className={cn(
              "w-full max-w-lg transition-all duration-350",
              animating && direction === "right" && "translate-x-24 opacity-0",
              animating && direction === "left" && "-translate-x-24 opacity-0"
            )}
          >
            {/* Flashcard */}
            <div
              className="perspective-1000 h-96 cursor-pointer select-none"
              onClick={() => !animating && setIsFlipped((f) => !f)}
            >
              <div
                className={cn(
                  "relative h-full w-full transition-transform duration-500 transform-style-3d",
                  isFlipped && "rotate-y-180"
                )}
              >
                {/* Front */}
                <div className="absolute inset-0 backface-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-8 flex flex-col shadow-2xl">
                  <div className="flex items-center justify-between">
                    <Badge className={cn("text-xs font-medium border-0", partOfSpeechColors[current.partOfSpeech || "noun"])}>
                      {partOfSpeechLabels[current.partOfSpeech || "noun"]}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-white/40 hover:text-white hover:bg-white/10"
                      onClick={(e) => {
                        e.stopPropagation()
                        speak(current.word)
                      }}
                    >
                      <Volume2 className="size-4" />
                    </Button>
                  </div>

                  <div className="flex-1 flex items-center justify-center">
                    <h2 className="text-5xl font-bold text-white tracking-tight text-balance text-center">
                      {current.word}
                    </h2>
                  </div>

                  <div className="flex items-center justify-center gap-2 text-xs text-white/30">
                    <RotateCcw className="size-3" />
                    <span>Clique para ver o significado</span>
                  </div>
                </div>

                {/* Back */}
                <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-8 flex flex-col shadow-2xl overflow-hidden">
                  <div className="flex items-center justify-between mb-4">
                    <Badge className={cn("text-xs font-medium border-0", partOfSpeechColors[current.partOfSpeech || "noun"])}>
                      {partOfSpeechLabels[current.partOfSpeech || "noun"]}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-white/40 hover:text-white hover:bg-white/10"
                      onClick={(e) => {
                        e.stopPropagation()
                        speak(current.word)
                      }}
                    >
                      <Volume2 className="size-4" />
                    </Button>
                  </div>

                  <div className="flex-1 space-y-4 overflow-y-auto pr-1">
                    <p className="text-3xl font-bold text-white">{current.translation}</p>

                    <ClassifiedWordList words={current.synonyms} label="Sinonimos" />
                    <ClassifiedWordList words={current.antonyms} label="Antonimos" />

                    <div>
                      <span className="text-xs font-medium text-white/40 uppercase tracking-wider">
                        Exemplo
                      </span>
                      <p className="text-sm text-white/80 italic mt-1 leading-relaxed">
                        {current.example}
                      </p>
                    </div>

                    {current.conjugations && (
                      <div className="pt-3 border-t border-white/10">
                        <span className="text-xs font-medium text-white/40 uppercase tracking-wider block mb-2">
                          Verb Tenses
                        </span>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
                          <div className="flex flex-col border-b border-white/5 pb-1">
                            <span className="text-blue-300/70 uppercase font-bold text-[8px]">Simple Present</span>
                            <span className="text-white/80 font-medium truncate">{current.conjugations.simplePresent || "n/a"}</span>
                          </div>
                          <div className="flex flex-col border-b border-white/5 pb-1">
                            <span className="text-blue-300/70 uppercase font-bold text-[8px]">Simple Past</span>
                            <span className="text-white/80 font-medium truncate">{current.conjugations.simplePast || "n/a"}</span>
                          </div>
                          <div className="flex flex-col border-b border-white/5 pb-1">
                            <span className="text-blue-300/70 uppercase font-bold text-[8px]">Pres. Continuous</span>
                            <span className="text-white/80 font-medium truncate">{current.conjugations.presentContinuous || "n/a"}</span>
                          </div>
                          <div className="flex flex-col border-b border-white/5 pb-1">
                            <span className="text-blue-300/70 uppercase font-bold text-[8px]">Past Continuous</span>
                            <span className="text-white/80 font-medium truncate">{current.conjugations.pastContinuous || "n/a"}</span>
                          </div>
                          <div className="flex flex-col border-b border-white/5 pb-1">
                            <span className="text-blue-300/70 uppercase font-bold text-[8px]">Present Perfect</span>
                            <span className="text-white/80 font-medium truncate">{current.conjugations.presentPerfect || "n/a"}</span>
                          </div>
                          <div className="flex flex-col border-b border-white/5 pb-1">
                            <span className="text-blue-300/70 uppercase font-bold text-[8px]">Past Perfect</span>
                            <span className="text-white/80 font-medium truncate">{current.conjugations.pastPerfect || "n/a"}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {current.alternativeForms && current.alternativeForms.length > 0 && (
                      <div className="pt-3 border-t border-white/10">
                        <span className="text-xs font-medium text-white/40 uppercase tracking-wider">
                          Outras formas
                        </span>
                        <div className="space-y-2 mt-2">
                          {current.alternativeForms.map((form, idx) => (
                            <div key={idx} className="bg-white/5 rounded-lg p-2">
                              <div className="flex items-center gap-2 mb-0.5">
                                <Badge className={cn("text-[10px] font-medium border-0", partOfSpeechColors[form.partOfSpeech])}>
                                  {partOfSpeechLabels[form.partOfSpeech]}
                                </Badge>
                                <span className="text-sm font-medium text-white">
                                  {form.translation}
                                </span>
                              </div>
                              <p className="text-xs text-white/60 italic">
                                {form.example}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-center gap-2 text-xs text-white/30 pt-2">
                    <RotateCcw className="size-3" />
                    <span>Clique para voltar</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Hint para virar antes de responder */}
            {!isFlipped && (
              <p className="text-center text-sm text-white/30 mt-4">
                Vire o card antes de responder
              </p>
            )}

            {/* Action buttons — aparecem so apos virar */}
            <div
              className={cn(
                "flex gap-4 mt-6 transition-all duration-300",
                isFlipped ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
              )}
            >
              <Button
                size="lg"
                className="flex-1 h-14 text-base font-semibold bg-destructive/20 hover:bg-destructive/40 text-red-200 border border-destructive/30 hover:border-destructive/50"
                onClick={() => advance(false)}
                disabled={animating}
              >
                <XCircle className="size-5 mr-2" />
                Errei
              </Button>

              <Button
                size="lg"
                className="flex-1 h-14 text-base font-semibold bg-success/20 hover:bg-success/40 text-green-200 border border-success/30 hover:border-success/50"
                onClick={() => advance(true)}
                disabled={animating}
              >
                <CheckCircle2 className="size-5 mr-2" />
                Acertei
              </Button>
            </div>

            {/* Skip sem julgar */}
            {isFlipped && (
              <div className="flex justify-center mt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white/30 hover:text-white/60 hover:bg-white/5 gap-1.5"
                  onClick={() => {
                    if (animating) return
                    setQueue((prev) => {
                      const [head, ...rest] = prev
                      return [...rest, head]
                    })
                    setIsFlipped(false)
                  }}
                >
                  <ChevronRight className="size-4" />
                  Pular por agora
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
