"use client"

import { useState } from "react"
import { Trash2, RotateCcw, Volume2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import type { Flashcard, ClassifiedWord, PartOfSpeech } from "@/lib/types"

interface FlashcardCardProps {
  flashcard: Flashcard
  onDelete?: (id: string) => void
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
  label 
}: { 
  words: ClassifiedWord[]
  label: string 
}) {
  if (words.length === 0) return null

  return (
    <div>
      <span className="text-xs font-medium text-muted-foreground">
        {label}:
      </span>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {words.map((item, idx) => (
          <Badge
            key={idx}
            variant="outline"
            className={cn(
              "text-xs font-normal",
              item.type === "literal" 
                ? "bg-primary/10 text-primary border-primary/20" 
                : "bg-muted text-muted-foreground border-muted-foreground/20"
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

export function FlashcardCard({ flashcard, onDelete, layout = "grid" }: FlashcardCardProps) {
  const [isFlipped, setIsFlipped] = useState(false)

  const speak = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = "en-US"
    speechSynthesis.speak(utterance)
  }

  const partOfSpeech = flashcard.partOfSpeech || "noun"
  const alternativeForms = flashcard.alternativeForms || []

  // List Layout
  if (layout === "list") {
    return (
      <Card className="flex flex-col sm:flex-row items-center justify-between p-4 gap-4 hover:shadow-md transition-shadow">
        <div className="flex items-center gap-4 flex-1">
          <Badge 
            variant="outline" 
            className={cn("text-[10px] h-5", partOfSpeechColors[partOfSpeech])}
          >
            {partOfSpeechLabels[partOfSpeech]}
          </Badge>
          <div className="flex flex-col">
            <h3 className="text-lg font-bold text-foreground leading-tight">
              {flashcard.word}
            </h3>
            <p className="text-sm text-muted-foreground">
              {flashcard.translation}
            </p>
          </div>
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

        {isFlipped && (
          <div className="w-full mt-4 pt-4 border-t border-border grid sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="space-y-2">
              <ClassifiedWordList words={flashcard.synonyms} label="Sinônimos" />
              <ClassifiedWordList words={flashcard.antonyms} label="Antônimos" />
              <div>
                <span className="text-xs font-medium text-muted-foreground">Exemplo:</span>
                <p className="text-xs text-foreground italic">{flashcard.example}</p>
              </div>
            </div>
            {flashcard.conjugations && (
              <div className="bg-primary/5 rounded-lg p-3">
                <span className="text-[10px] font-bold text-primary/70 uppercase block mb-2">Verb Tenses</span>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div className="flex justify-between"><span className="opacity-60">Pres.</span><span>{flashcard.conjugations.simplePresent}</span></div>
                  <div className="flex justify-between"><span className="opacity-60">Past</span><span>{flashcard.conjugations.simplePast}</span></div>
                  <div className="flex justify-between"><span className="opacity-60">P. Cont.</span><span>{flashcard.conjugations.presentContinuous}</span></div>
                  <div className="flex justify-between"><span className="opacity-60">P. Perf.</span><span>{flashcard.conjugations.presentPerfect}</span></div>
                </div>
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
      <Card className="group relative overflow-hidden h-24 hover:shadow-md transition-shadow cursor-pointer" onClick={() => setIsFlipped(!isFlipped)}>
        <div className={cn(
          "absolute inset-0 p-3 transition-all duration-300 flex flex-col justify-between",
          isFlipped ? "opacity-0 translate-y-[-100%]" : "opacity-100 translate-y-0"
        )}>
          <div className="flex justify-between items-start">
            <h3 className="font-bold text-base truncate pr-8">{flashcard.word}</h3>
            <Badge className={cn("text-[9px] px-1 h-4", partOfSpeechColors[partOfSpeech])}>
              {partOfSpeechLabels[partOfSpeech].substring(0, 3)}.
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate italic">
            {flashcard.example.substring(0, 40)}...
          </p>
        </div>

        <div className={cn(
          "absolute inset-0 p-3 bg-primary/5 transition-all duration-300 flex flex-col justify-center",
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
          "relative h-full w-full transition-transform duration-500 transform-style-3d",
          isFlipped && "rotate-y-180"
        )}
      >
        {/* Front */}
        <div className="absolute inset-0 backface-hidden rounded-xl border bg-card p-6 shadow-sm flex flex-col">
          <div className="flex items-start justify-between">
            <Badge 
              variant="outline" 
              className={cn("text-xs font-medium", partOfSpeechColors[partOfSpeech])}
            >
              {partOfSpeechLabels[partOfSpeech]}
            </Badge>
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
            <Badge 
              variant="outline" 
              className={cn("text-xs font-medium", partOfSpeechColors[partOfSpeech])}
            >
              {partOfSpeechLabels[partOfSpeech]}
            </Badge>
          </div>

          <div className="space-y-2.5 flex-1 overflow-y-auto pr-1">
            <p className="text-xl font-semibold text-foreground">
              {flashcard.translation}
            </p>

            <ClassifiedWordList words={flashcard.synonyms} label="Sinônimos" />
            <ClassifiedWordList words={flashcard.antonyms} label="Antônimos" />

            <div>
              <span className="text-xs font-medium text-muted-foreground">
                Exemplo:
              </span>
              <p className="text-sm text-foreground italic mt-0.5">
                {flashcard.example}
              </p>
            </div>

            {flashcard.conjugations && (
              <div className="pt-2 border-t border-border/50">
                <span className="text-xs font-medium text-muted-foreground block mb-2">
                  Verb Tenses:
                </span>
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
              </div>
            )}

            {alternativeForms.length > 0 && (
              <div className="pt-2 border-t border-border/50">
                <span className="text-xs font-medium text-muted-foreground block mb-2">
                  Outras formas:
                </span>
                <div className="space-y-2">
                  {alternativeForms.map((form, idx) => (
                    <div key={idx} className="bg-card/50 rounded-lg p-2">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge 
                          variant="outline" 
                          className={cn("text-[10px] font-medium", partOfSpeechColors[form.partOfSpeech])}
                        >
                          {partOfSpeechLabels[form.partOfSpeech]}
                        </Badge>
                        <span className="text-sm font-medium text-foreground">
                          {form.translation}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground italic">
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
    </div>
  )
}
