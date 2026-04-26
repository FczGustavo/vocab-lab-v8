"use client"

import { useEffect, useState } from "react"
import { Trash2, Volume2, Pencil, Loader2, Languages, Rotate3D, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import type { Flashcard, ClassifiedWord, PartOfSpeech, AlternativeForm } from "@/lib/types"
import type { FlashcardRevisionResponse } from "@/lib/openai"
import { useAnimations } from "@/hooks/use-animations"
import { useAiPreferences } from "@/hooks/use-ai-preferences"
import { useGptModel } from "@/hooks/use-gpt-model"
import { toast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

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
  phrase: "Expressão",
  acronym: "Sigla",
}

const partOfSpeechColors: Record<PartOfSpeech, string> = {
  verb: "ghost-tag bg-blue-500/10 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300",
  noun: "ghost-tag bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  adjective: "ghost-tag bg-amber-500/10 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  adverb: "ghost-tag bg-purple-500/10 text-purple-700 dark:bg-purple-400/15 dark:text-purple-300",
  preposition: "ghost-tag bg-rose-500/10 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
  conjunction: "ghost-tag bg-cyan-500/10 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300",
  interjection: "ghost-tag bg-orange-500/10 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300",
  phrase: "ghost-tag bg-teal-500/10 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300",
  acronym: "ghost-tag bg-indigo-500/10 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300",
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
              ? "bg-blue-500/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
              : t === "slang"
                ? "bg-amber-500/10 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200"
                : "bg-purple-500/10 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300"

          return (
            <Badge
              key={idx}
              variant="outline"
              className={cn("ghost-tag text-[10px] font-medium py-0 px-2 h-5 border-0", tone)}
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

function parseUsageNoteBlocks(note: string): Array<{ label: string | null; text: string }> {
  const knownLabels = [
    "Nuance",
    "Outro uso",
    "Estrutura comum",
    "Estrutura",
    "Uso principal",
    "Intensificador",
    "Atenuador",
    "Preferência / Alternativa",
    "Preferencia / Alternativa",
    "Como Adjetivo",
    "Como Advérbio",
    "Como Adverbio",
    "Como Substantivo",
    "Como Verbo",
  ]

  const labelRegex = new RegExp(`\\s+(${knownLabels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}):`, "gi")

  const normalized = note
    .replace(/\r\n/g, "\n")
    .replace(labelRegex, "\n$1:")
    .trim()

  if (!normalized) return []

  return normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([^:]{2,40}:)\s*(.*)$/)
      if (!match) return { label: null, text: line }
      return {
        label: match[1],
        text: match[2] || "",
      }
    })
    .reduce<Array<{ label: string | null; text: string }>>((acc, current) => {
      const prev = acc[acc.length - 1]
      if (prev && prev.label && !prev.text && !current.label) {
        prev.text = current.text
        return acc
      }
      acc.push(current)
      return acc
    }, [])
}

