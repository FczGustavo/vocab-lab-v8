"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Trophy,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  BookmarkPlus,
  BookOpen,
  Folder,
  FolderOpen,
  FolderPlus,
  Trash2,
  MoreVertical,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useGptModel } from "@/hooks/use-gpt-model"
import { useFlashcardsDB } from "@/hooks/use-flashcards-db"
import { useGrammarDB } from "@/hooks/use-grammar-db"
import { cn } from "@/lib/utils"
import type { GrammarQuestion, GrammarFolder, GrammarList, GrammarQuestionOption } from "@/lib/types"

// ── Topic taxonomy ─────────────────────────────────────────────────────────────

const TOPICS = [
  {
    id: "verb-forms",
    label: "Verbos e Formas",
    subtopics: [
      "Simple Present",
      "Simple Past",
      "Present Perfect",
      "Past Perfect",
      "Future (will / going to)",
      "Present Continuous",
      "Past Continuous",
      "Past Perfect Continuous",
      "Future Perfect",
      "Gerund vs Infinitive",
      "Regular Verbs",
      "Irregular Verbs",
    ],
  },
  {
    id: "voice-modals-imperative",
    label: "Voz, Modais e Imperativos",
    subtopics: [
      "Active vs Passive Voice",
      "Present passive",
      "Past passive",
      "Perfect passive",
      "Passive with modals",
      "Causative have/get",
      "can / could",
      "may / might",
      "must / have to",
      "should / ought to",
      "will / would",
      "need / dare",
      "Imperative sentences",
    ],
  },
  {
    id: "conditionals-speech",
    label: "Condicionais e Discurso",
    subtopics: [
      "Zero conditional",
      "First conditional",
      "Second conditional",
      "Third conditional",
      "Mixed conditionals",
      "Reported statements",
      "Reported questions",
      "Reported commands",
      "Backshift of tenses",
      "Reporting verbs",
    ],
  },
  {
    id: "phrasal-prepositions",
    label: "Phrasal Verbs & Preposições",
    subtopics: [
      "Common Phrasal Verbs",
      "Separable phrasal verbs",
      "Inseparable phrasal verbs",
      "Time prepositions (at/in/on)",
      "Place prepositions (at/in/on)",
      "Movement prepositions",
      "Prepositions after adjectives",
      "Prepositions after verbs",
    ],
  },
  {
    id: "nominal-determiners",
    label: "Nominal / Determiners / Quantifiers",
    subtopics: [
      "Countable vs Uncountable nouns",
      "Plural forms",
      "Genitive (possessive 's)",
      "some / any / no",
      "much / many / a lot of",
      "few / little / a few / a little",
      "all / both / neither / either",
      "each / every",
      "Numerals (cardinal / ordinal)",
      "Noun compounds",
    ],
  },
  {
    id: "pronouns-articles-agreement",
    label: "Pronomes, Artigos e Concordância",
    subtopics: [
      "Personal pronouns",
      "Reflexive pronouns",
      "Relative pronouns",
      "Indefinite pronouns",
      "Definite article (the)",
      "Indefinite articles (a/an)",
      "Zero article",
      "Generic reference",
      "Subject-verb agreement",
      "Pronoun-antecedent agreement",
    ],
  },
  {
    id: "adjectives-adverbs-word-order",
    label: "Adjetivos, Advérbios e Ordem das Palavras",
    subtopics: [
      "Adjective order",
      "Comparatives",
      "Superlatives",
      "Adverb placement",
      "Adverbs of frequency",
      "Adverbs of manner",
      "Word order in statements",
      "Word order in questions",
      "Inversion",
    ],
  },
  {
    id: "connectors-structures",
    label: "Conectivos e Estruturas",
    subtopics: [
      "Coordinating conjunctions",
      "Subordinating conjunctions",
      "Defining relative clauses",
      "Non-defining relative clauses",
      "Adverbial clauses",
      "Noun clauses",
      "Concession (although/despite/in spite of)",
      "Cause & Result",
      "Tag questions",
      "Indirect questions",
      "Exclamatory sentences",
    ],
  },
  {
    id: "punctuation-spelling",
    label: "Pontuação, Ortografia e Numerais",
    subtopics: [
      "Comma usage",
      "Apostrophe usage",
      "Capitalization rules",
      "Spelling rules (doubling, -ie/-ei)",
      "Homophones",
      "Numbers written out",
      "Dates and times",
    ],
  },
  {
    id: "vocabulary",
    label: "Vocabulário e Uso",
    subtopics: [
      "Idioms",
      "False Friends / False Cognates",
      "Synonyms & Antonyms",
      "Collocations",
      "Phrasal Verbs in context",
      "Register (formal vs informal)",
      "Word formation (prefixes/suffixes)",
    ],
  },
]

