"use client"

import { useState } from "react"
import { BookOpen, Loader2, FolderPlus, Folder, FolderOpen, X, GraduationCap, TrendingUp, Target, Calendar, AlertTriangle, LayoutGrid, List, LayoutPanelTop, MoreVertical, Trash2 } from "lucide-react"
import { useFlashcardsDB } from "@/hooks/use-flashcards-db"
import { useGrammarProgress } from "@/hooks/use-grammar-progress"
import { AddFlashcardForm } from "./add-flashcard-form"
import { FlashcardCard } from "./flashcard-card"
import { StudyMode } from "./study-mode"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
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

export function FlashcardsPage() {
  const { 
    flashcards, 
    folders,
    selectedFolderId,
    setSelectedFolderId,
    isLoading, 
    addFlashcard, 
    deleteFlashcard,
    addFolder,
    deleteFolder,
  } = useFlashcardsDB()
  
  const { getStudyStats, isLoaded: isProgressLoaded } = useGrammarProgress()
  const studyStats = getStudyStats()

  const [newFolderName, setNewFolderName] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [isStudying, setIsStudying] = useState(false)
  const [layout, setLayout] = useState<"grid" | "list" | "compact">("grid")

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    setIsCreatingFolder(true)
    await addFolder(newFolderName)
    setNewFolderName("")
    setIsDialogOpen(false)
    setIsCreatingFolder(false)
  }

  const selectedFolder = folders.find(f => f.id === selectedFolderId)
  const studyFolderName = selectedFolder?.name ?? "Todas as palavras"

  if (isStudying && flashcards.length > 0) {
    return (
      <StudyMode
        flashcards={flashcards}
        folderName={studyFolderName}
        onExit={() => setIsStudying(false)}
      />
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Flashcards Dinâmicos
        </h1>
        <p className="text-muted-foreground">
          Adicione palavras em inglês e deixe a IA preencher automaticamente as
          informações.
        </p>
      </div>

      {/* Study Progress Stats */}
      {isProgressLoaded && studyStats.totalSessions > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Calendar className="size-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{studyStats.totalSessions}</p>
                  <p className="text-xs text-muted-foreground">Sessões</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <GraduationCap className="size-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{studyStats.totalCards}</p>
                  <p className="text-xs text-muted-foreground">Cards estudados</p>
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
                  <p className="text-2xl font-bold">{studyStats.totalCorrectFirstTry}</p>
                  <p className="text-xs text-muted-foreground">Acertos por tentativa</p>
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
                  <p className="text-2xl font-bold">{studyStats.averageAccuracy}%</p>
                  <p className="text-xs text-muted-foreground">Precisão</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Words to review */}
      {isProgressLoaded && studyStats.wordsToReview.length > 0 && (
        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <AlertTriangle className="size-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground mb-2">
                  Palavras para revisar
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {studyStats.wordsToReview.slice(0, 10).map((word, idx) => (
                    <Badge key={idx} variant="secondary" className="bg-amber-500/10 text-amber-700 dark:text-amber-300">
                      {word}
                    </Badge>
                  ))}
                  {studyStats.wordsToReview.length > 10 && (
                    <Badge variant="secondary" className="bg-muted">
                      +{studyStats.wordsToReview.length - 10} mais
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Folders Section */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={selectedFolderId === null ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedFolderId(null)}
          className="gap-2"
        >
          <FolderOpen className="size-4" />
          Todas
        </Button>

        {folders.map((folder) => (
          <div key={folder.id} className="relative group flex items-center -space-x-[1px]">
            <Button
              variant={selectedFolderId === folder.id ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedFolderId(folder.id)}
              className={cn(
                "gap-2 rounded-r-none border-r-0",
                selectedFolderId === folder.id ? "z-10" : ""
              )}
            >
              <Folder className="size-4" />
              {folder.name}
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={selectedFolderId === folder.id ? "default" : "outline"}
                  size="icon-sm"
                  className={cn(
                    "rounded-l-none",
                    selectedFolderId === folder.id ? "z-10" : ""
                  )}
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

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <FolderPlus className="size-4" />
              Nova Pasta
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Nova Pasta</DialogTitle>
              <DialogDescription>
                Organize seus flashcards em pastas por tema ou nível.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2 mt-4">
              <Input
                placeholder="Nome da pasta"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateFolder()
                  }
                }}
              />
              <Button onClick={handleCreateFolder} disabled={isCreatingFolder || !newFolderName.trim()}>
                {isCreatingFolder ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Criar"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Current folder indicator */}
      {selectedFolder && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-2">
          <Folder className="size-4" />
          <span>Adicionando flashcards em:</span>
          <span className="font-medium text-foreground">{selectedFolder.name}</span>
        </div>
      )}

      <AddFlashcardForm onAdd={addFlashcard} />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : flashcards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <BookOpen className="size-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg text-foreground mb-1">
            {selectedFolderId ? "Nenhum flashcard nesta pasta" : "Nenhum flashcard ainda"}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            {selectedFolderId 
              ? "Adicione sua primeira palavra nesta pasta usando o campo acima."
              : "Comece adicionando sua primeira palavra em inglês no campo acima."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <p className="text-sm text-muted-foreground">
                {flashcards.length}{" "}
                {flashcards.length === 1 ? "palavra" : "palavras"}
                {selectedFolder ? ` em "${selectedFolder.name}"` : " no vocabulário"}
              </p>
              
              <div className="flex items-center bg-muted rounded-lg p-1">
                <Button
                  variant={layout === "grid" ? "secondary" : "ghost"}
                  size="icon"
                  className="size-8"
                  onClick={() => setLayout("grid")}
                  title="Cards"
                >
                  <LayoutGrid className="size-4" />
                </Button>
                <Button
                  variant={layout === "list" ? "secondary" : "ghost"}
                  size="icon"
                  className="size-8"
                  onClick={() => setLayout("list")}
                  title="Lista"
                >
                  <List className="size-4" />
                </Button>
                <Button
                  variant={layout === "compact" ? "secondary" : "ghost"}
                  size="icon"
                  className="size-8"
                  onClick={() => setLayout("compact")}
                  title="Compacto"
                >
                  <LayoutPanelTop className="size-4" />
                </Button>
              </div>
            </div>

            <Button
              onClick={() => setIsStudying(true)}
              className="gap-2"
              size="sm"
            >
              <GraduationCap className="size-4" />
              Estudar{selectedFolder ? ` "${selectedFolder.name}"` : " tudo"}
            </Button>
          </div>

          <div className={cn(
            "grid gap-4",
            layout === "grid" && "sm:grid-cols-2 lg:grid-cols-3",
            layout === "list" && "grid-cols-1",
            layout === "compact" && "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          )}>
            {flashcards.map((flashcard) => (
              <FlashcardCard
                key={flashcard.id}
                flashcard={flashcard}
                onDelete={deleteFlashcard}
                layout={layout}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
