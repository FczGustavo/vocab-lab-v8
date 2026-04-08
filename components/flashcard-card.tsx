"use client"

import { useEffect, useState } from "react"
import { Trash2, RotateCcw, Volume2, AlertTriangle, Pencil, Loader2, Languages } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import type { Flashcard, ClassifiedWord, PartOfSpeech, AlternativeForm } from "@/lib/types"
import { useAnimations } from "@/hooks/use-animations"
import { useAiPreferences } from "@/hooks/use-ai-preferences"
import { useApiKey } from "@/hooks/use-api-key"
import { useGptModel } from "@/hooks/use-gpt-model"
import { toast } from "@/hooks/use-toast"
import { reviseFlashcardByTranslation } from "@/lib/openai"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

interface FlashcardCardProps {
  flashcard: Flashcard
  onDelete?: (id: string) => void
  onCreateFromAlternative?: (base: Flashcard, form: AlternativeForm) => void
  onUpdateFlashcard?: (flashcard: Flashcard) => Promise<boolean>
  layout?: "grid" | "list" | "compact"
}

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
  verb: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  noun: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  adjective: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  adverb: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  preposition: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  conjunction: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",
  interjection: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
}

function ClassifiedWordList({ 
  words, 
  label,
  maxCount,
}: { 
  words: ClassifiedWord[]
  label: string
  maxCount: number
}) {
  if (!words || words.length === 0) return null
  if (maxCount <= 0) return null

  const visible = words.slice(0, maxCount)
  if (visible.length === 0) return null

  return (
    <div className="space-y-1">
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
        {label}:
      </span>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((item, idx) => {
          const t = item.type === "abstract" ? "figurative" : item.type
          const tag = t === "literal" ? "lit" : t === "slang" ? "slng" : "fig"
          const tone =
            t === "literal"
              ? "bg-blue-500/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
              : t === "slang"
                ? "bg-amber-500/10 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"
                : "bg-purple-500/10 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300"

          return (
            <Badge
              key={idx}
              variant="outline"
              className={cn("text-[10px] font-medium py-0 px-2 h-5 border-0", tone)}
            >
              {item.word}
              <span className="ml-1 opacity-50 text-[8px] font-normal">
                ({tag})
              </span>
            </Badge>
          )
        })}
      </div>
    </div>
  )
}

