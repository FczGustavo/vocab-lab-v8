"use client"

import { useState } from "react"
import { Settings, Eye, EyeOff, Key, Check, Trash2, RotateCcw, BarChart3 } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { useApiKey } from "@/hooks/use-api-key"
import { useGrammarProgress } from "@/hooks/use-grammar-progress"

export function SettingsDialog() {
  const { apiKey, setApiKey, clearApiKey, hasApiKey } = useApiKey()
  const { resetStats } = useGrammarProgress()
  const [inputValue, setInputValue] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    if (inputValue.trim()) {
      setApiKey(inputValue.trim())
      setInputValue("")
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  const handleClear = () => {
    clearApiKey()
    setInputValue("")
  }

  const maskedKey = apiKey ? `sk-...${apiKey.slice(-8)}` : ""

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Settings className="size-5" />
          {!hasApiKey && (
            <span className="absolute -top-1 -right-1 size-2 rounded-full bg-destructive" />
          )}
          <span className="sr-only">Configurações</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="size-5 text-primary" />
            Configurações
          </DialogTitle>
          <DialogDescription>
            Configure sua chave de API da OpenAI para usar as funcionalidades de
            IA.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {hasApiKey ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3">
                <Key className="size-4 text-muted-foreground" />
                <span className="flex-1 font-mono text-sm">
                  {showKey ? apiKey : maskedKey}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </Button>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleClear}
                >
                  <Trash2 className="size-4 mr-2" />
                  Remover chave
                </Button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Sua chave está salva localmente no navegador.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  type={showKey ? "text" : "password"}
                  placeholder="sk-..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  className="flex-1 font-mono"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </Button>
              </div>
              <Button
                className="w-full"
                onClick={handleSave}
                disabled={!inputValue.trim() || saved}
              >
                {saved ? (
                  <>
                    <Check className="size-4 mr-2" />
                    Salvo!
                  </>
                ) : (
                  <>
                    <Key className="size-4 mr-2" />
                    Salvar chave
                  </>
                )}
              </Button>
            </div>
          )}

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
      </DialogContent>
    </Dialog>
  )
}
