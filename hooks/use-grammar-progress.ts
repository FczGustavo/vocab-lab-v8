"use client"

import { useState, useEffect, useCallback } from "react"

export interface GrammarSession {
  id: string
  date: number
  totalExercises: number
  correctAnswers: number
  exerciseType: "fill-blank" | "verb-conjugation" | "mixed"
  wordsUsed: string[]
}

export interface StudySession {
  id: string
  date: number
  folderName: string
  totalCards: number
  correctFirstTry: number
  wordsToReview: string[]
}

const GRAMMAR_PROGRESS_KEY = "vocablab-grammar-progress"
const STUDY_PROGRESS_KEY = "vocablab-study-progress"

export function useGrammarProgress() {
  const [grammarSessions, setGrammarSessions] = useState<GrammarSession[]>([])
  const [studySessions, setStudySessions] = useState<StudySession[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const grammarData = localStorage.getItem(GRAMMAR_PROGRESS_KEY)
        if (grammarData) {
          setGrammarSessions(JSON.parse(grammarData))
        }

        const studyData = localStorage.getItem(STUDY_PROGRESS_KEY)
        if (studyData) {
          setStudySessions(JSON.parse(studyData))
        }
      } catch (error) {
        console.error("Error loading progress:", error)
      }
      setIsLoaded(true)
    }
  }, [])

  // Save grammar sessions
  const saveGrammarSession = useCallback((session: Omit<GrammarSession, "id" | "date">) => {
    const newSession: GrammarSession = {
      ...session,
      id: crypto.randomUUID(),
      date: Date.now(),
    }

    setGrammarSessions((prev) => {
      const updated = [newSession, ...prev].slice(0, 50) // Keep last 50 sessions
      localStorage.setItem(GRAMMAR_PROGRESS_KEY, JSON.stringify(updated))
      return updated
    })

    return newSession
  }, [])

  // Save study sessions
  const saveStudySession = useCallback((session: Omit<StudySession, "id" | "date">) => {
    const newSession: StudySession = {
      ...session,
      id: crypto.randomUUID(),
      date: Date.now(),
    }

    setStudySessions((prev) => {
      const updated = [newSession, ...prev].slice(0, 50) // Keep last 50 sessions
      localStorage.setItem(STUDY_PROGRESS_KEY, JSON.stringify(updated))
      return updated
    })

    return newSession
  }, [])

  // Reset all statistics
  const resetStats = useCallback(() => {
    setGrammarSessions([])
    setStudySessions([])
    localStorage.removeItem(GRAMMAR_PROGRESS_KEY)
    localStorage.removeItem(STUDY_PROGRESS_KEY)
  }, [])

  // Get statistics
  const getGrammarStats = useCallback(() => {
    if (grammarSessions.length === 0) {
      return {
        totalSessions: 0,
        totalExercises: 0,
        totalCorrect: 0,
        averageAccuracy: 0,
        lastSession: null,
      }
    }

    const totalExercises = grammarSessions.reduce((sum, s) => sum + s.totalExercises, 0)
    const totalCorrect = grammarSessions.reduce((sum, s) => sum + s.correctAnswers, 0)

    return {
      totalSessions: grammarSessions.length,
      totalExercises,
      totalCorrect,
      averageAccuracy: totalExercises > 0 ? Math.round((totalCorrect / totalExercises) * 100) : 0,
      lastSession: grammarSessions[0] || null,
    }
  }, [grammarSessions])

  const getStudyStats = useCallback(() => {
    if (studySessions.length === 0) {
      return {
        totalSessions: 0,
        totalCards: 0,
        totalCorrectFirstTry: 0,
        averageAccuracy: 0,
        lastSession: null,
        wordsToReview: [],
      }
    }

    const totalCards = studySessions.reduce((sum, s) => sum + s.totalCards, 0)
    const totalCorrectFirstTry = studySessions.reduce((sum, s) => sum + s.correctFirstTry, 0)
    
    // Get unique words that need review from last 5 sessions
    const recentWords = studySessions
      .slice(0, 5)
      .flatMap((s) => s.wordsToReview)
    const wordsToReview = [...new Set(recentWords)]

    return {
      totalSessions: studySessions.length,
      totalCards,
      totalCorrectFirstTry,
      averageAccuracy: totalCards > 0 ? Math.round((totalCorrectFirstTry / totalCards) * 100) : 0,
      lastSession: studySessions[0] || null,
      wordsToReview,
    }
  }, [studySessions])

  // Clear all progress
  const clearProgress = useCallback(() => {
    localStorage.removeItem(GRAMMAR_PROGRESS_KEY)
    localStorage.removeItem(STUDY_PROGRESS_KEY)
    setGrammarSessions([])
    setStudySessions([])
  }, [])

  return {
    grammarSessions,
    studySessions,
    isLoaded,
    saveGrammarSession,
    saveStudySession,
    resetStats,
    getGrammarStats,
    getStudyStats,
    clearProgress,
  }
}