export function FlashcardCard({ flashcard, onDelete, onCreateFromAlternative, onUpdateFlashcard, layout = "grid" }: FlashcardCardProps) {
  const [isFlipped, setIsFlipped] = useState(false)
  const [showConjugations, setShowConjugations] = useState(false)
  const [showExampleTranslation, setShowExampleTranslation] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [translationDraft, setTranslationDraft] = useState("")
  const [editBusy, setEditBusy] = useState(false)
  const { enabled: animationsEnabled } = useAnimations()
  const { synonymsLevel, includeConjugations, includeAlternativeForms, includeUsageNote, efommMode } = useAiPreferences()
  const { apiKey, hasApiKey } = useApiKey()
  const { model } = useGptModel()

  const speak = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = "en-US"
    speechSynthesis.speak(utterance)
  }

  const partOfSpeech = flashcard.partOfSpeech || "noun"
  const alternativeForms = includeAlternativeForms
    ? (flashcard.alternativeForms || []).filter(
        (f) => f.translation && f.partOfSpeech && f.partOfSpeech !== partOfSpeech
      )
    : []

  useEffect(() => {
    if (editOpen) {
      setTranslationDraft(flashcard.translation || "")
    }
  }, [editOpen, flashcard.translation])

  const submitTranslationEdit = async () => {
    const nextTranslation = translationDraft.trim()
    if (!nextTranslation) return
    if (!hasApiKey || !apiKey) {
      toast({
        title: "API Key necessária",
        description: "Configure sua chave do OpenRouter nas configurações.",
        variant: "destructive",
      })
      return
    }
    if (!onUpdateFlashcard) {
      toast({
        title: "Não foi possível salvar",
        description: "Atualização do card não está disponível nesta tela.",
        variant: "destructive",
      })
      return
    }

    setEditBusy(true)
    const t = toast({
      title: "Reanalisando card…",
      description: `${flashcard.word} → ${nextTranslation}`,
    })

    try {
      const revised = await reviseFlashcardByTranslation(
        apiKey,
        {
          word: flashcard.word,
          partOfSpeech: flashcard.partOfSpeech,
          translation: nextTranslation,
          efommMode,
          synonymsLevel,
          includeAlternativeForms,
          includeUsageNote,
        },
        model
      )

      const updated: Flashcard = {
        ...flashcard,
        translation: revised.translation,
        usageNote: revised.usageNote || "",
        synonyms: revised.synonyms as any,
        antonyms: revised.antonyms as any,
        example: revised.example,
        exampleTranslation: (revised as any).exampleTranslation || "",
        alternativeForms: revised.alternativeForms as any,
        falseCognate: revised.falseCognate,
      }

      const ok = await onUpdateFlashcard(updated)
      if (!ok) throw new Error("Falha ao atualizar o card no banco local.")

      t.update({
        id: t.id,
        title: "Card atualizado",
        description: "Tradução e conteúdo foram recalculados.",
      })
      setEditOpen(false)
    } catch (err) {
      t.update({
        id: t.id,
        title: "Erro ao atualizar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setEditBusy(false)
    }
  }

  // List Layout
  if (layout === "list") {
    return (
      <Card className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4 hover:shadow-md transition-shadow">
        <div className="flex flex-col min-w-0 flex-1">
          <h3 className="text-lg font-bold text-foreground leading-tight truncate">
            {flashcard.word}
          </h3>
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm text-muted-foreground truncate flex-1">
              {flashcard.translation}
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={() => setEditOpen(true)}
              title="Editar tradução"
            >
              <Pencil className="size-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 shrink-0">
          <div className="flex flex-wrap justify-end items-center gap-2">
            <Badge
              variant="outline"
              className={cn("text-[10px] h-5", partOfSpeechColors[partOfSpeech])}
            >
              {partOfSpeechLabels[partOfSpeech]}
            </Badge>
            {flashcard.verbType && (
              <Badge variant="outline" className="text-[9px] uppercase tracking-wider border-primary/30 text-primary h-5">
                {flashcard.verbType}
              </Badge>
            )}
            {flashcard.falseCognate?.isFalseCognate && (
              <Badge className="text-[9px] px-1.5 h-4 bg-amber-500 hover:bg-amber-600 border-0 text-white font-bold uppercase tracking-tighter">
                Falso Cognato
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => speak(flashcard.word)}
          >
            <Volume2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setIsFlipped(!isFlipped)}
          >
            <RotateCcw className={cn("size-4 transition-transform", isFlipped && "rotate-180")} />
          </Button>
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-destructive hover:text-destructive"
              onClick={() => onDelete(flashcard.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
          </div>
        </div>

        {isFlipped && (
          <div className={cn(
            "w-full mt-4 pt-4 border-t border-border grid sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2",
            animationsEnabled ? "duration-300" : "duration-0"
          )}>
            <div className="space-y-2">
              <ClassifiedWordList words={flashcard.synonyms} label="Sinônimos" maxCount={synonymsLevel} />
              <ClassifiedWordList words={flashcard.antonyms} label="Antônimos" maxCount={synonymsLevel} />
              <div>
                <span className="text-xs font-medium text-muted-foreground">Exemplo:</span>
                <p className="text-xs text-foreground italic">{flashcard.example}</p>
                {flashcard.exampleTranslation && (
                  <div className="mt-1">
                    <button
                      className="inline-flex items-center gap-1 text-[10px] font-medium text-primary/70 hover:text-primary transition-colors"
                      onClick={(e) => { e.stopPropagation(); setShowExampleTranslation((v) => !v) }}
                    >
                      <Languages className="size-3" />
                      {showExampleTranslation ? "Ocultar tradução" : "Traduzir frase"}
                    </button>
                    {showExampleTranslation && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                        {flashcard.exampleTranslation}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
            {includeConjugations && flashcard.conjugations && (
              <div className="bg-primary/5 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-primary/70 uppercase">Verb Tenses</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] font-bold text-primary hover:bg-primary/10 hover:text-primary"
                    onClick={() => setShowConjugations((v) => !v)}
                  >
                    {showConjugations ? "Ocultar" : "Mostrar"}
                  </Button>
                </div>
                {showConjugations && (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                    <div className="flex justify-between gap-2"><span className="opacity-60 shrink-0">Present</span><span className="truncate">{flashcard.conjugations.simplePresent}</span></div>
                    <div className="flex justify-between gap-2"><span className="opacity-60 shrink-0">Past</span><span className="truncate">{flashcard.conjugations.simplePast}</span></div>
                    <div className="flex justify-between gap-2"><span className="opacity-60 shrink-0">Pres. Cont.</span><span className="truncate">{flashcard.conjugations.presentContinuous}</span></div>
                    <div className="flex justify-between gap-2"><span className="opacity-60 shrink-0">Past Cont.</span><span className="truncate">{flashcard.conjugations.pastContinuous}</span></div>
                    <div className="flex justify-between gap-2"><span className="opacity-60 shrink-0">Pres. Perf.</span><span className="truncate">{flashcard.conjugations.presentPerfect}</span></div>
                    <div className="flex justify-between gap-2"><span className="opacity-60 shrink-0">Past Perf.</span><span className="truncate">{flashcard.conjugations.pastPerfect}</span></div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Card>
    )
  }

  // Compact Layout
  if (layout === "compact") {
    return (
      <Card className="group relative overflow-hidden min-h-24 h-28 hover:shadow-md transition-shadow cursor-pointer" onClick={() => setIsFlipped(!isFlipped)}>
        <div className={cn(
          "absolute inset-0 p-3 flex flex-col justify-between transition-all",
          animationsEnabled ? "duration-300" : "duration-0",
          isFlipped ? "opacity-0 translate-y-[-100%]" : "opacity-100 translate-y-0"
        )}>
          <div className="flex justify-between items-start gap-1">
            <h3 className="font-bold text-base truncate pr-1 flex-1 leading-snug">{flashcard.word}</h3>
            <div className="flex flex-col items-end gap-0.5 shrink-0">
              <Badge className={cn("text-[9px] px-1.5 h-4 leading-none", partOfSpeechColors[partOfSpeech])}>
                {partOfSpeechLabels[partOfSpeech].substring(0, 3)}.
              </Badge>
              {flashcard.verbType && (
                <Badge variant="outline" className="text-[8px] px-1.5 h-4 border-primary/30 text-primary uppercase font-bold leading-none">
                  {flashcard.verbType === "regular" ? "Reg" : "Irr"}
                </Badge>
              )}
              {flashcard.falseCognate?.isFalseCognate && (
                <Badge className="text-[8px] px-1.5 h-4 bg-amber-500 text-white border-0 font-bold uppercase shrink-0 leading-none">
                  Falso
                </Badge>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground italic leading-snug truncate">
            {flashcard.example}
          </p>
        </div>

        <div className={cn(
          "absolute inset-0 p-3 bg-primary/5 flex flex-col justify-center transition-all",
          animationsEnabled ? "duration-300" : "duration-0",
          isFlipped ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[100%]"
        )}>
          <p className="text-sm font-bold text-center">{flashcard.translation}</p>
          <div className="flex justify-center gap-1 mt-2">
            <Button variant="ghost" size="icon" className="size-6" onClick={(e) => { e.stopPropagation(); speak(flashcard.word); }}>
              <Volume2 className="size-3" />
            </Button>
            {onDelete && (
              <Button variant="ghost" size="icon" className="size-6 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(flashcard.id); }}>
                <Trash2 className="size-3" />
              </Button>
            )}
          </div>
        </div>
      </Card>
    )
  }

  // Default Grid Layout
  return (
    <div
      className="group perspective-1000 h-80 cursor-pointer"
      onClick={() => setIsFlipped(!isFlipped)}
    >
      <div
        className={cn(
          "relative h-full w-full transform-style-3d transition-transform",
          animationsEnabled ? "duration-500" : "duration-0",
          isFlipped && "rotate-y-180"
        )}
      >
        {/* Front */}
        <div className="absolute inset-0 backface-hidden rounded-xl border bg-card p-6 shadow-sm flex flex-col">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Badge 
                variant="outline" 
                className={cn("text-xs font-medium", partOfSpeechColors[partOfSpeech])}
              >
                {partOfSpeechLabels[partOfSpeech]}
              </Badge>
              {flashcard.verbType && (
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider border-primary/30 text-primary">
                  {flashcard.verbType}
                </Badge>
              )}
              {flashcard.falseCognate?.isFalseCognate && (
                <Badge className="text-[10px] bg-amber-500 hover:bg-amber-600 border-0 text-white font-bold uppercase tracking-tight">
                  Falso Cognato
                </Badge>
              )}
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={(e) => {
                  e.stopPropagation()
                  speak(flashcard.word)
                }}
              >
                <Volume2 className="size-4" />
              </Button>
              {onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(flashcard.id)
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center">
            <h3 className="text-3xl font-bold text-foreground">
              {flashcard.word}
            </h3>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <RotateCcw className="size-3" />
            <span>Clique para virar</span>
          </div>
        </div>

        {/* Back */}
        <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-xl border bg-primary/5 p-5 shadow-sm flex flex-col overflow-hidden">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <Badge 
                variant="outline" 
                className={cn("text-xs font-medium", partOfSpeechColors[partOfSpeech])}
              >
                {partOfSpeechLabels[partOfSpeech]}
              </Badge>
              {flashcard.verbType && (
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider border-primary/30 text-primary">
                  {flashcard.verbType}
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-2.5 flex-1 overflow-y-auto pr-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xl font-semibold text-foreground leading-snug">
                {flashcard.translation}
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                onClick={(e) => {
                  e.stopPropagation()
                  setEditOpen(true)
                }}
                title="Editar tradução"
              >
                <Pencil className="size-4" />
              </Button>
            </div>
            {includeUsageNote && !!flashcard.usageNote && (
              <div className="bg-muted/30 border border-border/40 rounded-lg p-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Contexto
                </span>
                <p className="text-xs text-foreground mt-1 leading-snug">
                  {flashcard.usageNote}
                </p>
              </div>
            )}

            <ClassifiedWordList words={flashcard.synonyms} label="Sinônimos" maxCount={synonymsLevel} />
            <ClassifiedWordList words={flashcard.antonyms} label="Antônimos" maxCount={synonymsLevel} />

            <div>
              <span className="text-xs font-medium text-muted-foreground">
                Exemplo:
              </span>
              <p className="text-sm text-foreground italic mt-0.5">
                {flashcard.example}
              </p>
              {flashcard.exampleTranslation && (
                <div className="mt-1.5">
                  <button
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary/70 hover:text-primary transition-colors"
                    onClick={(e) => { e.stopPropagation(); setShowExampleTranslation((v) => !v) }}
                  >
                    <Languages className="size-3" />
                    {showExampleTranslation ? "Ocultar tradução" : "Traduzir frase"}
                  </button>
                  {showExampleTranslation && (
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                      {flashcard.exampleTranslation}
                    </p>
                  )}
                </div>
              )}
            </div>

            {includeConjugations && flashcard.conjugations && (
              <div className="pt-2 border-t border-border/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Verb Tenses:
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] font-bold text-primary hover:bg-primary/10 hover:text-primary"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowConjugations((v) => !v)
                    }}
                  >
                    {showConjugations ? "Ocultar" : "Mostrar"}
                  </Button>
                </div>
                {showConjugations && (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
                    <div className="flex flex-col border-b border-border/20 pb-1">
                      <span className="text-primary/70 uppercase font-bold text-[8px]">Simple Present</span>
                      <span className="text-foreground/80 font-medium truncate">{flashcard.conjugations.simplePresent || "n/a"}</span>
                    </div>
                    <div className="flex flex-col border-b border-border/20 pb-1">
                      <span className="text-primary/70 uppercase font-bold text-[8px]">Simple Past</span>
                      <span className="text-foreground/80 font-medium truncate">{flashcard.conjugations.simplePast || "n/a"}</span>
                    </div>
                    <div className="flex flex-col border-b border-border/20 pb-1">
                      <span className="text-primary/70 uppercase font-bold text-[8px]">Pres. Continuous</span>
                      <span className="text-foreground/80 font-medium truncate">{flashcard.conjugations.presentContinuous || "n/a"}</span>
                    </div>
                    <div className="flex flex-col border-b border-border/20 pb-1">
                      <span className="text-primary/70 uppercase font-bold text-[8px]">Past Continuous</span>
                      <span className="text-foreground/80 font-medium truncate">{flashcard.conjugations.pastContinuous || "n/a"}</span>
                    </div>
                    <div className="flex flex-col border-b border-border/20 pb-1">
                      <span className="text-primary/70 uppercase font-bold text-[8px]">Present Perfect</span>
                      <span className="text-foreground/80 font-medium truncate">{flashcard.conjugations.presentPerfect || "n/a"}</span>
                    </div>
                    <div className="flex flex-col border-b border-border/20 pb-1">
                      <span className="text-primary/70 uppercase font-bold text-[8px]">Past Perfect</span>
                      <span className="text-foreground/80 font-medium truncate">{flashcard.conjugations.pastPerfect || "n/a"}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {flashcard.falseCognate?.isFalseCognate && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 flex items-start gap-2">
                <AlertTriangle className="size-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-700 leading-tight">
                  {flashcard.falseCognate.warning}
                </p>
              </div>
            )}

            {alternativeForms.length > 0 && (
              <div className="pt-2 border-t border-border/50">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-2">
                  Outras formas:
                </span>
                <div className="space-y-2">
                  {alternativeForms.map((form, idx) => (
                    <div key={idx} className="bg-card/50 rounded-lg p-2 border border-border/30">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-[9px] h-4 font-bold uppercase tracking-tighter border-0 cursor-pointer hover:opacity-90",
                            partOfSpeechColors[form.partOfSpeech]
                          )}
                          onClick={(e) => {
                            e.stopPropagation()
                            onCreateFromAlternative?.(flashcard, form)
                          }}
                        >
                          {partOfSpeechLabels[form.partOfSpeech]}
                        </Badge>
                        <div className="flex flex-col leading-tight min-w-0">
                          <span className="text-xs font-bold text-foreground truncate">
                            {form.word || ""}
                          </span>
                          <span className="text-[10px] text-muted-foreground truncate">
                            {form.translation}
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground italic leading-tight">
                        {form.example}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-2">
            <RotateCcw className="size-3" />
            <span>Clique para voltar</span>
          </div>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={(o) => !editBusy && setEditOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar tradução</DialogTitle>
            <DialogDescription>
              Ao salvar, a IA recalcula sinônimos, antônimos, exemplo, contexto e outras formas para condizer com a nova tradução.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {flashcard.word} ({flashcard.partOfSpeech})
            </p>
            <Input
              value={translationDraft}
              onChange={(e) => setTranslationDraft(e.target.value)}
              placeholder="Ex: a bebida"
              disabled={editBusy}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editBusy}>
              Cancelar
            </Button>
            <Button onClick={submitTranslationEdit} disabled={editBusy || !translationDraft.trim()}>
              {editBusy ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Salvando…
                </>
              ) : (
                "Salvar e reanalisar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