export function FlashcardCard({ flashcard, onDelete, onCreateFromAlternative, onUpdateFlashcard, layout = "grid" }: FlashcardCardProps) {
  const [isFlipped, setIsFlipped] = useState(false)
  const [showConjugations, setShowConjugations] = useState(false)
  const [showExampleTranslation, setShowExampleTranslation] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [translationDraft, setTranslationDraft] = useState("")
  const [editBusy, setEditBusy] = useState(false)
  const [contextExpanded, setContextExpanded] = useState(false)
  const { enabled: animationsEnabled } = useAnimations()
  const { synonymsLevel, includeConjugations, includeAlternativeForms, includeUsageNote, contextDetailMode, efommMode } = useAiPreferences()
  const { model } = useGptModel()

  const speak = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = "en-US"
    speechSynthesis.speak(utterance)
  }

  const partOfSpeech = flashcard.partOfSpeech || "noun"
  const usageBlocks = parseUsageNoteBlocks(flashcard.usageNote || "")
  const hasContext = includeUsageNote && usageBlocks.length > 0
  const hasExample = Boolean(flashcard.example?.trim())
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
      const res = await fetch("/api/ai/revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          input: {
            word: flashcard.word,
            partOfSpeech: flashcard.partOfSpeech,
            translation: nextTranslation,
            efommMode,
            synonymsLevel,
            includeAlternativeForms,
            includeUsageNote,
            contextMode: contextDetailMode,
          },
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error || "Erro ao revisar card")
      }
      const revised: FlashcardRevisionResponse = await res.json()

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
      <>
        <Card
          className="surface-card surface-card-elevated interactive-lift flex cursor-pointer flex-col justify-between gap-4 p-4"
          onClick={() => setIsFlipped((value) => !value)}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn("text-[10px] h-5 border-0", partOfSpeechColors[partOfSpeech])}
                >
                  {partOfSpeechLabels[partOfSpeech]}
                </Badge>
                {flashcard.verbType && (
                  <Badge variant="outline" className="ghost-tag h-5 bg-primary/10 text-[9px] uppercase tracking-wider text-primary border-0 dark:bg-primary/15">
                    {flashcard.verbType}
                  </Badge>
                )}
              </div>
              <h3 className="truncate text-lg font-medium leading-tight text-foreground sm:text-xl">
                {flashcard.word}
              </h3>
              {!isFlipped && (
                <p className="text-xs text-muted-foreground">
                  Clique no card ou no botao de giro para ver a traducao.
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
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
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsFlipped((value) => !value)
                }}
              >
                <Rotate3D className={cn("size-4 transition-transform", isFlipped && "rotate-180")} />
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

          {isFlipped && (
            <div className={cn(
              "grid w-full gap-4 border-t border-border pt-4 animate-in fade-in slide-in-from-top-2 sm:grid-cols-2",
              animationsEnabled ? "duration-300" : "duration-0"
            )}>
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-lg font-medium leading-snug text-foreground">
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
                <ClassifiedWordList words={flashcard.synonyms} label="Sinônimos" maxCount={synonymsLevel} />
                <ClassifiedWordList words={flashcard.antonyms} label="Antônimos" maxCount={synonymsLevel} />
                {hasExample && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">Exemplo:</span>
                    <p className="text-xs text-foreground italic">{flashcard.example}</p>
                    {flashcard.exampleTranslation && (
                      <div className="mt-1">
                        <button
                          className="inline-flex items-center gap-1 text-[10px] font-medium text-primary/70 transition-colors hover:text-primary"
                          onClick={(e) => {
                            e.stopPropagation()
                            setShowExampleTranslation((v) => !v)
                          }}
                        >
                          <Languages className="size-3" />
                          {showExampleTranslation ? "Ocultar tradução" : "Traduzir frase"}
                        </button>
                        {showExampleTranslation && (
                          <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                            {flashcard.exampleTranslation}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {hasContext && (
                <div className="rounded-lg bg-muted/30 p-3">
                  <Collapsible open={contextExpanded} onOpenChange={setContextExpanded}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        Contexto
                      </span>
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {contextExpanded ? "Recolher" : "Expandir"}
                          {contextExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                        </button>
                      </CollapsibleTrigger>
                    </div>

                    <CollapsibleContent className="mt-2 space-y-2">
                      <div className="space-y-1.5">
                        {usageBlocks.map((block, idx) => (
                          <div key={idx} className="text-xs leading-relaxed text-foreground">
                            <p>
                              {block.label ? <span className="mr-1 font-semibold text-primary">{block.label}</span> : null}
                              <span>{block.text}</span>
                            </p>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}
              {includeConjugations && flashcard.conjugations && (
                <div className="rounded-lg bg-primary/5 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-primary/70">Verb Tenses</span>
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
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                      <div className="flex justify-between gap-2"><span className="shrink-0 opacity-60">Present</span><span className="truncate">{flashcard.conjugations.simplePresent}</span></div>
                      <div className="flex justify-between gap-2"><span className="shrink-0 opacity-60">Past</span><span className="truncate">{flashcard.conjugations.simplePast}</span></div>
                      <div className="flex justify-between gap-2"><span className="shrink-0 opacity-60">Pres. Cont.</span><span className="truncate">{flashcard.conjugations.presentContinuous}</span></div>
                      <div className="flex justify-between gap-2"><span className="shrink-0 opacity-60">Past Cont.</span><span className="truncate">{flashcard.conjugations.pastContinuous}</span></div>
                      <div className="flex justify-between gap-2"><span className="shrink-0 opacity-60">Pres. Perf.</span><span className="truncate">{flashcard.conjugations.presentPerfect}</span></div>
                      <div className="flex justify-between gap-2"><span className="shrink-0 opacity-60">Past Perf.</span><span className="truncate">{flashcard.conjugations.pastPerfect}</span></div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>

        <Dialog open={editOpen} onOpenChange={(o) => !editBusy && setEditOpen(o)}>
          <DialogContent className="max-w-[92vw] sm:max-w-md">
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
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Salvando…
                  </>
                ) : (
                  "Salvar e reanalisar"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  // Compact Layout
  if (layout === "compact") {
    return (
      <Card className="surface-card surface-card-elevated interactive-lift group relative h-28 min-h-24 cursor-pointer overflow-hidden" onClick={() => setIsFlipped(!isFlipped)}>
        <div className={cn(
          "absolute inset-0 p-3 flex flex-col justify-between transition-all",
          animationsEnabled ? "duration-300" : "duration-0",
          isFlipped ? "opacity-0 translate-y-[-100%]" : "opacity-100 translate-y-0"
        )}>
          <div className="flex justify-between items-start gap-1">
            <h3 className="flex-1 truncate pr-1 text-center text-base font-medium leading-snug">{flashcard.word}</h3>
            <div className="flex flex-col items-end gap-0.5 shrink-0">
              <Badge className={cn("text-[9px] px-1.5 h-4 leading-none border-0", partOfSpeechColors[partOfSpeech])}>
                {partOfSpeechLabels[partOfSpeech].substring(0, 3)}.
              </Badge>
              {flashcard.verbType && (
                <Badge variant="outline" className="ghost-tag h-4 bg-primary/10 px-1.5 text-[8px] uppercase font-medium leading-none text-primary border-0">
                  {flashcard.verbType === "regular" ? "Reg" : "Irr"}
                </Badge>
              )}
            </div>
          </div>
          {hasExample && (
            <p className="text-xs text-muted-foreground italic leading-snug truncate">
              {flashcard.example}
            </p>
          )}
        </div>

        <div className={cn(
          "absolute inset-0 p-3 bg-primary/5 flex flex-col justify-center transition-all",
          animationsEnabled ? "duration-300" : "duration-0",
          isFlipped ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[100%]"
        )}>
          <p className="text-sm font-medium text-center">{flashcard.translation}</p>
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
      className="group perspective-1000 h-[19rem] cursor-pointer sm:h-80"
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
        <div className="surface-card surface-card-elevated interactive-lift absolute inset-0 flex flex-col rounded-[20px] p-4 backface-hidden sm:rounded-[22px] sm:p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn("text-xs font-medium border-0", partOfSpeechColors[partOfSpeech])}>
                {partOfSpeechLabels[partOfSpeech]}
              </Badge>
              {flashcard.verbType && (
                <Badge variant="outline" className="ghost-tag bg-primary/10 text-[10px] uppercase tracking-wider text-primary border-0">
                  {flashcard.verbType}
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
            <h3 className="text-center text-2xl font-medium break-words text-foreground sm:text-3xl md:text-[2rem]">
              {flashcard.word}
            </h3>
          </div>

          <Rotate3D className="minimal-rotate-hint size-4 text-muted-foreground" />
        </div>

        {/* Back */}
        <div className="surface-card surface-card-elevated interactive-lift absolute inset-0 flex flex-col overflow-hidden rounded-[20px] bg-card p-4 backface-hidden rotate-y-180 sm:rounded-[22px] sm:p-5">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn("text-xs font-medium border-0", partOfSpeechColors[partOfSpeech])}>
                {partOfSpeechLabels[partOfSpeech]}
              </Badge>
              {flashcard.verbType && (
                <Badge variant="outline" className="ghost-tag bg-primary/10 text-[10px] uppercase tracking-wider text-primary border-0">
                  {flashcard.verbType}
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-2.5 flex-1 overflow-y-auto pr-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xl font-medium text-foreground leading-snug">
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
            {hasContext && (
              <div className="rounded-xl bg-muted/30 p-3">
                <Collapsible open={contextExpanded} onOpenChange={setContextExpanded}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        Contexto
                      </span>
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {contextExpanded ? "Recolher" : "Expandir"}
                          {contextExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                        </button>
                      </CollapsibleTrigger>
                    </div>

                    <CollapsibleContent className="mt-2 space-y-2">
                      <div className="space-y-1.5">
                        {usageBlocks.map((block, idx) => (
                          <div key={idx} className="text-xs leading-relaxed text-foreground">
                            <p>
                              {block.label ? <span className="mr-1 font-semibold text-primary">{block.label}</span> : null}
                              <span>{block.text}</span>
                            </p>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                </Collapsible>
              </div>
            )}

            <ClassifiedWordList words={flashcard.synonyms} label="Sinônimos" maxCount={synonymsLevel} />
            <ClassifiedWordList words={flashcard.antonyms} label="Antônimos" maxCount={synonymsLevel} />

            {hasExample && (
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
            )}

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

            {alternativeForms.length > 0 && (
              <div className="pt-2 border-t border-border/50">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-2">
                  Outras formas:
                </span>
                <div className="space-y-2">
                  {alternativeForms.map((form, idx) => (
                    <div key={idx} className="rounded-xl bg-muted/25 p-2.5">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "ghost-tag text-[9px] h-4 font-medium uppercase tracking-tighter border-0 cursor-pointer hover:opacity-90",
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
                          <span className="text-xs font-medium text-foreground truncate">
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

          <Rotate3D className="minimal-rotate-hint size-4 text-muted-foreground" />
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={(o) => !editBusy && setEditOpen(o)}>
        <DialogContent className="max-w-[92vw] sm:max-w-md">
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
