"use client"

import { useState } from "react"
import { Check, X, Lightbulb, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import type { GrammarExercise } from "@/lib/types"

interface ExerciseCardProps {
  exercise: GrammarExercise
  index: number
  onComplete: (correct: boolean) => void
}

export function ExerciseCard({ exercise, index, onComplete }: ExerciseCardProps) {
  const [answer, setAnswer] = useState("")
  const [showHint, setShowHint] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)

  const handleSubmit = () => {
    const correct =
      answer.trim().toLowerCase() === exercise.answer.toLowerCase()
    setIsCorrect(correct)
    setSubmitted(true)
    onComplete(correct)
  }

  const typeLabel =
    exercise.type === "fill-blank"
      ? "Preencher lacuna"
      : "Conjugação verbal"

  return (
    <Card
      className={cn(
        "transition-colors",
        submitted && isCorrect && "border-success bg-success/5",
        submitted && !isCorrect && "border-destructive bg-destructive/5"
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {index + 1}
            </span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {typeLabel}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            Vocabulário: <span className="font-medium text-foreground">{exercise.wordUsed}</span>
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-lg text-foreground leading-relaxed">
          {exercise.sentence}
        </p>

        {!submitted ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Sua resposta..."
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && answer.trim() && handleSubmit()}
                className="flex-1"
              />
              <Button onClick={handleSubmit} disabled={!answer.trim()}>
                <ArrowRight className="size-4" />
              </Button>
            </div>

            {exercise.hint && (
              <div>
                {showHint ? (
                  <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded-md">
                    <Lightbulb className="size-4 inline mr-2 text-primary" />
                    {exercise.hint}
                  </p>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => setShowHint(true)}
                  >
                    <Lightbulb className="size-3 mr-1" />
                    Ver dica
                  </Button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div
              className={cn(
                "flex items-center gap-2 p-3 rounded-lg",
                isCorrect ? "bg-success/10" : "bg-destructive/10"
              )}
            >
              {isCorrect ? (
                <>
                  <Check className="size-5 text-success" />
                  <span className="font-medium text-success">Correto!</span>
                </>
              ) : (
                <>
                  <X className="size-5 text-destructive" />
                  <span className="font-medium text-destructive">
                    Incorreto. Resposta correta: {exercise.answer}
                  </span>
                </>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              Sua resposta: <span className="font-medium">{answer}</span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
