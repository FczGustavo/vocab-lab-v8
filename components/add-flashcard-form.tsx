"use client"

import { useState } from "react"
import { Plus, Loader2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { useGptModel } from "@/hooks/use-gpt-model"
import { useAiPreferences } from "@/hooks/use-ai-preferences"
import { toast } from "@/hooks/use-toast"
import type { Flashcard, PartOfSpeech } from "@/lib/types"
import type { FlashcardAIResponse } from "@/lib/openai"

function isExpandedAcronymInput(raw: string): boolean {
  const normalized = raw.trim()
  // Ex: "challenging water quality (cwq)"
  return /^.+\s+\([a-z0-9]{2,}\)$/i.test(normalized)
}

function aiResponseToFlashcard(data: FlashcardAIResponse, sourceWord: string): Flashcard {
  const typedWord = sourceWord.trim().replace(/\s+/g, " ")
  const keepTypedWord = isExpandedAcronymInput(typedWord)

  return {
    id: crypto.randomUUID(),
    word: keepTypedWord ? typedWord : data.normalizedWord.toLowerCase(),
    partOfSpeech: data.partOfSpeech as PartOfSpeech,
    translation: data.translation,
    usageNote: data.usageNote || "",
    synonyms: data.synonyms,
    antonyms: data.antonyms,
    example: data.example,
    exampleTranslation: (data as any).exampleTranslation || "",
    alternativeForms: (data.alternativeForms || []).map((f) => ({
      ...f,
      partOfSpeech: f.partOfSpeech as PartOfSpeech,
    })),
    conjugations: data.conjugations ?? undefined,
    verbType: data.verbType ?? undefined,
    falseCognate: undefined,
    folderId: null,
    createdAt: Date.now(),
  }
}

interface AddFlashcardFormProps {
  onAdd: (flashcard: Flashcard) => Promise<boolean>
  bare?: boolean
}

export function AddFlashcardForm({ onAdd, bare }: AddFlashcardFormProps) {
  const { model } = useGptModel()
  const {
    synonymsLevel,
    includeConjugations,
    includeAlternativeForms,
    includeUsageNote,
    efommMode,
    includeMultipleTranslations,
  } = useAiPreferences()
  const [mode, setMode] = useState<"single" | "batch">("single")
  const [word, setWord] = useState("")
  const [batchText, setBatchText] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [batchTotal, setBatchTotal] = useState(0)
  const [batchDone, setBatchDone] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const parseBatchWords = (text: string) => {
    const parts = text
      .split(/[\n,;]+/g)
      .map((w) => w.trim())
      .filter(Boolean)
    return [...new Set(parts)]
  }

  const handleSubmitSingle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!word.trim()) return

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/ai/flashcard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: word.trim(),
          model,
          options: {
            synonymsLevel,
            includeConjugations,
            includeAlternativeForms,
            includeUsageNote,
            efommMode,
            includeMultipleTranslations,
          },
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error || "Erro ao gerar flashcard")
      }
      const data: FlashcardAIResponse = await res.json()

      const flashcard = aiResponseToFlashcard(data, word)

      const success = await onAdd(flashcard)
      if (success) {
        setWord("")
      } else {
        setError("Esta palavra já existe nessa categoria no seu vocabulário.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar flashcard")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmitBatch = async (e: React.FormEvent) => {
    e.preventDefault()

    const words = parseBatchWords(batchText)
    if (words.length === 0) return

    setIsLoading(true)
    setError(null)
    setBatchTotal(words.length)
    setBatchDone(0)

    const estimateSeconds = Math.max(3, Math.round(words.length * 2.5))
    const t = toast({
      title: "Adição em lote iniciada",
      description: `${words.length} palavra(s) · estimativa ~${estimateSeconds}s`,
    })

    let added = 0
    let skipped = 0
    let failed = 0

    try {
      for (let i = 0; i < words.length; i++) {
        const w = words[i]
        setBatchDone(i)

        try {
          const res = await fetch("/api/ai/flashcard", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              word: w,
              model,
              options: {
                synonymsLevel,
                includeConjugations,
                includeAlternativeForms,
                includeUsageNote,
                efommMode,
                includeMultipleTranslations,
              },
            }),
          })
          if (!res.ok) throw new Error("Erro ao gerar")
          const data: FlashcardAIResponse = await res.json()

          const flashcard = aiResponseToFlashcard(data, w)

          const success = await onAdd(flashcard)
          if (success) added++
          else skipped++
        } catch {
          failed++
        }

        setBatchDone(i + 1)
        t.update({
          id: t.id,
          title: "Processando lote…",
          description: `${i + 1}/${words.length} · ${w}`,
        })
      }

      t.update({
        id: t.id,
        title: "Lote concluído",
        description: `Adicionados: ${added} · Duplicados: ${skipped} · Falhas: ${failed}`,
      })
      setBatchText("")
    } finally {
      setIsLoading(false)
      setBatchTotal(0)
      setBatchDone(0)
    }
  }

  const formEl = (
    <form onSubmit={mode === "single" ? handleSubmitSingle : handleSubmitBatch} className="space-y-3">
          {/* Pill bar */}
          <div className={cn(
            "group flex items-center gap-1.5 rounded-full pl-4 pr-1 py-1 ring-1 transition-all focus-within:ring-primary/15",
            bare ? "bg-transparent ring-0" : "bg-muted/30 ring-border/20 dark:bg-white/5 dark:ring-white/8"
          )}>
            {/* Input or batch label */}
            {mode === "single" ? (
              <Input
                type="text"
                placeholder="Adicionar nova palavra em inglês..."
                value={word}
                onChange={(e) => setWord(e.target.value)}
                disabled={isLoading}
                className="h-7 flex-1 border-0 bg-transparent px-0 text-[13px] placeholder:text-[13px] placeholder:text-muted-foreground/70 shadow-none focus-visible:ring-0"
              />
            ) : (
              <span className="flex-1 text-[13px] text-muted-foreground/50 select-none">
                Lote ativo — cole as palavras abaixo
              </span>
            )}

            {/* Mode toggle: Uma | Lote */}
            <div className="flex h-7 items-center rounded-full bg-muted/70 p-[2px] shrink-0">
              <button
                type="button"
                onClick={() => setMode("single")}
                disabled={isLoading}
                className={cn(
                  "h-full rounded-full px-2.5 text-[11px] font-medium leading-none transition-all",
                  mode === "single"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Uma
              </button>
              <button
                type="button"
                onClick={() => setMode("batch")}
                disabled={isLoading}
                className={cn(
                  "h-full rounded-full px-2.5 text-[11px] font-medium leading-none transition-all",
                  mode === "batch"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Lote
              </button>
            </div>

            {/* Submit */}
            {mode === "single" ? (
              <Button
                type="submit"
                size="icon-sm"
                disabled={!word.trim() || isLoading}
                className="rounded-full shadow-none hover:shadow-[0_0_12px_color-mix(in_oklab,var(--primary)_35%,transparent)]"
              >
                {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              </Button>
            ) : (
              <Button
                type="submit"
                size="sm"
                disabled={parseBatchWords(batchText).length === 0 || isLoading}
                className="h-[30px] rounded-full px-3 text-[12px] shadow-none"
              >
                {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : "Adicionar"}
              </Button>
            )}
          </div>

          {/* Batch textarea */}
          {mode === "batch" && (
            <div className="space-y-2">
              <textarea
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                disabled={isLoading}
                placeholder={"slim\nfreight forwarder, bill of lading\nharbor"}
                className="w-full min-h-[100px] resize-y rounded-xl border border-border/40 bg-muted/20 px-3 py-2 text-[13px] outline-none focus:ring-1 focus:ring-ring/30 placeholder:text-muted-foreground/40"
              />
              <p className="px-1 text-[11px] text-muted-foreground/60">
                {(() => {
                  const count = parseBatchWords(batchText).length
                  if (count === 0) return "Separe por vírgula ou quebra de linha"
                  const est = Math.max(3, Math.round(count * 2.5))
                  return `${count} palavra(s) · ~${est}s estimado`
                })()}
              </p>
              {isLoading && batchTotal > 0 && (
                <div className="space-y-1">
                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${Math.round((batchDone / batchTotal) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">{batchDone}/{batchTotal}</p>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="flex items-center gap-1.5 px-1 text-[12px] text-destructive">
              <AlertCircle className="size-3.5 shrink-0" />
              {error}
            </p>
          )}
    </form>
  )

  if (bare) return formEl

  return (
    <Card className="surface-card surface-card-elevated overflow-hidden">
      <CardContent className="px-4 py-3">
        {formEl}
      </CardContent>
    </Card>
  )
}
