"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BookOpen, FlaskConical, GraduationCap } from "lucide-react"
import { cn } from "@/lib/utils"
import { SettingsDialog } from "./settings-dialog"

const navItems = [
  {
    label: "Flashcards",
    href: "/",
    icon: BookOpen,
  },
  {
    label: "Grammar Lab",
    href: "/grammar",
    icon: FlaskConical,
  },
]

export function Header() {
  const pathname = usePathname()

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-2.5 sm:px-6 sm:pt-3">
      <div className="glass-nav mx-auto flex h-[50px] w-full max-w-[1150px] items-center justify-between rounded-2xl px-3 sm:h-[52px] sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-8">
          <Link href="/" className="flex shrink-0 items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/90 text-primary-foreground shadow-sm">
              <GraduationCap className="size-5" />
            </div>
            <span className="hidden text-lg font-semibold tracking-[-0.03em] sm:inline-block">
              VocabLab
            </span>
          </Link>

          <nav className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto rounded-lg bg-muted/40 p-1 dark:bg-zinc-800/30">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium tracking-[-0.01em] transition-all sm:px-3.5 sm:text-[14px]",
                    isActive
                      ? "bg-primary/15 text-primary font-semibold dark:bg-primary/20 dark:text-primary"
                      : "text-muted-foreground hover:bg-background/50 hover:text-foreground dark:hover:bg-zinc-700/40 dark:hover:text-zinc-100"
                  )}
                >
                  <item.icon className="size-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="flex items-center">
          <SettingsDialog />
        </div>
      </div>
    </header>
  )
}
