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
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <GraduationCap className="size-5" />
            </div>
            <span className="font-semibold text-lg hidden sm:inline-block">
              VocabLab
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="size-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </div>

        <SettingsDialog />
      </div>
    </header>
  )
}
