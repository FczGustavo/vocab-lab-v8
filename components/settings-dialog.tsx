"use client"

import { useEffect, useMemo, useState } from "react"
import { Settings, RotateCcw, BarChart3, Sun, Moon, Laptop, Sparkles, CloudUpload, CloudDownload, RefreshCcw, Loader2 } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
import { Input } from "@/components/ui/input"
import { useGrammarProgress } from "@/hooks/use-grammar-progress"
import { useAnimations } from "@/hooks/use-animations"
import { useAiPreferences } from "@/hooks/use-ai-preferences"
import { useSyncCode } from "@/hooks/use-sync-code"
import { useFlashcardsDB } from "@/hooks/use-flashcards-db"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

type ColorPalette = "blue" | "beige" | "violet"

const COLOR_PALETTE_KEY = "vocablab_color_palette"

export function SettingsDialog() {
  const { resetStats } = useGrammarProgress()
  const { theme, setTheme } = useTheme()
  const { enabled: animationsEnabled, setEnabled: setAnimationsEnabled } = useAnimations()
  const {
    synonymsLevel,
    setSynonymsLevel,
    includeConjugations,
    setIncludeConjugations,
    includeAlternativeForms,
    setIncludeAlternativeForms,
    includeUsageNote,
    setIncludeUsageNote,
    efommMode,
    setEfommMode,
  } = useAiPreferences()
  const { syncCode, setSyncCode, regenerate, isValid: isSyncCodeValid } = useSyncCode()
  const { allFlashcards, folders, importAllData } = useFlashcardsDB()
  const [palette, setPalette] = useState<ColorPalette>("blue")
  const [syncBusy, setSyncBusy] = useState<"push" | "pull" | null>(null)

  const syncCountText = useMemo(() => {
    const cards = allFlashcards.length
    const f = folders.length
    return `${cards} cards · ${f} pastas`
  }, [allFlashcards.length, folders.length])

  useEffect(() => {
    const savedPalette = localStorage.getItem(COLOR_PALETTE_KEY) as ColorPalette | null
    const initial = savedPalette === "beige" || savedPalette === "violet" || savedPalette === "blue" ? savedPalette : "blue"
    setPalette(initial)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove("palette-blue", "palette-beige", "palette-violet")
    root.classList.add(`palette-${palette}`)
    localStorage.setItem(COLOR_PALETTE_KEY, palette)
  }, [palette])

  const pushToCloud = async () => {
    if (!isSyncCodeValid) {
      toast({
        title: "Sync Code inválido",
        description: "Use uma palavra curta (2–40 caracteres).",
        variant: "destructive",
      })
      return
    }

    setSyncBusy("push")
    const t = toast({
      title: "Enviando para a nuvem…",
      description: syncCountText,
    })

    try {
      const payload = {
        version: 1,
        exportedAt: Date.now(),
        folders,
        flashcards: allFlashcards,
      }

      const res = await fetch("/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncCode, payload }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || "Falha ao enviar")

      t.update({
        id: t.id,
        title: "Sincronizado",
        description: "Seus dados foram salvos na nuvem.",
      })
    } catch (err) {
      t.update({
        id: t.id,
        title: "Erro ao sincronizar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setSyncBusy(null)
    }
  }

  const pullFromCloud = async () => {
    if (!isSyncCodeValid) {
      toast({
        title: "Sync Code inválido",
        description: "Use uma palavra curta (2–40 caracteres).",
        variant: "destructive",
      })
      return
    }

    setSyncBusy("pull")
    const t = toast({
      title: "Baixando da nuvem…",
      description: "Isso substitui seus dados locais.",
    })

    try {
      const res = await fetch("/api/sync/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncCode }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || "Falha ao baixar")

      if (!json?.payload) {
        t.update({
          id: t.id,
          title: "Nada para importar",
          description: "Não existe backup na nuvem para esse Sync Code.",
        })
        return
      }

      const ok = await importAllData({
        folders: Array.isArray(json.payload.folders) ? json.payload.folders : [],
        flashcards: Array.isArray(json.payload.flashcards) ? json.payload.flashcards : [],
      })

      if (!ok) throw new Error("Falha ao importar para o banco local")

      t.update({
        id: t.id,
        title: "Importado",
        description: "Seus dados da nuvem foram carregados.",
      })
    } catch (err) {
      t.update({
        id: t.id,
        title: "Erro ao importar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setSyncBusy(null)
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full hover:bg-background/70 hover:shadow-sm">
          <Settings className="size-5" />
          <span className="sr-only">Configurações</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[94vw] p-0 overflow-hidden sm:max-w-2xl">
          <DialogHeader className="p-5">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="size-5 text-primary" />
            Configurações
          </DialogTitle>
          <DialogDescription>
            Preferências do app. A chave de API é configurada via .env.local no servidor.
          </DialogDescription>
        </DialogHeader>
        <div className="border-t flex flex-col sm:flex-row">
          <div className="sm:w-44 border-b sm:border-b-0 sm:border-r p-2 bg-muted/30">
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 bg-background shadow-sm"
            >
              <Sparkles className="size-4 text-primary" />
              Conteúdo
            </Button>
          </div>

          <div className="flex-1 p-5 max-h-[70vh] overflow-y-auto">
            <div className="space-y-6">
              <div className="space-y-6">
                <div className="space-y-3">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Sun className="size-4 text-primary" />
                    Tema do Aplicativo
                  </h4>
                  <div className="grid grid-cols-1 gap-1 bg-muted p-1 sm:grid-cols-3 sm:gap-0 sm:rounded-lg">
                    <Button
                      variant={theme === "light" ? "secondary" : "ghost"}
                      size="sm"
                      className="flex-1 gap-2 h-8"
                      onClick={() => setTheme("light")}
                    >
                      <Sun className="size-3.5" />
                      Claro
                    </Button>
                    <Button
                      variant={theme === "dark" ? "secondary" : "ghost"}
                      size="sm"
                      className="flex-1 gap-2 h-8"
                      onClick={() => setTheme("dark")}
                    >
                      <Moon className="size-3.5" />
                      Escuro
                    </Button>
                    <Button
                      variant={theme === "system" ? "secondary" : "ghost"}
                      size="sm"
                      className="flex-1 gap-2 h-8"
                      onClick={() => setTheme("system")}
                    >
                      <Laptop className="size-3.5" />
                      Sistema
                    </Button>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Sparkles className="size-4 text-primary" />
                    Tema de Cores
                  </h4>
                  <div className="grid grid-cols-1 gap-1 bg-muted p-1 sm:grid-cols-3 sm:gap-0 sm:rounded-lg">
                    <Button
                      variant={palette === "blue" ? "secondary" : "ghost"}
                      size="sm"
                      className="flex-1 h-8"
                      onClick={() => setPalette("blue")}
                    >
                      Azul
                    </Button>
                    <Button
                      variant={palette === "beige" ? "secondary" : "ghost"}
                      size="sm"
                      className="flex-1 h-8"
                      onClick={() => setPalette("beige")}
                    >
                      Bege
                    </Button>
                    <Button
                      variant={palette === "violet" ? "secondary" : "ghost"}
                      size="sm"
                      className="flex-1 h-8"
                      onClick={() => setPalette("violet")}
                    >
                      Violeta
                    </Button>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Sparkles className="size-4 text-primary" />
                        Efeitos e Animações
                      </h4>
                      <p className="text-[10px] text-muted-foreground">
                        Ative ou desative as transições visuais dos cartões.
                      </p>
                    </div>
                    <Switch
                      checked={animationsEnabled}
                      onCheckedChange={setAnimationsEnabled}
                    />
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Sparkles className="size-4 text-primary" />
                    Conteúdo dos Cards
                  </h4>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Sinônimos e Antônimos</Label>
                      <span className="text-xs font-bold text-primary tabular-nums">
                        {synonymsLevel}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={3}
                      step={1}
                      value={synonymsLevel}
                      onChange={(e) => setSynonymsLevel(Number(e.target.value))}
                      className="w-full accent-primary"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      0 = não gerar nem mostrar. 1–3 = quantidade máxima por card (quando houver).
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="space-y-0.5">
                      <Label className="text-sm">Conjugações de verbos</Label>
                      <p className="text-[10px] text-muted-foreground">
                        Se desativado, a IA não gera tempos verbais para economizar tokens.
                      </p>
                    </div>
                    <Switch checked={includeConjugations} onCheckedChange={setIncludeConjugations} />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="space-y-0.5">
                      <Label className="text-sm">Outras formas</Label>
                      <p className="text-[10px] text-muted-foreground">
                        Se desativado, a IA não gera “Outras formas” (ex.: verbo e substantivo) para economizar tokens.
                      </p>
                    </div>
                    <Switch checked={includeAlternativeForms} onCheckedChange={setIncludeAlternativeForms} />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="space-y-0.5">
                      <Label className="text-sm">Contexto</Label>
                      <p className="text-[10px] text-muted-foreground">
                        Se desativado, a IA não gera a seção “Contexto” para economizar tokens.
                      </p>
                    </div>
                    <Switch checked={includeUsageNote} onCheckedChange={setIncludeUsageNote} />
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <div className="space-y-0.5">
                      <Label className="text-sm">Modo EFOMM (Marítimo)</Label>
                      <p className="text-[10px] text-muted-foreground">
                        Quando a palavra permitir, a IA prioriza significados e exemplos em contexto naval/porto/logística.
                      </p>
                    </div>
                    <Switch checked={efommMode} onCheckedChange={setEfommMode} />
                  </div>                </div>

                <div className="space-y-3 pt-4 border-t">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <RefreshCcw className="size-4 text-primary" />
                    Sincronização (Sync Code)
                  </h4>
                  <p className="text-[10px] text-muted-foreground">
                    Use uma palavra em português como código. Em outro navegador/celular, coloque o mesmo código e importe.
                  </p>

                  <div className="flex gap-2">
                    <Input
                      value={syncCode}
                      onChange={(e) => setSyncCode(e.target.value)}
                      placeholder="Ex: gustavo"
                      className="flex-1"
                      disabled={syncBusy !== null}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => regenerate()}
                      disabled={syncBusy !== null}
                    >
                      Gerar
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      className="flex-1"
                      onClick={pushToCloud}
                      disabled={syncBusy !== null || !isSyncCodeValid}
                    >
                      {syncBusy === "push" ? (
                        <>
                          <Loader2 className="size-4 mr-2 animate-spin" />
                          Enviando…
                        </>
                      ) : (
                        <>
                          <CloudUpload className="size-4 mr-2" />
                          Enviar
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={pullFromCloud}
                      disabled={syncBusy !== null || !isSyncCodeValid}
                    >
                      {syncBusy === "pull" ? (
                        <>
                          <Loader2 className="size-4 mr-2 animate-spin" />
                          Baixando…
                        </>
                      ) : (
                        <>
                          <CloudDownload className="size-4 mr-2" />
                          Importar
                        </>
                      )}
                    </Button>
                  </div>

                  <p className="text-[10px] text-muted-foreground">
                    Dados locais: {syncCountText}
                  </p>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <BarChart3 className="size-4 text-primary" />
                    Estatísticas de Estudo
                  </h4>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <RotateCcw className="size-4 mr-2" />
                        Resetar estatísticas
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Resetar estatísticas?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Isso apagará permanentemente todo o seu histórico de estudos e progresso. 
                          Seus flashcards e pastas **não** serão afetados.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive hover:bg-destructive/90"
                          onClick={resetStats}
                        >
                          Resetar agora
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <p className="text-[10px] text-muted-foreground mt-2 text-center">
                    Esta ação limpa o histórico de sessões e precisão de estudo.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
