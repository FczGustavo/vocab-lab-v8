"use client"

import { useState } from "react"
import { Plus, Loader2, Sparkles, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { useApiKey } from "@/hooks/use-api-key"
import { generateFlashcardData } from "@/lib/openai"
import type { Flashcard } from "@/lib/types"

interface AddFlashcardFormProps {
  onAdd: (flashcard: Flashcard) => Promise<boolean>
}

export function AddFlashcardForm({ onAdd }: AddFlashcardFormProps) {
  const { apiKey, hasApiKey } = useApiKey()
  const [word, setWord] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!word.trim() || !apiKey) return

    setIsLoading(true)
    setError(null)

    try {
      const data = await generateFlashcardData(apiKey, word.trim())

      const flashcard: Flashcard = {
        id: crypto.randomUUID(),
        word: data.normalizedWord.toLowerCase(),
        partOfSpeech: data.partOfSpeech,
        translation: data.translation,
        synonyms: data.synonyms,
        antonyms: data.antonyms,
        example: data.example,
        alternativeForms: data.alternativeForms || [],
        conjugations: data.conjugations,
        folderId: null,
        createdAt: Date.now(),
      }

      const success = await onAdd(flashcard)
      if (success) {
        setWord("")
      } else {
        setError("Esta palavra já existe no seu vocabulário.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar flashcard")
    } finally {
      setIsLoading(false)
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
            adicionar sua chave da OpenAI.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
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

          {error && (
            <p className="text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="size-4" />
              {error}
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            A IA irá gerar automaticamente a classe gramatical, tradução, sinônimos, 
            antônimos, exemplo de uso e formas alternativas (quando houver).
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
