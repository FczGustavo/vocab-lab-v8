"use client"

import { useState, useCallback, useEffect } from "react"
import { X, RotateCcw, CheckCircle2, XCircle, Volume2, ChevronRight, Trophy, RotateCw, AlertTriangle, Languages } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useGrammarProgress } from "@/hooks/use-grammar-progress"
import type { Flashcard, ClassifiedWord, PartOfSpeech } from "@/lib/types"
import { useAnimations } from "@/hooks/use-animations"
import { useAiPreferences } from "@/hooks/use-ai-preferences"

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

interface StudyModeProps {
  flashcards: Flashcard[]
  folderName: string
  onExit: () => void
}

type StudyState = "studying" | "finished"

function ClassifiedWordList({ words, label, maxCount }: { words: ClassifiedWord[]; label: string; maxCount: number }) {
  if (!words || words.length === 0) return null
  if (maxCount <= 0) return null

  const visible = words.slice(0, maxCount)
  if (visible.length === 0) return null
  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-bold text-muted-foreground dark:text-white/40 uppercase tracking-widest">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((item, idx) => {
          const t = item.type === "abstract" ? "figurative" : item.type
          const tag = t === "literal" ? "lit" : t === "slang" ? "slng" : "fig"
          const tone =
            t === "literal"
              ? "bg-blue-500/10 text-blue-700 dark:bg-blue-500/30 dark:text-blue-100"
              : t === "slang"
                ? "bg-amber-500/10 text-amber-800 dark:bg-amber-500/30 dark:text-amber-100"
                : "bg-purple-500/10 text-purple-700 dark:bg-purple-500/30 dark:text-purple-100"
          return (
            <Badge key={idx} className={cn("text-xs font-medium border-0 py-0.5 px-2", tone)}>
              {item.word}
              <span className="ml-1 opacity-50 text-[9px] font-normal">
                ({tag})
              </span>
            </Badge>
          )
        })}
      </div>
    </div>
  )
}

