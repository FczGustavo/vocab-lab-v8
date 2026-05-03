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
  onAdd: (flashcard: Flashcard, meta?: { closeAfterAdd?: boolean }) => Promise<boolean>
  onUpdate?: (flashcard: Flashcard) => Promise<boolean>
  bare?: boolean
}

export function AddFlashcardForm({ onAdd, onUpdate, bare }: AddFlashcardFormProps) {
  const { model } = useGptModel()
  const {
    synonymsLevel,
    includeConjugations,
    includeAlternativeForms,
    includeUsageNote,
    contextDetailMode,
    efommMode,
    includeMultipleTranslations,
    showManualOptionalFields,
  } = useAiPreferences()
  const [mode, setMode] = useState<"single" | "batch" | "manual">("single")
  const [word, setWord] = useState("")
  const [batchText, setBatchText] = useState("")
  const [manualWord, setManualWord] = useState("")
  const [manualPartOfSpeech, setManualPartOfSpeech] = useState<PartOfSpeech>("noun")
  const [manualTranslation, setManualTranslation] = useState("")
  const [manualExample, setManualExample] = useState("")
  const [manualExampleTranslation, setManualExampleTranslation] = useState("")
  const [manualUsageNote, setManualUsageNote] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [batchTotal, setBatchTotal] = useState(0)
  const [batchDone, setBatchDone] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saveFlash, setSaveFlash] = useState<"success" | "error" | null>(null)

  const triggerSaveFlash = (tone: "success" | "error") => {
    setSaveFlash(tone)
    window.setTimeout(() => setSaveFlash(null), 900)
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
            contextMode: contextDetailMode,
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

      const success = await onAdd(flashcard, { closeAfterAdd: false })
      if (success) {
        triggerSaveFlash("success")
        setWord("")
      } else {
        triggerSaveFlash("error")
        setError("Esta palavra já existe nessa categoria no seu vocabulário.")
      }
    } catch (err) {
      triggerSaveFlash("error")
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
                contextMode: contextDetailMode,
                efommMode,
                includeMultipleTranslations,
              },
            }),
          })
          if (!res.ok) throw new Error("Erro ao gerar")
          const data: FlashcardAIResponse = await res.json()

          const flashcard = aiResponseToFlashcard(data, w)

          const success = await onAdd(flashcard, { closeAfterAdd: false })
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
      if (added > 0 && failed === 0) {
        triggerSaveFlash("success")
      } else if (added === 0 || failed > 0) {
        triggerSaveFlash("error")
      }
      setBatchText("")
    } finally {
      setIsLoading(false)
      setBatchTotal(0)
      setBatchDone(0)
    }
  }

  const handleSubmitManual = async (e: React.FormEvent) => {
    e.preventDefault()

    const normalizedWord = manualWord.trim().replace(/\s+/g, " ")
    const normalizedTranslation = manualTranslation.trim()
    const normalizedExample = manualExample.trim()
    const normalizedExampleTranslation = manualExampleTranslation.trim()
    const normalizedUsageNote = manualUsageNote.trim()
    const needsBackgroundEnrichment = !normalizedTranslation || !normalizedExample || !normalizedExampleTranslation

    if (!normalizedWord) {
      triggerSaveFlash("error")
      setError("Preencha a palavra para criar o cartão manual.")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const posValidationRes = await fetch("/api/ai/validate-pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: normalizedWord,
          partOfSpeech: manualPartOfSpeech,
          model,
        }),
      })

      if (!posValidationRes.ok) {
        const json = await posValidationRes.json().catch(() => ({}))
        throw new Error(json?.error || "Falha ao validar tag da palavra")
      }

      const posValidation = (await posValidationRes.json()) as {
        valid: boolean
        reason?: string
      }

      if (!posValidation.valid) {
        triggerSaveFlash("error")
        setError(
          posValidation.reason
            ? `Tag inválida para "${normalizedWord}": ${posValidation.reason}`
            : `Tag inválida para "${normalizedWord}" em uso comum.`
        )
        setIsLoading(false)
        return
      }
    } catch (err) {
      triggerSaveFlash("error")
      setError(err instanceof Error ? err.message : "Erro ao validar tag da palavra.")
      setIsLoading(false)
      return
    }

    const flashcard: Flashcard = {
      id: crypto.randomUUID(),
      word: normalizedWord.toLowerCase(),
      partOfSpeech: manualPartOfSpeech,
      translation: normalizedTranslation,
      usageNote: normalizedUsageNote,
      synonyms: [],
      antonyms: [],
      example: normalizedExample,
      exampleTranslation: normalizedExampleTranslation,
      alternativeForms: [],
      aiEnriching: needsBackgroundEnrichment,
      folderId: null,
      createdAt: Date.now(),
    }

    try {
      const success = await onAdd(flashcard, { closeAfterAdd: false })
      if (!success) {
        triggerSaveFlash("error")
        setError("Esta palavra já existe nessa categoria no seu vocabulário.")
        return
      }

      triggerSaveFlash("success")
      toast({
        title: "Cartão manual criado",
        description: `${flashcard.word} (${partOfSpeechLabels[flashcard.partOfSpeech]})`,
      })

      if (needsBackgroundEnrichment && onUpdate) {
        const t = toast({
          title: "IA em segundo plano",
          description: `Completando campos de ${flashcard.word}...`,
        })

        ;(async () => {
          try {
            let aiTranslation = ""
            let aiUsageNote = ""
            let aiExample = ""
            let aiExampleTranslation = ""
            let aiSynonyms: Flashcard["synonyms"] = []
            let aiAntonyms: Flashcard["antonyms"] = []
            let aiAlternativeForms: Flashcard["alternativeForms"] = []
            let aiConjugations: Flashcard["conjugations"] | undefined
            let aiVerbType: Flashcard["verbType"] | undefined

            if (normalizedTranslation) {
              const res = await fetch("/api/ai/revise", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  model,
                  input: {
                    word: normalizedWord,
                    partOfSpeech: manualPartOfSpeech,
                    translation: normalizedTranslation,
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
                throw new Error(json?.error || "Falha ao revisar card manual")
              }

              const data = (await res.json()) as {
                translation: string
                usageNote?: string
                synonyms?: Flashcard["synonyms"]
                antonyms?: Flashcard["antonyms"]
                example: string
                exampleTranslation?: string
                alternativeForms?: Flashcard["alternativeForms"]
              }

              aiTranslation = data.translation || ""
              aiUsageNote = data.usageNote || ""
              aiExample = data.example || ""
              aiExampleTranslation = data.exampleTranslation || ""
              aiSynonyms = data.synonyms || []
              aiAntonyms = data.antonyms || []
              aiAlternativeForms = (data.alternativeForms || []).map((f) => ({
                ...f,
                partOfSpeech: f.partOfSpeech as PartOfSpeech,
              }))
            } else {
              const res = await fetch("/api/ai/flashcard", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  word: normalizedWord,
                  model,
                  options: {
                    synonymsLevel,
                    includeConjugations,
                    includeAlternativeForms,
                    includeUsageNote,
                    contextMode: contextDetailMode,
                    efommMode,
                    includeMultipleTranslations,
                    targetPartOfSpeech: manualPartOfSpeech,
                  },
                }),
              })

              if (!res.ok) {
                const json = await res.json().catch(() => ({}))
                throw new Error(json?.error || "Falha ao enriquecer card manual")
              }

              const data = (await res.json()) as FlashcardAIResponse
              aiTranslation = data.translation || ""
              aiUsageNote = data.usageNote || ""
              aiExample = data.example || ""
              aiExampleTranslation = data.exampleTranslation || ""
              aiSynonyms = data.synonyms || []
              aiAntonyms = data.antonyms || []
              aiAlternativeForms = (data.alternativeForms || []).map((f) => ({
                ...f,
                partOfSpeech: f.partOfSpeech as PartOfSpeech,
              }))
              aiConjugations = data.conjugations ?? undefined
              aiVerbType = data.verbType ?? undefined
            }

            const enriched: Flashcard = {
              ...flashcard,
              translation: normalizedTranslation || aiTranslation || flashcard.translation,
              usageNote: normalizedUsageNote || aiUsageNote || flashcard.usageNote || "",
              example: normalizedExample || aiExample || flashcard.example,
              exampleTranslation: normalizedExampleTranslation || aiExampleTranslation || flashcard.exampleTranslation || "",
              synonyms: aiSynonyms,
              antonyms: aiAntonyms,
              alternativeForms: aiAlternativeForms,
              conjugations: aiConjugations ?? flashcard.conjugations,
              verbType: aiVerbType ?? flashcard.verbType,
              aiEnriching: false,
            }

            const updated = await onUpdate(enriched)
            t.update({
              id: t.id,
              title: updated ? "Card enriquecido" : "Card criado",
              description: updated
                ? `Campos ausentes de ${flashcard.word} foram preenchidos pela IA.`
                : `Não foi possível atualizar ${flashcard.word} em segundo plano.`,
              variant: updated ? "default" : "destructive",
            })
          } catch (err) {
            triggerSaveFlash("error")
            t.update({
              id: t.id,
              title: "Falha no enriquecimento",
              description: err instanceof Error ? err.message : "Erro ao completar os campos com IA.",
              variant: "destructive",
            })
          }
        })()
      }

      setManualWord("")
      setManualPartOfSpeech("noun")
      setManualTranslation("")
      setManualExample("")
      setManualExampleTranslation("")
      setManualUsageNote("")
    } finally {
      setIsLoading(false)
    }
  }

  const formEl = (
    <form
      onSubmit={mode === "single" ? handleSubmitSingle : mode === "batch" ? handleSubmitBatch : handleSubmitManual}
      className={cn(
        "space-y-3 rounded-xl transition-all",
        saveFlash === "success" &&
          "bg-emerald-400/10 ring-1 ring-emerald-300/50 animate-[pulse_0.55s_ease-in-out_1]",
        saveFlash === "error" && "bg-rose-300/10 ring-1 ring-rose-300/50 animate-[pulse_0.55s_ease-in-out_1]"
      )}
    >
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
            ) : mode === "batch" ? (
              <span className="flex-1 text-[13px] text-muted-foreground/50 select-none">
                Lote ativo — cole as palavras abaixo
              </span>
            ) : (
              <span className="flex-1 text-[13px] text-muted-foreground/50 select-none">
                Manual ativo
              </span>
            )}

            {/* Mode toggle: Uma | Lote | Manual */}
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
              <button
                type="button"
                onClick={() => setMode("manual")}
                disabled={isLoading}
                className={cn(
                  "h-full rounded-full px-2.5 text-[11px] font-medium leading-none transition-all",
                  mode === "manual"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Manual
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
            ) : mode === "batch" ? (
              <Button
                type="submit"
                size="sm"
                disabled={parseBatchWords(batchText).length === 0 || isLoading}
                className="h-[30px] rounded-full px-3 text-[12px] shadow-none"
              >
                {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : "Adicionar"}
              </Button>
            ) : (
              <Button
                type="submit"
                size="sm"
                disabled={!manualWord.trim() || isLoading}
                className="h-[30px] rounded-full px-3 text-[12px] shadow-none"
              >
                {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : "Salvar"}
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

          {mode === "manual" && (
            <div className="space-y-3 rounded-xl border border-border/40 bg-muted/15 p-3 sm:p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Palavra</label>
                  <Input
                    value={manualWord}
                    onChange={(e) => setManualWord(e.target.value)}
                    placeholder="Ex.: agenda"
                    disabled={isLoading}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tag</label>
                  <select
                    value={manualPartOfSpeech}
                    onChange={(e) => setManualPartOfSpeech(e.target.value as PartOfSpeech)}
                    disabled={isLoading}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
                  >
                    {(Object.keys(partOfSpeechLabels) as PartOfSpeech[]).map((pos) => (
                      <option key={pos} value={pos}>
                        {partOfSpeechLabels[pos]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tradução</label>
                <Input
                  value={manualTranslation}
                  onChange={(e) => setManualTranslation(e.target.value)}
                  placeholder="Ex.: a pauta / a ordem do dia"
                  disabled={isLoading}
                  className="h-9"
                />
              </div>

              {showManualOptionalFields && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Exemplo (inglês) (opcional)</label>
                    <textarea
                      value={manualExample}
                      onChange={(e) => setManualExample(e.target.value)}
                      placeholder="Ex.: The agenda changed after lunch."
                      disabled={isLoading}
                      className="w-full min-h-[72px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tradução do exemplo (opcional)</label>
                    <textarea
                      value={manualExampleTranslation}
                      onChange={(e) => setManualExampleTranslation(e.target.value)}
                      placeholder="Ex.: A pauta mudou depois do almoço."
                      disabled={isLoading}
                      className="w-full min-h-[62px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Contexto (opcional)</label>
                    <textarea
                      value={manualUsageNote}
                      onChange={(e) => setManualUsageNote(e.target.value)}
                      placeholder="Dica de uso, nuance, registro ou contraste que você queira guardar."
                      disabled={isLoading}
                      className="w-full min-h-[62px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </>
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
