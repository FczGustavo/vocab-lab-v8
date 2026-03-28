"use client"

import { useState } from "react"
import {
  FlaskConical,
  Loader2,
  AlertCircle,
  BookOpen,
  RefreshCw,
  Trophy,
  TrendingUp,
  Target,
  Calendar,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useApiKey } from "@/hooks/use-api-key"
import { useFlashcardsDB } from "@/hooks/use-flashcards-db"
import { useGrammarProgress } from "@/hooks/use-grammar-progress"
import { generateGrammarExercises } from "@/lib/openai"
import { ExerciseCard } from "./exercise-card"
import type { GrammarExercise } from "@/lib/types"

export function GrammarPage() {
  const { apiKey, hasApiKey } = useApiKey()
  const { allFlashcards: flashcards, isLoading: isLoadingCards } = useFlashcardsDB()
  const { saveGrammarSession, getGrammarStats, isLoaded: isProgressLoaded } = useGrammarProgress()
  const [exercises, setExercises] = useState<GrammarExercise[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exerciseType, setExerciseType] = useState<
    "fill-blank" | "verb-conjugation" | "mixed"
  >("mixed")
  const [completedCount, setCompletedCount] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [sessionSaved, setSessionSaved] = useState(false)
  
  const stats = getGrammarStats()

  const generateExercises = async () => {
    if (!apiKey || flashcards.length === 0) return

    setIsGenerating(true)
    setError(null)
    setExercises([])
    setCompletedCount(0)
    setCorrectCount(0)
    setSessionSaved(false)

    try {
      const selectedCards = flashcards.slice(0, 10)
      const newExercises = await generateGrammarExercises(
        apiKey,
        selectedCards,
        exerciseType,
        5
      )
      setExercises(newExercises)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao gerar exercícios"
      )
    } finally {
      setIsGenerating(false)
    }
  }

  const handleExerciseComplete = (correct: boolean) => {
    setCompletedCount((prev) => prev + 1)
    if (correct) {
      setCorrectCount((prev) => prev + 1)
    }
  }

  const allCompleted = exercises.length > 0 && completedCount === exercises.length

  // Save session when all exercises are completed
  if (allCompleted && !sessionSaved) {
    saveGrammarSession({
      totalExercises: exercises.length,
      correctAnswers: correctCount,
      exerciseType,
      wordsUsed: exercises.map((e) => e.wordUsed),
    })
    setSessionSaved(true)
  }

  if (!hasApiKey) {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Grammar Lab
          </h1>
          <p className="text-muted-foreground">
            Pratique gramática com exercícios gerados pela IA usando seu
            vocabulário.
          </p>
        </div>

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
      </div>
    )
  }

  if (isLoadingCards) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (flashcards.length === 0) {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Grammar Lab
          </h1>
          <p className="text-muted-foreground">
            Pratique gramática com exercícios gerados pela IA usando seu
            vocabulário.
          </p>
        </div>

        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <BookOpen className="size-10 text-muted-foreground mb-3" />
            <h3 className="font-semibold text-foreground mb-1">
              Adicione palavras primeiro
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Vá para a página de Flashcards e adicione algumas palavras ao seu
              vocabulário para gerar exercícios personalizados.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Grammar Lab
        </h1>
        <p className="text-muted-foreground">
          Pratique gramática com exercícios gerados pela IA usando seu
          vocabulário de {flashcards.length}{" "}
          {flashcards.length === 1 ? "palavra" : "palavras"}.
        </p>
      </div>

      {/* Progress Stats */}
      {isProgressLoaded && stats.totalSessions > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Calendar className="size-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.totalSessions}</p>
                  <p className="text-xs text-muted-foreground">Sessoes</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <FlaskConical className="size-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.totalExercises}</p>
                  <p className="text-xs text-muted-foreground">Exercicios</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-success/10">
                  <Target className="size-5 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.totalCorrect}</p>
                  <p className="text-xs text-muted-foreground">Acertos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent/20">
                  <TrendingUp className="size-5 text-accent-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.averageAccuracy}%</p>
                  <p className="text-xs text-muted-foreground">Precisao</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FlaskConical className="size-5 text-primary" />
            Gerar Exercícios
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Select
              value={exerciseType}
              onValueChange={(v) =>
                setExerciseType(v as typeof exerciseType)
              }
            >
              <SelectTrigger className="sm:w-64">
                <SelectValue placeholder="Tipo de exercício" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mixed">Misto</SelectItem>
                <SelectItem value="fill-blank">Preencher lacunas</SelectItem>
                <SelectItem value="verb-conjugation">
                  Conjugação verbal
                </SelectItem>
              </SelectContent>
            </Select>

            <Button
              onClick={generateExercises}
              disabled={isGenerating}
              className="sm:flex-1"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Gerando exercícios...
                </>
              ) : exercises.length > 0 ? (
                <>
                  <RefreshCw className="size-4 mr-2" />
                  Gerar novos exercícios
                </>
              ) : (
                "Gerar exercícios"
              )}
            </Button>
          </div>

          {error && (
            <p className="text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="size-4" />
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {exercises.length > 0 && (
        <div className="space-y-4">
          {allCompleted && (
            <Card className="bg-primary/5 border-primary">
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <Trophy className="size-8 text-primary" />
                  <div>
                    <p className="font-semibold text-foreground">
                      Exercícios concluídos!
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Você acertou {correctCount} de {exercises.length}{" "}
                      exercícios
                    </p>
                  </div>
                </div>
                <Button onClick={generateExercises} disabled={isGenerating}>
                  <RefreshCw className="size-4 mr-2" />
                  Praticar mais
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4">
            {exercises.map((exercise, index) => (
              <ExerciseCard
                key={exercise.id}
                exercise={exercise}
                index={index}
                onComplete={handleExerciseComplete}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