export function StudyMode({ flashcards, folderName, onExit }: StudyModeProps) {
  const { saveStudySession } = useGrammarProgress()
  const { enabled: animationsEnabled } = useAnimations()
  const { synonymsLevel, includeConjugations, includeAlternativeForms, includeUsageNote } = useAiPreferences()
  
  // queue: palavras restantes. wrong: palavras erradas que voltam ao final
  const [queue, setQueue] = useState<Flashcard[]>(() => [...flashcards])
  const [wrongCount, setWrongCount] = useState<Record<string, number>>({})
  const [knownIds, setKnownIds] = useState<Set<string>>(new Set())
  const [correctFirstTryIds, setCorrectFirstTryIds] = useState<Set<string>>(new Set())
  const [isFlipped, setIsFlipped] = useState(false)
  const [showConjugations, setShowConjugations] = useState(false)
  const [showExampleTranslation, setShowExampleTranslation] = useState(false)
  const [studyState, setStudyState] = useState<StudyState>("studying")
  const [animating, setAnimating] = useState(false)
  const [direction, setDirection] = useState<"left" | "right" | null>(null)
  const [sessionSaved, setSessionSaved] = useState(false)
  const [reviewedWords, setReviewedWords] = useState<Set<string>>(new Set())

  const current = queue[0]
  const currentPartOfSpeech = current?.partOfSpeech || "noun"
  const alternativeForms =
    includeAlternativeForms && current
      ? (current.alternativeForms || []).filter(
          (f) => f.translation && f.partOfSpeech && f.partOfSpeech !== currentPartOfSpeech
        )
      : []
  const remaining = queue.length
  const totalKnown = knownIds.size
  const totalCards = flashcards.length

  useEffect(() => {
    setShowConjugations(false)
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
      }, animationsEnabled ? 350 : 50)
    },
    [animating, current, animationsEnabled, wrongCount]
  )

  const restart = () => {
    setQueue([...flashcards])
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
      <div className="fixed inset-0 z-50 bg-white dark:bg-slate-950 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-8">
          <div className="size-24 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
            <Trophy className="size-12 text-primary" />
          </div>

          <div className="space-y-2">
            <h2 className="text-4xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">
              Sessão Concluída!
            </h2>
            <p className="text-slate-500 dark:text-slate-400 font-medium">
              Você estudou todos os {totalCards} cartões de &ldquo;{folderName}&rdquo;
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
    <div className="fixed inset-0 z-50 bg-background dark:bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border dark:border-white/10">
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
        <div className="flex-1 mx-8">
          <div className="h-1.5 bg-muted dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-success rounded-full transition-all duration-500"
              style={{ width: `${(totalKnown / totalCards) * 100}%` }}
            />
          </div>
        </div>

        <span className="text-sm font-semibold text-muted-foreground dark:text-white/70">
          {totalKnown}/{totalCards}
        </span>
      </div>

      {/* Card area */}
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950/50">
        {current && (
          <div
            className={cn(
              "w-full max-w-lg transition-all",
              animationsEnabled ? "duration-350" : "duration-0",
              animating && direction === "right" && "translate-x-32 rotate-12 opacity-0",
              animating && direction === "left" && "-translate-x-32 -rotate-12 opacity-0"
            )}
          >
            {/* Flashcard */}
            <div
              className="perspective-1000 h-[450px] cursor-pointer select-none"
              onClick={() => !animating && setIsFlipped((f) => !f)}
            >
              <div
                className={cn(
                  "relative h-full w-full transform-style-3d shadow-xl rounded-2xl transition-transform",
                  animationsEnabled ? "duration-700" : "duration-0",
                  isFlipped && "rotate-y-180"
                )}
              >
                {/* Front */}
                <div className="absolute inset-0 backface-hidden rounded-2xl border border-border bg-card p-8 flex flex-col shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2 items-center">
                      <Badge className={cn("text-xs font-medium border-0", partOfSpeechColors[current.partOfSpeech || "noun"])}>
                        {partOfSpeechLabels[current.partOfSpeech || "noun"]}
                      </Badge>
                      {current.verbType && (
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider border-primary/30 text-primary">
                          {current.verbType}
                        </Badge>
                      )}
                      {current.falseCognate?.isFalseCognate && (
                        <Badge className="text-[10px] uppercase tracking-wider bg-amber-500 hover:bg-amber-600 border-0 text-white font-bold">
                          Falso Cognato
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
                    <h2 className="text-6xl font-bold text-foreground tracking-tight text-center">
                      {current.word}
                    </h2>
                  </div>

                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <RotateCcw className="size-3" />
                    <span>Clique para ver o significado</span>
                  </div>
                </div>

                {/* Back */}
                <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-2xl border border-border bg-card p-8 flex flex-col shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex gap-2 items-center">
                      <Badge className={cn("text-xs font-medium border-0", partOfSpeechColors[current.partOfSpeech || "noun"])}>
                        {partOfSpeechLabels[current.partOfSpeech || "noun"]}
                      </Badge>
                      {current.verbType && (
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider border-primary/30 text-primary">
                          {current.verbType}
                        </Badge>
                      )}
                      {current.falseCognate?.isFalseCognate && (
                        <Badge className="text-[10px] uppercase tracking-wider bg-amber-500 hover:bg-amber-600 border-0 text-white font-bold">
                          Falso Cognato
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

                  <div className="flex-1 space-y-6 overflow-y-auto pr-1 scrollbar-hide">
                    <p className="text-4xl font-bold text-foreground border-b pb-2">{current.translation}</p>
                    {includeUsageNote && !!current.usageNote && (
                      <div className="bg-muted/30 border border-border/40 rounded-xl p-4">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                          Contexto
                        </span>
                        <p className="text-sm text-foreground mt-2 leading-relaxed">
                          {current.usageNote}
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <ClassifiedWordList words={current.synonyms} label="Sinônimos" maxCount={synonymsLevel} />
                      <ClassifiedWordList words={current.antonyms} label="Antônimos" maxCount={synonymsLevel} />
                    </div>

                    <div className="bg-muted/30 p-4 rounded-xl">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        Exemplo
                      </span>
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

                    {current.falseCognate?.isFalseCognate && (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
                        <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-bold text-amber-800 dark:text-amber-400 uppercase tracking-tight">Falso Cognato</p>
                          <p className="text-sm text-amber-700 dark:text-amber-200 mt-1">
                            {current.falseCognate.warning}
                          </p>
                        </div>
                      </div>
                    )}

                    {alternativeForms.length > 0 && (
                      <div className="pt-4 border-t border-border">
                        <span className="text-[10px] font-bold text-muted-foreground dark:text-white/40 uppercase tracking-widest block mb-3">
                          Outras formas
                        </span>
                        <div className="space-y-2">
                          {alternativeForms.map((form, idx) => (
                            <div key={idx} className="bg-muted/20 rounded-xl p-3 border border-border/50">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge className={cn("text-[9px] font-bold uppercase tracking-tighter border-0", partOfSpeechColors[form.partOfSpeech])}>
                                  {partOfSpeechLabels[form.partOfSpeech]}
                                </Badge>
                                <div className="flex flex-col leading-tight min-w-0">
                                  <span className="text-sm font-bold text-foreground truncate">
                                    {(form as any).word || ""}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground truncate">
                                    {form.translation}
                                  </span>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground italic leading-relaxed">
                                {form.example}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {includeConjugations && current.conjugations && (
                      <div className="pt-4 border-t border-border">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                            Verb Tenses
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[10px] font-bold text-primary hover:bg-primary/10 hover:text-primary"
                            onClick={(e) => {
                              e.stopPropagation()
                              setShowConjugations((v) => !v)
                            }}
                          >
                            {showConjugations ? "Ocultar" : "Mostrar"}
                          </Button>
                        </div>
                        {showConjugations && (
                          <div className="grid grid-cols-2 gap-3 text-[11px]">
                            <div className="flex flex-col bg-muted/20 p-2 rounded-lg">
                              <span className="text-primary font-bold text-[9px] uppercase">Simple Present</span>
                              <span className="text-foreground font-medium">{current.conjugations.simplePresent || "n/a"}</span>
                            </div>
                            <div className="flex flex-col bg-muted/20 p-2 rounded-lg">
                              <span className="text-primary font-bold text-[9px] uppercase">Simple Past</span>
                              <span className="text-foreground font-medium">{current.conjugations.simplePast || "n/a"}</span>
                            </div>
                            <div className="flex flex-col bg-muted/20 p-2 rounded-lg">
                              <span className="text-primary font-bold text-[9px] uppercase">Pres. Continuous</span>
                              <span className="text-foreground font-medium">{current.conjugations.presentContinuous || "n/a"}</span>
                            </div>
                            <div className="flex flex-col bg-muted/20 p-2 rounded-lg">
                              <span className="text-primary font-bold text-[9px] uppercase">Past Continuous</span>
                              <span className="text-foreground font-medium">{current.conjugations.pastContinuous || "n/a"}</span>
                            </div>
                            <div className="flex flex-col bg-muted/20 p-2 rounded-lg">
                              <span className="text-primary font-bold text-[9px] uppercase">Present Perfect</span>
                              <span className="text-foreground font-medium">{current.conjugations.presentPerfect || "n/a"}</span>
                            </div>
                            <div className="flex flex-col bg-muted/20 p-2 rounded-lg">
                              <span className="text-primary font-bold text-[9px] uppercase">Past Perfect</span>
                              <span className="text-foreground font-medium">{current.conjugations.pastPerfect || "n/a"}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-4">
                    <RotateCcw className="size-3" />
                    <span>Clique para voltar</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Hint para virar antes de responder */}
            {!isFlipped && (
              <p className={cn(
                "text-center text-sm text-muted-foreground mt-6",
                animationsEnabled && "animate-pulse"
              )}>
                Toque no card para ver o verso
              </p>
            )}

            {/* Action buttons — aparecem so apos virar */}
            <div
              className={cn(
                "flex gap-4 mt-8 transition-all",
                animationsEnabled ? "duration-500" : "duration-0",
                isFlipped ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
              )}
            >
              <Button
                size="lg"
                variant="outline"
                className="flex-1 h-16 text-lg font-bold border-destructive/20 text-destructive hover:bg-destructive/10"
                onClick={() => advance(false)}
                disabled={animating}
              >
                <XCircle className="size-6 mr-2" />
                Errei
              </Button>

              <Button
                size="lg"
                className="flex-1 h-16 text-lg font-bold bg-success hover:bg-success/90 text-white"
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
