"use client"

import { useEffect, useMemo, useState } from "react"
import { BookOpen, Loader2, FolderPlus, Folder, FolderOpen, GraduationCap, TrendingUp, Target, Calendar, LayoutGrid, List, LayoutPanelTop, MoreVertical, Trash2, BookMarked, Pencil, Plus, BarChart2, X, Search } from "lucide-react"
import { useFlashcardsDB } from "@/hooks/use-flashcards-db"
import { useGrammarProgress } from "@/hooks/use-grammar-progress"
import { useGptModel } from "@/hooks/use-gpt-model"
import { useAiPreferences } from "@/hooks/use-ai-preferences"
import { AddFlashcardForm } from "./add-flashcard-form"
import { FlashcardCard } from "./flashcard-card"
import { StudyMode } from "./study-mode"
import { WritingMode } from "./writing-mode"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import type { Flashcard } from "@/lib/types"
import type { FlashcardAIResponse } from "@/lib/openai"

const AI_SETTINGS_HINT_SEEN_KEY = "vocablab_ai_settings_hint_seen"

function normalizeForSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
}

export function FlashcardsPage() {
  const { 
    flashcards, 
    folders,
    reviewFlashcards,
    selectedFolderId,
    setSelectedFolderId,
    isLoading, 
    addFlashcard, 
    deleteFlashcard,
    updateFlashcard,
    addFolder,
    deleteFolder,
    addToReviewFolder,
    removeFromReviewFolder,
  } = useFlashcardsDB()
  
  const { getStudyStats, isLoaded: isProgressLoaded } = useGrammarProgress()
  const studyStats = getStudyStats()
  const { model } = useGptModel()
  const {
    synonymsLevel,
    includeConjugations,
    includeAlternativeForms,
    includeUsageNote,
    efommMode,
  } = useAiPreferences()

  const [newFolderName, setNewFolderName] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [isStudying, setIsStudying] = useState(false)
  const [isWritingMode, setIsWritingMode] = useState(false)
  const [writingModeCards, setWritingModeCards] = useState<Flashcard[]>([])
  const [isReviewStudy, setIsReviewStudy] = useState(false)
  const [isReviewFolderSelected, setIsReviewFolderSelected] = useState(false)
  const [showReviewStudySelector, setShowReviewStudySelector] = useState(false)
  const [studyCards, setStudyCards] = useState<Flashcard[] | null>(null)
  const [layout, setLayout] = useState<"grid" | "list" | "compact">("grid")
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isStatsOpen, setIsStatsOpen] = useState(false)
  const [showAiSettingsHint, setShowAiSettingsHint] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    const seen = localStorage.getItem(AI_SETTINGS_HINT_SEEN_KEY)
    if (!seen) {
      setShowAiSettingsHint(true)
    }
  }, [])

  const dismissAiSettingsHint = () => {
    localStorage.setItem(AI_SETTINGS_HINT_SEEN_KEY, "true")
    setShowAiSettingsHint(false)
  }

  useEffect(() => {
    if (isReviewFolderSelected && reviewFlashcards.length === 0) {
      setIsWritingMode(false)
      setIsReviewFolderSelected(false)
      setIsReviewStudy(false)
      setStudyCards(null)
      setWritingModeCards([])
    }
  }, [isReviewFolderSelected, reviewFlashcards.length])

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    setIsCreatingFolder(true)
    await addFolder(newFolderName)
    setNewFolderName("")
    setIsDialogOpen(false)
    setIsCreatingFolder(false)
  }

  const selectedFolder = folders.find(f => f.id === selectedFolderId)
  const studyFolderName = isReviewFolderSelected ? "Revisão" : (selectedFolder?.name ?? "Todas as palavras")
  const effectiveStudyCards = studyCards ?? flashcards
  const displayedFlashcards = isReviewFolderSelected ? reviewFlashcards : flashcards
  const visibleReviewWords = studyStats.wordsToReview

  const normalizedSearch = useMemo(
    () => normalizeForSearch(searchQuery.trim()),
    [searchQuery]
  )

  const filteredFlashcards = useMemo(() => {
    if (!normalizedSearch) return displayedFlashcards

    return displayedFlashcards.filter((flashcard) => {
      const haystack = [
        flashcard.word,
        flashcard.translation,
        flashcard.usageNote,
        flashcard.example,
        ...(flashcard.alternativeForms || []).flatMap((form) => [form.word, form.translation]),
      ]
        .filter(Boolean)
        .join(" ")
      
      const normalizedHaystack = normalizeForSearch(haystack)

      return normalizedHaystack.includes(normalizedSearch)
    })
  }, [displayedFlashcards, normalizedSearch])

  const createCardFromAlternative = async (base: Flashcard, form: Flashcard["alternativeForms"][number]) => {
    const inputWord = form.word || base.word
    const targetPartOfSpeech = form.partOfSpeech

    const t = toast({
      title: "Gerando novo card…",
      description: `${inputWord} (${targetPartOfSpeech})`,
    })

    try {
      const res = await fetch("/api/ai/flashcard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: inputWord,
          model,
          options: { synonymsLevel, includeConjugations, includeAlternativeForms, includeUsageNote, efommMode, targetPartOfSpeech },
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error || "Erro ao gerar card")
      }
      const data: FlashcardAIResponse = await res.json()

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

      const success = await addFlashcard(flashcard)
      if (!success) {
        t.update({
          id: t.id,
          title: "Já existe",
          description: "Esse card já existe (mesma palavra e categoria).",
          variant: "destructive",
        })
        return
      }

      t.update({
        id: t.id,
        title: "Card criado",
        description: `${flashcard.word} (${flashcard.partOfSpeech})`,
      })
    } catch (err) {
      t.update({
        id: t.id,
        title: "Erro ao gerar card",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      })
    }
  }

  const handleAddWord = async (flashcard: Flashcard): Promise<boolean> => {
    const ok = await addFlashcard(flashcard)
    if (ok) setIsAddOpen(false)
    return ok
  }

  if (isWritingMode) {
    return (
      <WritingMode
        flashcards={writingModeCards}
        onRemoveFromReview={removeFromReviewFolder}
        onExit={() => {
          setIsWritingMode(false)
          setWritingModeCards([])
          setIsReviewStudy(false)
        }}
      />
    )
  }

  if (isStudying && effectiveStudyCards.length > 0) {
    return (
      <StudyMode
        flashcards={effectiveStudyCards}
        folderName={isReviewStudy ? "Revisão" : studyFolderName}
        onMarkForReview={isReviewStudy ? undefined : addToReviewFolder}
        onExit={() => {
          setIsStudying(false)
          setStudyCards(null)
          setIsReviewStudy(false)
        }}
      />
    )
  }

  return (
    <div className="w-full">
      <Dialog open={showAiSettingsHint} onOpenChange={(open) => !open && dismissAiSettingsHint()}>
        <DialogContent className="max-w-[92vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Personalize sua IA</DialogTitle>
            <DialogDescription>
              Você pode ajustar o comportamento da IA do seu jeito em Configurações, incluindo contexto, outras formas, traduções e modo EFOMM.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button onClick={dismissAiSettingsHint}>Entendi</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Hero Section ─────────────────────────────────────── */}
      <div className="mb-8 flex flex-col items-center gap-4 pt-2 sm:mb-10 sm:gap-5 sm:pt-4">

        {/* Brand watermark title */}
        <h1 className="select-none text-[clamp(2.2rem,11vw,3.25rem)] font-light leading-none tracking-[-0.04em] text-foreground/20">
          VocabLab
        </h1>

        {/* Add-word toggle / input area */}
        <div className="w-full max-w-lg">
          {!isAddOpen ? (
            <button
              type="button"
              onClick={() => setIsAddOpen(true)}
              className="group mx-auto flex items-center gap-2 rounded-full border border-border/60 bg-transparent px-5 py-2 text-[13px] text-muted-foreground/70 transition-all duration-200 hover:border-border hover:bg-muted/20 hover:text-muted-foreground w-full justify-center"
            >
              <Plus className="size-3.5 stroke-[1.5]" />
              Adicionar nova palavra
            </button>
          ) : (
            <div className="animate-slide-down rounded-2xl border border-border/40 bg-card px-4 py-3 shadow-sm">
              <AddFlashcardForm onAdd={handleAddWord} bare />
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="mt-2 flex w-full items-center justify-center gap-1 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                <X className="size-3" />
                fechar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Control Bar */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">

        {/* Left: folder segmented pill */}
        <div className="flex min-h-9 min-w-0 flex-1 items-center">
        <div className="segmented-control no-scrollbar min-w-0 flex-1 overflow-x-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSelectedFolderId(null); setIsReviewFolderSelected(false) }}
            data-active={!isReviewFolderSelected && selectedFolderId === null}
            className="ghost-filter h-8 gap-1.5 px-3 text-[13px]"
          >
            <FolderOpen className="size-3.5" />
            Todas
          </Button>

          {reviewFlashcards.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setIsReviewFolderSelected(true); setSelectedFolderId(null) }}
              data-active={isReviewFolderSelected}
              className="ghost-filter h-8 gap-1.5 px-3 text-[13px]"
            >
              <BookMarked className="size-3.5" />
              Revisão
              <Badge variant="secondary" className="ml-0.5 border-0 bg-muted px-1.5 py-0 text-[10px] font-medium text-muted-foreground shadow-none">
                {reviewFlashcards.length}
              </Badge>
            </Button>
          )}

          {folders.map((folder) => (
            <div key={folder.id} className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSelectedFolderId(folder.id); setIsReviewFolderSelected(false) }}
                data-active={!isReviewFolderSelected && selectedFolderId === folder.id}
                className="ghost-filter h-8 gap-1.5 px-3 text-[13px]"
              >
                <Folder className="size-3.5" />
                {folder.name}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="ghost-filter size-7 opacity-40 hover:opacity-100"
                  >
                    <MoreVertical className="size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem
                        onSelect={(e) => e.preventDefault()}
                        className="text-destructive focus:text-destructive gap-2"
                      >
                        <Trash2 className="size-4" />
                        Excluir Pasta
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Pasta?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Isso excluirá permanentemente a pasta &ldquo;{folder.name}&rdquo;.
                          Os flashcards dentro dela não serão excluídos, mas ficarão sem pasta.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive hover:bg-destructive/90"
                          onClick={() => deleteFolder(folder.id)}
                        >
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}

          {/* Nova Pasta icon — end of pill */}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon-sm" title="Nova Pasta" className="ghost-filter ml-1 size-7 opacity-60 hover:opacity-100">
                <FolderPlus className="size-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Nova Pasta</DialogTitle>
                <DialogDescription>Organize seus flashcards em pastas por tema ou nível.</DialogDescription>
              </DialogHeader>
              <div className="flex gap-2 mt-4">
                <Input
                  placeholder="Nome da pasta"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder() }}
                />
                <Button onClick={handleCreateFolder} disabled={isCreatingFolder || !newFolderName.trim()}>
                  {isCreatingFolder ? <Loader2 className="size-4 animate-spin" /> : "Criar"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        </div>

        {/* Right: action cluster */}
        <div className="flex min-h-9 w-full shrink-0 items-center justify-end gap-1.5 md:w-auto">
          <Button
            variant="ghost"
            size="icon-sm"
            title="Ver Progresso"
            onClick={() => setIsStatsOpen(true)}
            className="ghost-filter size-8 self-center"
          >
            <BarChart2 className="size-3.5" />
          </Button>

          {!isLoading && displayedFlashcards.length > 0 && (
            isReviewFolderSelected ? (
              <Dialog open={showReviewStudySelector} onOpenChange={setShowReviewStudySelector}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-full px-3 text-[13px]">
                    <GraduationCap className="size-3.5" />
                    Estudar revisão
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-[92vw] sm:max-w-sm">
                  <DialogHeader>
                    <DialogTitle>Escolha o modo de estudo</DialogTitle>
                    <DialogDescription>Como você quer revisar suas {reviewFlashcards.length} palavras pendentes?</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-3 pt-2">
                    <Button
                      variant="outline"
                      className="h-20 flex-col gap-2 text-left items-start px-5"
                      onClick={() => {
                        setShowReviewStudySelector(false)
                        setStudyCards(reviewFlashcards)
                        setIsReviewStudy(true)
                        setIsStudying(true)
                      }}
                    >
                      <div className="flex items-center gap-2 font-semibold">
                        <BookOpen className="size-4 text-primary" />
                        Flashcards
                      </div>
                      <p className="text-xs text-muted-foreground font-normal">Modo clássico com flip de cartão</p>
                    </Button>
                    <Button
                      variant="outline"
                      className="h-20 flex-col gap-2 text-left items-start px-5"
                      onClick={() => {
                        setShowReviewStudySelector(false)
                        setIsReviewStudy(true)
                        setWritingModeCards([...reviewFlashcards])
                        setIsWritingMode(true)
                      }}
                    >
                      <div className="flex items-center gap-2 font-semibold">
                        <Pencil className="size-4 text-primary" />
                        Escrita Obrigatória
                      </div>
                      <p className="text-xs text-muted-foreground font-normal">Digite o termo correto em inglês para avançar</p>
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsStudying(true)}
                className="h-8 gap-1.5 rounded-full px-3 text-[13px]"
              >
                <GraduationCap className="size-3.5" />
                Estudar{selectedFolder ? ` "${selectedFolder.name}"` : " tudo"}
              </Button>
            )
          )}
        </div>
      </div>

      {/* ── Stats Sheet ──────────────────────────────────────── */}
      <Sheet open={isStatsOpen} onOpenChange={setIsStatsOpen}>
        <SheetContent side="right" className="w-[88vw] max-w-sm p-0 sm:w-80">
          <SheetHeader className="border-b border-border/50 px-5 pb-4 pt-5">
            <SheetTitle className="flex items-center gap-2 text-[15px]">
              <BarChart2 className="size-4 text-primary" />
              Progresso de Estudo
            </SheetTitle>
          </SheetHeader>
          <div className="p-5">
            {isProgressLoaded && studyStats.totalSessions > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: Calendar, label: "Sessões", value: studyStats.totalSessions, tone: "text-primary/70" },
                  { icon: GraduationCap, label: "Cards estudados", value: studyStats.totalCards, tone: "text-primary/70" },
                  { icon: Target, label: "Acertos na 1ª", value: studyStats.totalCorrectFirstTry, tone: "text-success/70" },
                  { icon: TrendingUp, label: "Precisão", value: `${studyStats.averageAccuracy}%`, tone: "text-primary/70" },
                ].map((stat) => (
                  <div key={stat.label} className="stat-bento min-h-[112px] flex-col items-start justify-between gap-3 px-4 py-3">
                    <div className="flex size-7 items-center justify-center rounded-md bg-primary/10">
                      <stat.icon className={cn("size-3.5", stat.tone)} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-2xl font-bold leading-none tracking-[-0.03em] tabular-nums">{stat.value}</p>
                      <p className="text-[10px] uppercase tracking-[0.07em] text-muted-foreground">{stat.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
                  <BarChart2 className="size-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">Nenhuma sessão registrada ainda. Estude alguns flashcards para ver seu progresso aqui.</p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Cards ────────────────────────────────────────────── */}
      <div className="mt-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : displayedFlashcards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <BookOpen className="size-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg text-foreground mb-1">
              {isReviewFolderSelected
                ? "Nenhuma palavra para revisar"
                : selectedFolderId
                ? "Nenhum flashcard nesta pasta"
                : "Nenhum flashcard ainda"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {isReviewFolderSelected
                ? "Ótimo! Você não tem palavras pendentes de revisão."
                : selectedFolderId
                ? 'Clique em "+ Nova Palavra" para adicionar sua primeira palavra nesta pasta.'
                : 'Clique em "+ Nova Palavra" para começar a construir seu vocabulário.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className={cn(
                "flex min-w-0 items-center gap-2 rounded-full border border-border/50 bg-background/80 px-3 py-2 shadow-sm dark:bg-white/5 dark:border-white/8",
                layout === "list" && "w-full",
                layout === "grid" && "w-full sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-2rem)/3)]",
                layout === "compact" && "w-full sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-2rem)/4)] xl:w-[calc((100%-4rem)/5)]"
              )}>
                <Search className="size-4 shrink-0 text-muted-foreground/60" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por palavra"
                  className="h-auto border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0"
                />
                {searchQuery && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-6 shrink-0 rounded-full"
                    onClick={() => setSearchQuery("")}
                    title="Limpar busca"
                  >
                    <X className="size-3" />
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:gap-3 sm:justify-end">
                <p className="text-[12px] text-muted-foreground/70">
                {filteredFlashcards.length}{" "}
                {filteredFlashcards.length === 1 ? "palavra" : "palavras"}
                {isReviewFolderSelected
                  ? " para revisar"
                  : selectedFolder
                  ? ` em "${selectedFolder.name}"`
                  : " no vocabulário"}
                </p>
                <div className="flex items-center rounded-lg bg-muted/30 p-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  data-active={layout === "grid"}
                  className="ghost-filter size-7"
                  onClick={() => setLayout("grid")}
                  title="Cards"
                >
                  <LayoutGrid className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  data-active={layout === "list"}
                  className="ghost-filter size-7"
                  onClick={() => setLayout("list")}
                  title="Lista"
                >
                  <List className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  data-active={layout === "compact"}
                  className="ghost-filter size-7"
                  onClick={() => setLayout("compact")}
                  title="Compacto"
                >
                  <LayoutPanelTop className="size-3.5" />
                </Button>
              </div>
              </div>
            </div>

            {normalizedSearch && filteredFlashcards.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 px-6 py-12 text-center">
                <Search className="mb-3 size-8 text-muted-foreground/50" />
                <h3 className="text-base font-medium text-foreground">Nenhum card encontrado</h3>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Tente buscar pela palavra em inglês, por uma tradução em português ou por outro termo relacionado.
                </p>
              </div>
            ) : (
              <>
                {/* key={layout} resets card flip state on layout change */}
                <div key={layout} className={cn(
                  "grid gap-4",
                  layout === "grid" && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
                  layout === "list" && "grid-cols-1",
                  layout === "compact" && "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                )}>
                  {filteredFlashcards.map((flashcard) => (
                    <FlashcardCard
                      key={flashcard.id}
                      flashcard={flashcard}
                      onDelete={deleteFlashcard}
                      onCreateFromAlternative={createCardFromAlternative}
                      onUpdateFlashcard={updateFlashcard}
                      layout={layout}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

