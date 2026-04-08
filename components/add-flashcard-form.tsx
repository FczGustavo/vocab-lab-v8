"use client"

import { useState } from "react"
import { Plus, Loader2, Sparkles, AlertCircle, ListPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { useApiKey } from "@/hooks/use-api-key"
import { useGptModel } from "@/hooks/use-gpt-model"
import { useAiPreferences } from "@/hooks/use-ai-preferences"
import { generateFlashcardData } from "@/lib/openai"
import { toast } from "@/hooks/use-toast"
import type { Flashcard } from "@/lib/types"

interface AddFlashcardFormProps {
  onAdd: (flashcard: Flashcard) => Promise<boolean>
}

export function AddFlashcardForm({ onAdd }: AddFlashcardFormProps) {
  const { apiKey, hasApiKey } = useApiKey()
  const { model } = useGptModel()
  const {
    synonymsLevel,
    includeConjugations,
    includeAlternativeForms,
    includeUsageNote,
    efommMode,
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
    if (!word.trim() || !apiKey) return

    setIsLoading(true)
    setError(null)

    try {
      const data = await generateFlashcardData(apiKey, word.trim(), model, {
        synonymsLevel,
        includeConjugations,
        includeAlternativeForms,
        includeUsageNote,
        efommMode,
      })

      const flashcard: Flashcard = {
        id: crypto.randomUUID(),
        word: data.normalizedWord.toLowerCase(),
        partOfSpeech: data.partOfSpeech,
        translation: data.translation,
        usageNote: data.usageNote || "",
        synonyms: data.synonyms,
        antonyms: data.antonyms,
        example: data.example,
        exampleTranslation: (data as any).exampleTranslation || "",
        alternativeForms: data.alternativeForms || [],
        conjugations: data.conjugations,
        verbType: data.verbType,
        falseCognate: data.falseCognate,
        folderId: null,
        createdAt: Date.now(),
      }

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
    if (!apiKey) return

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
          const data = await generateFlashcardData(apiKey, w, model, {
            synonymsLevel,
            includeConjugations,
            includeAlternativeForms,
            includeUsageNote,
            efommMode,
          })

          const flashcard: Flashcard = {
            id: crypto.randomUUID(),
            word: data.normalizedWord.toLowerCase(),
            partOfSpeech: data.partOfSpeech,
            translation: data.translation,
            usageNote: data.usageNote || "",
            synonyms: data.synonyms,
            antonyms: data.antonyms,
            example: data.example,
            exampleTranslation: (data as any).exampleTranslation || "",
            alternativeForms: data.alternativeForms || [],
            conjugations: data.conjugations,
            verbType: data.verbType,
            falseCognate: data.falseCognate,
            folderId: null,
            createdAt: Date.now(),
          }

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

  if (!hasApiKey) {
    return (
      <Card className="border-dashed border-2">
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <AlertCircle className="size-10 text-muted-foreground mb-3" />
          <h3 className="font-semibold text-foreground mb-1">
            Configure sua API Key
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Clique no ícone de configurações no canto superior direito para
            adicionar sua chave do OpenRouter.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="text-sm font-semibold text-foreground">Adicionar palavras</p>
          <div className="flex items-center bg-muted rounded-lg p-1">
            <Button
              type="button"
              variant={mode === "single" ? "secondary" : "ghost"}
              size="sm"
              className="h-8"
              onClick={() => setMode("single")}
              disabled={isLoading}
            >
              Uma
            </Button>
            <Button
              type="button"
              variant={mode === "batch" ? "secondary" : "ghost"}
              size="sm"
              className="h-8"
              onClick={() => setMode("batch")}
              disabled={isLoading}
            >
              <ListPlus className="size-4 mr-2" />
              Lote
            </Button>
          </div>
        </div>

        <form onSubmit={mode === "single" ? handleSubmitSingle : handleSubmitBatch} className="space-y-4">
          {mode === "single" ? (
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Input
                  type="text"
                  placeholder="Digite uma palavra em inglês..."
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                  disabled={isLoading}
                  className="pr-10"
                />
                <Sparkles className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              </div>
              <Button type="submit" disabled={!word.trim() || isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="size-4 mr-2 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <Plus className="size-4 mr-2" />
                    Adicionar
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  Cole várias palavras separadas por vírgula ou quebra de linha. Pode levar alguns segundos dependendo da quantidade.
                </p>
              </div>

              <textarea
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                disabled={isLoading}
                placeholder={"Ex:\nslim\nfreight forwarder, bill of lading\nharbor"}
                className="w-full min-h-[120px] resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50"
              />

              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  {(() => {
                    const count = parseBatchWords(batchText).length
                    if (count === 0) return "Nenhuma palavra detectada"
                    const estimateSeconds = Math.max(3, Math.round(count * 2.5))
                    return `${count} palavra(s) · estimativa ~${estimateSeconds}s`
                  })()}
                </div>
                <Button type="submit" disabled={parseBatchWords(batchText).length === 0 || isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <ListPlus className="size-4 mr-2" />
                      Adicionar em lote
                    </>
                  )}
                </Button>
              </div>

              {isLoading && batchTotal > 0 && (
                <div className="space-y-2">
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${Math.round((batchDone / batchTotal) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Progresso: {batchDone}/{batchTotal}
                  </p>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="size-4" />
              {error}
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            A IA irá gerar automaticamente o conteúdo do card com base nas suas preferências.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