// ── Local types ───────────────────────────────────────────────────────────────

type Phase = "idle" | "loading" | "quiz" | "complete"

interface QuestionState {
  pendingLetter: string | null
  answeredLetter: string | null
  eliminated: string[]
}

export function GrammarPage() {
  const { model } = useGptModel()
  const { allFlashcards } = useFlashcardsDB()
  const {
    getQuestionsForTopics,
    saveQuestion,
    getAnsweredIds,
    markAnswered,
    getFolders,
    createFolder,
    deleteFolder,
    getLists,
    saveList,
    deleteList,
    getQuestionsById,
  } = useGrammarDB()

  const [selectedTopics, setSelectedTopics] = useState<string[]>(["verb-forms"])
  const [selectedSubtopics, setSelectedSubtopics] = useState<Record<string, string[]>>({})
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [questionCount, setQuestionCount] = useState<5 | 10 | 15>(5)

  const [folders, setFolders] = useState<GrammarFolder[]>([])
  const [lists, setLists] = useState<GrammarList[]>([])
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null)

  const [isSaveOpen, setIsSaveOpen] = useState(false)
  const [saveListName, setSaveListName] = useState("")
  const [saveFolderId, setSaveFolderId] = useState<string | null>(null)

  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")

  const [phase, setPhase] = useState<Phase>("idle")
  const [questions, setQuestions] = useState<GrammarQuestion[]>([])
  const [questionStates, setQuestionStates] = useState<QuestionState[]>([])
  const [loadingProgress, setLoadingProgress] = useState({ done: 0, total: 0 })
  const [loadingStatus, setLoadingStatus] = useState("")
  const [error, setError] = useState<string | null>(null)
  const lastClickRef = useRef<Record<string, number>>({})

  useEffect(() => {
    getFolders().then(setFolders).catch(console.error)
    getLists().then(setLists).catch(console.error)
  }, [getFolders, getLists])

  const toggleTopic = useCallback((id: string) => {
    setSelectedTopics((prev) =>
      prev.includes(id)
        ? prev.length > 1 ? prev.filter((t) => t !== id) : prev
        : [...prev, id]
    )
  }, [])

  const toggleSubtopic = useCallback((topicId: string, sub: string) => {
    setSelectedSubtopics((prev) => {
      const curr = prev[topicId] ?? []
      return {
        ...prev,
        [topicId]: curr.includes(sub) ? curr.filter((s) => s !== sub) : [...curr, sub],
      }
    })
  }, [])

  const handleLoadList = useCallback(
    async (list: GrammarList) => {
      setActiveListId(list.id)
      setPhase("loading")
      setLoadingStatus("Puxando do banco de dados...")
      setLoadingProgress({ done: 0, total: 0 })
      setError(null)
      setQuestionStates([])
      lastClickRef.current = {}
      try {
        const loaded = await getQuestionsById(list.questionIds)
        if (!loaded.length) {
          setError("Lista vazia ou questoes removidas do cache.")
          setPhase("idle")
          return
        }
        setQuestions(loaded)
        setQuestionStates(loaded.map(() => ({ pendingLetter: null, answeredLetter: null, eliminated: [] })))
        setPhase("quiz")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar lista")
        setPhase("idle")
      }
    },
    [getQuestionsById]
  )

  const handleSaveList = useCallback(async () => {
    if (!saveListName.trim() || !questions.length) return
    const list: GrammarList = {
      id: crypto.randomUUID(),
      name: saveListName.trim(),
      folderId: saveFolderId,
      questionIds: questions.map((q) => q.id),
      createdAt: Date.now(),
    }
    await saveList(list)
    setLists((prev) => [...prev, list])
    setActiveListId(list.id)
    setIsSaveOpen(false)
    setSaveListName("")
  }, [saveListName, saveFolderId, questions, saveList])

  const handleCreateFolderInSave = useCallback(async () => {
    if (!newFolderName.trim()) return
    const folder = await createFolder(newFolderName.trim())
    setFolders((prev) => [...prev, folder])
    setSaveFolderId(folder.id)
    setNewFolderName("")
  }, [newFolderName, createFolder])

  const handleCreateFolderFromBar = useCallback(async () => {
    if (!newFolderName.trim()) return
    const folder = await createFolder(newFolderName.trim())
    setFolders((prev) => [...prev, folder])
    setExpandedFolderId(folder.id)
    setNewFolderName("")
    setIsFolderDialogOpen(false)
  }, [newFolderName, createFolder])

  const handleDeleteList = useCallback(
    async (listId: string) => {
      await deleteList(listId)
      setLists((prev) => prev.filter((l) => l.id !== listId))
      if (activeListId === listId) setActiveListId(null)
    },
    [deleteList, activeListId]
  )

  const handleDeleteFolder = useCallback(
    async (folderId: string) => {
      await deleteFolder(folderId)
      setFolders((prev) => prev.filter((f) => f.id !== folderId))
      const removed = lists.filter((l) => l.folderId === folderId).map((l) => l.id)
      await Promise.all(removed.map((id) => deleteList(id)))
      setLists((prev) => prev.filter((l) => l.folderId !== folderId))
      if (expandedFolderId === folderId) setExpandedFolderId(null)
    },
    [deleteFolder, deleteList, lists, expandedFolderId]
  )

  const handleGenerate = useCallback(async () => {
    if (!selectedTopics.length) return
    setPhase("loading")
    setLoadingStatus("Procurando no banco...")
    setLoadingProgress({ done: 0, total: questionCount })
    setError(null)
    setActiveListId(null)
    lastClickRef.current = {}

    const userWords = allFlashcards.slice(0, 30).map((f) => f.word)
    const generated: GrammarQuestion[] = []
    const newlyGenerated: GrammarQuestion[] = []

    try {
      const answeredIds = await getAnsweredIds()

      // 1. Try shared Supabase cache first
      let fromDB: GrammarQuestion[] = []
      try {
        const res = await fetch("/api/grammar/fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topics: selectedTopics,
            subtopics: selectedSubtopics,
            excludeIds: answeredIds,
            limit: questionCount * 8,
          }),
        })
        if (res.ok) {
          const json = await res.json()
          const all: GrammarQuestion[] = json.questions ?? []
          // Shuffle so different users get variety
          fromDB = all.sort(() => Math.random() - 0.5).slice(0, questionCount)
        }
      } catch {
        // Supabase unavailable – fall back to local IndexedDB
        const cached = await getQuestionsForTopics(selectedTopics, answeredIds)
        fromDB = cached.slice(0, questionCount)
      }

      // Use DB questions
      for (const q of fromDB) {
        generated.push(q)
        await saveQuestion(q) // keep local copy in IndexedDB
        setLoadingProgress({ done: generated.length, total: questionCount })
      }

      // 2. Generate remainder with AI
      const needMore = questionCount - fromDB.length

      // Build a flat pool of all selected subtopics across all selected topics
      const subPool: { topicId: string; topicLabel: string; subtopic: string }[] = []
      for (const topicId of selectedTopics) {
        const topic = TOPICS.find((t) => t.id === topicId)!
        const activeSubs = selectedSubtopics[topicId] ?? []
        const subs = activeSubs.length > 0 ? activeSubs : topic.subtopics
        for (const sub of subs) {
          subPool.push({ topicId, topicLabel: topic.label, subtopic: sub })
        }
      }
      // Always blend exactly 2 subtopics per question (or 1 if pool has only 1)
      const blendSize = subPool.length >= 2 ? 2 : 1

      for (let i = 0; i < needMore; i++) {
        const qNum = fromDB.length + i + 1
        setLoadingStatus(`Criando questao ${qNum} de ${questionCount}...`)

        // Pick `blendSize` consecutive distinct subtopics from the pool (cycling)
        const startIdx = (fromDB.length + i) % subPool.length
        const blend = Array.from({ length: blendSize }, (_, j) => subPool[(startIdx + j) % subPool.length])
        // Deduplicate by subtopic name in case pool is small and we wrapped onto the same item
        const seen = new Set<string>()
        const uniqueBlend = blend.filter((b) => {
          if (seen.has(b.subtopic)) return false
          seen.add(b.subtopic)
          return true
        })

        const primaryEntry = uniqueBlend[0]
        // Use the primary entry's topic label (most representative)
        const topicLabel = primaryEntry.topicLabel
        const subtopics = uniqueBlend.map((b) => b.subtopic)
        const qType: "correct" | "incorrect" = (fromDB.length + i) % 2 === 0 ? "correct" : "incorrect"

        const aiRes = await fetch("/api/ai/grammar-question", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topicLabel, subtopics, questionType: qType, model, userWords }),
        })
        if (!aiRes.ok) {
          const json = await aiRes.json().catch(() => ({}))
          throw new Error(json?.error || "Erro ao gerar questão")
        }
        const aiResult: { questionText: string; contextPassage?: string | null; options: GrammarQuestionOption[] } = await aiRes.json()

        const question: GrammarQuestion = {
          id: crypto.randomUUID(),
          topic: primaryEntry.topicId,
          subtopic: primaryEntry.subtopic,
          questionText: aiResult.questionText,
          contextPassage: aiResult.contextPassage ?? undefined,
          questionType: qType,
          options: aiResult.options,
          createdAt: Date.now(),
        }

        await saveQuestion(question) // IndexedDB local
        newlyGenerated.push(question)
        generated.push(question)
        setLoadingProgress({ done: generated.length, total: questionCount })
      }

      // 3. Push new questions to shared Supabase cache
      if (newlyGenerated.length > 0) {
        setLoadingStatus("Salvando no banco...")
        try {
          await fetch("/api/grammar/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ questions: newlyGenerated }),
          })
        } catch (saveErr) {
          console.error("[grammar] falha ao salvar no banco:", saveErr)
        }
      }

      if (generated.length === 0) {
        setError("Nenhuma questao gerada. Verifique sua API key.")
        setPhase("idle")
        return
      }

      setQuestions(generated)
      setQuestionStates(generated.map(() => ({ pendingLetter: null, answeredLetter: null, eliminated: [] })))
      setPhase("quiz")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar questoes")
      setPhase("idle")
    }
  }, [selectedTopics, selectedSubtopics, questionCount, model, allFlashcards, getAnsweredIds, getQuestionsForTopics, saveQuestion])

  const handleEliminate = useCallback((qIdx: number, letter: string) => {
    setQuestionStates((prev) => {
      const next = [...prev]
      const qs = next[qIdx]
      if (!qs || qs.answeredLetter) return prev
      const already = qs.eliminated.includes(letter)
      next[qIdx] = {
        ...qs,
        eliminated: already ? qs.eliminated.filter((l) => l !== letter) : [...qs.eliminated, letter],
        pendingLetter: qs.pendingLetter === letter ? null : qs.pendingLetter,
      }
      return next
    })
  }, [])

  const handleOptionClick = useCallback(
    (qIdx: number, letter: string) => {
      const qs = questionStates[qIdx]
      if (!qs || qs.answeredLetter) return
      const key = `${qIdx}-${letter}`
      const now = Date.now()
      const last = lastClickRef.current[key] ?? 0
      lastClickRef.current[key] = now
      if (now - last < 400) {
        handleEliminate(qIdx, letter)
      } else {
        setQuestionStates((prev) => {
          const next = [...prev]
          next[qIdx] = {
            ...next[qIdx],
            pendingLetter: next[qIdx].pendingLetter === letter ? null : letter,
          }
          return next
        })
      }
    },
    [questionStates, handleEliminate]
  )

  const handleConfirm = useCallback(
    async (qIdx: number) => {
      const qs = questionStates[qIdx]
      if (!qs || !qs.pendingLetter || qs.answeredLetter) return
      const question = questions[qIdx]
      const letter = qs.pendingLetter
      const correct = question.options.find((o) => o.letter === letter)?.isAnswer === true
      setQuestionStates((prev) => {
        const next = [...prev]
        next[qIdx] = { ...next[qIdx], answeredLetter: letter }
        return next
      })
      await markAnswered({ questionId: question.id, chosenLetter: letter, correct, answeredAt: Date.now() })
    },
    [questionStates, questions, markAnswered]
  )

  const handleNewSession = useCallback(() => {
    setPhase("idle")
    setQuestions([])
    setQuestionStates([])
    lastClickRef.current = {}
    setError(null)
    setActiveListId(null)
    setExpandedFolderId(null)
    setLoadingStatus("")
  }, [])

  const allAnswered = questionStates.length > 0 && questionStates.every((qs) => qs.answeredLetter !== null)
  const correctCount = questionStates.filter((qs, i) => {
    if (!qs.answeredLetter) return false
    return questions[i]?.options.find((o) => o.letter === qs.answeredLetter)?.isAnswer === true
  }).length

  // loading
  if (phase === "loading") {
    const { done, total } = loadingProgress
    const pct = total > 0 ? Math.round((done / total) * 100) : 0
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6">
        <Loader2 className="size-8 animate-spin text-primary/60" />
        <p className="text-[14px] font-medium text-foreground/70">{loadingStatus}</p>
        {total > 0 && (
          <div className="w-full max-w-xs">
            <div className="mb-2 flex justify-between text-[11px] text-muted-foreground">
              <span>{done} de {total}</span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>
    )
  }

  // complete
  if (phase === "complete") {
    const total = questions.length
    const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-8">
        <Trophy className="size-16 text-amber-400" />
        <div className="text-center">
          <p className="text-[42px] font-light leading-none tracking-tight">{correctCount}/{total}</p>
          <p className="mt-1 text-[14px] text-muted-foreground">{pct}% corretas</p>
        </div>
        <Button variant="outline" onClick={handleNewSession} className="gap-2">
          <RotateCcw className="size-4" />
          Nova sessao
        </Button>
      </div>
    )
  }

  // quiz
  if (phase === "quiz") {
    return (
      <div className="w-full">
        <div className="mb-6 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={handleNewSession} className="gap-2 text-muted-foreground">
            <RotateCcw className="size-3.5" />
            Nova sessao
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setSaveListName(""); setSaveFolderId(null); setIsSaveOpen(true) }} className="gap-2">
            <BookmarkPlus className="size-4" />
            Salvar lista
          </Button>
        </div>

        <p className="mb-5 text-center text-[11px] text-muted-foreground/60">
          1 clique para selecionar &middot; 2 cliques para riscar
        </p>

        <div className="flex flex-col gap-6">
          {questions.map((question, qIdx) => {
            const qs = questionStates[qIdx]
            if (!qs) return null
            const answered = qs.answeredLetter !== null
            return (
              <div key={question.id} className="rounded-2xl border border-border/40 bg-card p-6 shadow-sm">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                  Questao {String(qIdx + 1).padStart(2, "0")}
                </p>
                {question.contextPassage && (
                  <div className="mb-4 rounded-xl border border-border/30 bg-muted/30 px-4 py-3">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">Texto de apoio</p>
                    <p className="text-[13px] leading-relaxed text-foreground/80 italic">{question.contextPassage}</p>
                  </div>
                )}
                <p className="mb-5 text-[15px] leading-relaxed text-foreground">{question.questionText}</p>

                <div className="flex flex-col gap-2">
                  {(() => {
                    // Defensive: pick exactly the FIRST option with isAnswer===true as the correct one.
                    // Guards against AI hallucinations where multiple (or all) options have isAnswer:true.
                    const correctAnswerLetter =
                      question.options.find((o) => o.isAnswer === true)?.letter ?? null
                    return question.options.map((option) => {
                    const isChosen = qs.answeredLetter === option.letter
                    const isCorrectOption = option.letter === correctAnswerLetter
                    const isEliminated = qs.eliminated.includes(option.letter)
                    const isPending = !answered && qs.pendingLetter === option.letter

                    let styles = "border-border/40 bg-muted/20 text-foreground hover:border-border/60 hover:bg-muted/40"
                    if (answered) {
                      if (isCorrectOption) styles = "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 dark:border-emerald-500/30"
                      else if (isChosen) styles = "border-red-400/40 bg-red-500/10 text-red-800 dark:text-red-300 dark:border-red-400/30"
                      else styles = "border-border/20 bg-transparent text-muted-foreground/50"
                    } else if (isPending) {
                      styles = "border-primary/40 bg-primary/10 text-primary"
                    } else if (isEliminated) {
                      styles = "border-border/20 bg-transparent text-muted-foreground/30"
                    }

                    return (
                      <div key={option.letter} className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => handleOptionClick(qIdx, option.letter)}
                          disabled={answered}
                          className={cn(
                            "flex items-start gap-3 rounded-xl border px-4 py-3 text-left text-[14px] leading-relaxed transition-all duration-150",
                            styles,
                            answered ? "cursor-default" : "cursor-pointer"
                          )}
                        >
                          <span className={cn(
                            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                            answered && isCorrectOption ? "border-emerald-500 bg-emerald-500 text-white"
                              : answered && isChosen ? "border-red-400 bg-red-400 text-white"
                              : isPending ? "border-primary bg-primary/15 text-primary"
                              : "border-border/50 text-muted-foreground"
                          )}>
                            {option.letter}
                          </span>
                          <span className={cn("flex-1 transition-all", isEliminated && !answered && "line-through opacity-40")}>
                            {option.text}
                          </span>
                          {answered && isCorrectOption && <CheckCircle2 className="ml-auto mt-0.5 size-4 shrink-0 text-emerald-500" />}
                          {answered && isChosen && !isCorrectOption && <XCircle className="ml-auto mt-0.5 size-4 shrink-0 text-red-400" />}
                        </button>
                        {answered && (
                          <div className={cn(
                            "mt-1 rounded-b-xl px-4 py-2 text-[12px] leading-relaxed",
                            isCorrectOption ? "bg-emerald-500/5 text-emerald-800 dark:text-emerald-300/80"
                              : isChosen ? "bg-red-500/5 text-red-800 dark:text-red-300/80"
                              : "bg-muted/20 text-muted-foreground"
                          )}>
                            {option.explanation}
                          </div>
                        )}
                      </div>
                    )
                  })
                })()}
                </div>

                {!answered && qs.pendingLetter && (
                  <div className="mt-4 flex justify-end">
                    <Button onClick={() => handleConfirm(qIdx)} className="gap-2">
                      Responder
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {allAnswered && (
          <div className="mt-8 flex justify-center">
            <Button onClick={() => setPhase("complete")} className="gap-2" size="lg">
              <Trophy className="size-4" />
              Ver Resultados
            </Button>
          </div>
        )}

        <Dialog open={isSaveOpen} onOpenChange={setIsSaveOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Salvar lista</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 pt-2">
              <Input placeholder="Nome da lista..." value={saveListName} onChange={(e) => setSaveListName(e.target.value)} autoFocus />
              <div>
                <p className="mb-2 text-[12px] text-muted-foreground">Pasta (opcional)</p>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setSaveFolderId(null)} className={cn("rounded-full border px-3 py-1 text-[12px] transition-colors", saveFolderId === null ? "border-primary/40 bg-primary/10 text-primary" : "border-border/30 text-muted-foreground hover:border-border/60 hover:text-foreground")}>
                    Sem pasta
                  </button>
                  {folders.map((f) => (
                    <button key={f.id} type="button" onClick={() => setSaveFolderId(f.id)} className={cn("rounded-full border px-3 py-1 text-[12px] transition-colors", saveFolderId === f.id ? "border-primary/40 bg-primary/10 text-primary" : "border-border/30 text-muted-foreground hover:border-border/60 hover:text-foreground")}>
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Input placeholder="Nova pasta..." value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreateFolderInSave()} className="text-[13px]" />
                <Button variant="outline" size="sm" onClick={handleCreateFolderInSave} disabled={!newFolderName.trim()}>
                  <FolderPlus className="size-3.5" />
                </Button>
              </div>
              <Button onClick={handleSaveList} disabled={!saveListName.trim()}>Salvar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // idle
  return (
    <div className="w-full">
      <div className="mb-10 flex flex-col items-center gap-2 pt-4">
        <h1 className="select-none text-[52px] font-light leading-none tracking-[-0.04em] text-foreground/20">
          Grammar Lab
        </h1>
        <p className="text-[13px] text-muted-foreground/60">Questoes no estilo EFOMM EN AFA</p>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-border/40 bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[14px] font-medium text-foreground">Selecione os topicos</h2>
          <button type="button" onClick={() => setShowAdvanced((p) => !p)} className="flex items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground">
            {showAdvanced ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            {showAdvanced ? "Menos opcoes" : "Mais opcoes"}
          </button>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          {TOPICS.map((topic) => (
            <button key={topic.id} type="button" onClick={() => toggleTopic(topic.id)} className={cn("rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-all duration-150", selectedTopics.includes(topic.id) ? "border-primary/30 bg-primary/10 text-primary" : "border-border/30 bg-transparent text-muted-foreground hover:border-border/60 hover:text-foreground")}>
              {topic.label}
            </button>
          ))}
        </div>

        {showAdvanced && selectedTopics.length > 0 && (
          <div className="mb-5 space-y-5 border-t border-border/30 pt-4">
            {TOPICS.filter((t) => selectedTopics.includes(t.id)).map((topic) => (
              <div key={topic.id}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{topic.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {topic.subtopics.map((sub) => {
                    const activeSubs = selectedSubtopics[topic.id] ?? []
                    const isActive = activeSubs.includes(sub)
                    return (
                      <button key={sub} type="button" onClick={() => toggleSubtopic(topic.id, sub)} className={cn("rounded-full border px-3 py-1 text-[11px] transition-all duration-150", isActive ? "border-primary/30 bg-primary/10 text-primary" : "border-border/20 bg-transparent text-muted-foreground/70 hover:border-border/50 hover:text-muted-foreground")}>
                        {sub}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-border/30 pt-4">
          <span className="shrink-0 text-[12px] text-muted-foreground">Questoes:</span>
          <div className="flex items-center gap-0.5 rounded-full bg-muted/60 p-0.5">
            {([5, 10, 15] as const).map((n) => (
              <button key={n} type="button" onClick={() => setQuestionCount(n)} className={cn("rounded-full px-3 py-1 text-[12px] font-medium transition-all", questionCount === n ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {n}
              </button>
            ))}
          </div>
          <div className="ml-auto">
            <Button onClick={handleGenerate} disabled={!selectedTopics.length} className="gap-2">
              <Sparkles className="size-4" />
              Gerar {questionCount} Questoes
            </Button>
          </div>
        </div>
      </div>

      {(folders.length > 0 || lists.some((l) => !l.folderId)) && (
        <div className="mt-5">
          <div className="segmented-control overflow-x-auto">
            {folders.map((folder) => {
              const isExpanded = expandedFolderId === folder.id
              const count = lists.filter((l) => l.folderId === folder.id).length
              return (
                <div key={folder.id} className="flex items-center gap-0.5">
                  <Button variant="ghost" size="sm" data-active={isExpanded} onClick={() => setExpandedFolderId(isExpanded ? null : folder.id)} className="ghost-filter h-8 gap-1.5 px-3 text-[13px]">
                    {isExpanded ? <FolderOpen className="size-3.5" /> : <Folder className="size-3.5" />}
                    {folder.name}
                    {count > 0 && (
                      <Badge variant="secondary" className="ml-0.5 border-0 bg-muted px-1.5 py-0 text-[10px] font-medium text-muted-foreground shadow-none">
                        {count}
                      </Badge>
                    )}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" className="ghost-filter size-7 opacity-30 hover:opacity-100">
                        <MoreVertical className="size-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleDeleteFolder(folder.id)} className="gap-2 text-destructive focus:text-destructive">
                        <Trash2 className="size-4" />
                        Excluir pasta
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )
            })}

            {lists.filter((l) => !l.folderId).map((list) => (
              <div key={list.id} className="flex items-center gap-0.5">
                <Button variant="ghost" size="sm" data-active={activeListId === list.id} onClick={() => handleLoadList(list)} className="ghost-filter h-8 gap-1.5 px-3 text-[13px]">
                  <BookOpen className="size-3.5" />
                  {list.name}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" className="ghost-filter size-7 opacity-30 hover:opacity-100">
                      <MoreVertical className="size-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleDeleteList(list.id)} className="gap-2 text-destructive focus:text-destructive">
                      <Trash2 className="size-4" />
                      Excluir lista
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}

            <Button variant="ghost" size="icon-sm" onClick={() => { setNewFolderName(""); setIsFolderDialogOpen(true) }} title="Nova pasta" className="ghost-filter size-7 opacity-40 hover:opacity-100">
              <FolderPlus className="size-3.5" />
            </Button>
          </div>

          {expandedFolderId && (
            <div className="mt-2 overflow-x-auto rounded-xl border border-border/30 bg-muted/20 px-3 py-2">
              <div className="flex items-center gap-1.5">
                {lists.filter((l) => l.folderId === expandedFolderId).length === 0 ? (
                  <p className="text-[12px] text-muted-foreground/50">Pasta vazia - salve uma lista aqui.</p>
                ) : (
                  lists.filter((l) => l.folderId === expandedFolderId).map((list) => (
                    <div key={list.id} className="flex shrink-0 items-center gap-0.5">
                      <button type="button" onClick={() => handleLoadList(list)} className={cn("rounded-full border px-3 py-1 text-[12px] transition-colors", activeListId === list.id ? "border-primary/40 bg-primary/10 text-primary" : "border-border/30 text-muted-foreground hover:border-border/60 hover:text-foreground")}>
                        {list.name}
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" className="size-5 opacity-30 hover:opacity-100">
                            <MoreVertical className="size-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleDeleteList(list.id)} className="gap-2 text-destructive focus:text-destructive">
                            <Trash2 className="size-4" />
                            Excluir lista
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={isFolderDialogOpen} onOpenChange={setIsFolderDialogOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Nova pasta</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            <Input placeholder="Nome da pasta..." value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreateFolderFromBar()} autoFocus />
            <Button onClick={handleCreateFolderFromBar} disabled={!newFolderName.trim()}>Criar pasta</Button>
          </div>
        </DialogContent>
      </Dialog>

      <p className="mt-4 text-center text-[11px] text-muted-foreground/50">
        Questoes respondidas sao armazenadas localmente - voce nunca vera a mesma questao duas vezes.
      </p>
    </div>
  )
}
