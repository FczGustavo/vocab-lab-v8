"use client"

import { useState, useEffect, useCallback } from "react"
import type { Flashcard, Folder } from "@/lib/types"

const DB_NAME = "vocab-lab-db"
const DB_VERSION = 5
const FLASHCARDS_STORE = "flashcards"
const FOLDERS_STORE = "folders"
const FLASHCARDS_UPDATED_EVENT = "vocablab-flashcards-updated"

function notifyFlashcardsUpdated() {
  if (typeof window === "undefined") return
  window.setTimeout(() => {
    window.dispatchEvent(new Event(FLASHCARDS_UPDATED_EVENT))
  }, 0)
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      
      if (!db.objectStoreNames.contains(FLASHCARDS_STORE)) {
        const flashcardsStore = db.createObjectStore(FLASHCARDS_STORE, { keyPath: "id" })
        flashcardsStore.createIndex("word", "word", { unique: false })
        flashcardsStore.createIndex("word_pos", ["word", "partOfSpeech"], { unique: true })
        flashcardsStore.createIndex("createdAt", "createdAt", { unique: false })
        flashcardsStore.createIndex("folderId", "folderId", { unique: false })
      } else {
        const transaction = (event.target as IDBOpenDBRequest).transaction
        const flashcardsStore = transaction?.objectStore(FLASHCARDS_STORE)
        if (flashcardsStore) {
          const seen = new Map<string, { id: string; createdAt: number }>()
          const cursorRequest = flashcardsStore.openCursor()

          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result
            if (cursor) {
              const value = cursor.value as any
              const word = String(value.word ?? "").toLowerCase()
              const pos = String(value.partOfSpeech ?? "")
              const createdAt = typeof value.createdAt === "number" ? value.createdAt : 0
              const key = `${word}__${pos}`
              const prev = seen.get(key)

              if (!prev) {
                seen.set(key, { id: value.id, createdAt })
              } else {
                if (createdAt > prev.createdAt) {
                  flashcardsStore.delete(prev.id)
                  seen.set(key, { id: value.id, createdAt })
                } else {
                  flashcardsStore.delete(value.id)
                }
              }

              cursor.continue()
              return
            }

            if (flashcardsStore.indexNames.contains("word_pos")) {
              flashcardsStore.deleteIndex("word_pos")
            }
            if (flashcardsStore.indexNames.contains("word")) {
              flashcardsStore.deleteIndex("word")
            }

            flashcardsStore.createIndex("word", "word", { unique: false })
            flashcardsStore.createIndex("word_pos", ["word", "partOfSpeech"], { unique: true })

            if (!flashcardsStore.indexNames.contains("createdAt")) {
              flashcardsStore.createIndex("createdAt", "createdAt", { unique: false })
            }
            if (!flashcardsStore.indexNames.contains("folderId")) {
              flashcardsStore.createIndex("folderId", "folderId", { unique: false })
            }
          }
        }
      }
      
      if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
        const foldersStore = db.createObjectStore(FOLDERS_STORE, { keyPath: "id" })
        foldersStore.createIndex("name", "name", { unique: true })
        foldersStore.createIndex("createdAt", "createdAt", { unique: false })
      }
    }
  })
}

export function useFlashcardsDB() {
  const [flashcards, setFlashcards] = useState<Flashcard[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      const db = await openDatabase()
      
      // Load folders
      const foldersTransaction = db.transaction(FOLDERS_STORE, "readonly")
      const foldersStore = foldersTransaction.objectStore(FOLDERS_STORE)
      const foldersRequest = foldersStore.getAll()

      foldersRequest.onsuccess = () => {
        const loadedFolders = foldersRequest.result as Folder[]
        loadedFolders.sort((a, b) => a.name.localeCompare(b.name))
        setFolders(loadedFolders)
      }

      // Load flashcards
      const flashcardsTransaction = db.transaction(FLASHCARDS_STORE, "readonly")
      const flashcardsStore = flashcardsTransaction.objectStore(FLASHCARDS_STORE)
      const flashcardsRequest = flashcardsStore.getAll()

      flashcardsRequest.onsuccess = () => {
        const cards = flashcardsRequest.result as Flashcard[]
        cards.sort((a, b) => b.createdAt - a.createdAt)
        setFlashcards(cards)
        setIsLoading(false)
      }

      flashcardsRequest.onerror = () => {
        console.error("Error loading flashcards:", flashcardsRequest.error)
        setIsLoading(false)
      }
    } catch (error) {
      console.error("Error opening database:", error)
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    const onUpdated = () => loadData()
    window.addEventListener(FLASHCARDS_UPDATED_EVENT, onUpdated)
    return () => window.removeEventListener(FLASHCARDS_UPDATED_EVENT, onUpdated)
  }, [loadData])

  // Folder operations
  const addFolder = useCallback(async (name: string): Promise<Folder | null> => {
    try {
      const db = await openDatabase()
      const transaction = db.transaction(FOLDERS_STORE, "readwrite")
      const store = transaction.objectStore(FOLDERS_STORE)

      const folder: Folder = {
        id: crypto.randomUUID(),
        name: name.trim(),
        createdAt: Date.now(),
      }

      return new Promise((resolve) => {
        const request = store.add(folder)

        request.onsuccess = () => {
          setFolders((prev) => [...prev, folder].sort((a, b) => a.name.localeCompare(b.name)))
          notifyFlashcardsUpdated()
          resolve(folder)
        }

        request.onerror = () => {
          console.error("Error adding folder:", request.error)
          resolve(null)
        }
      })
    } catch (error) {
      console.error("Error adding folder:", error)
      return null
    }
  }, [])

  const deleteFolder = useCallback(async (id: string): Promise<boolean> => {
    try {
      const db = await openDatabase()
      
      // First, update all flashcards in this folder to have no folder
      const flashcardsTransaction = db.transaction(FLASHCARDS_STORE, "readwrite")
      const flashcardsStore = flashcardsTransaction.objectStore(FLASHCARDS_STORE)
      
      const cardsInFolder = flashcards.filter(f => f.folderId === id)
      for (const card of cardsInFolder) {
        const updatedCard = { ...card, folderId: null }
        flashcardsStore.put(updatedCard)
      }
      
      // Then delete the folder
      const foldersTransaction = db.transaction(FOLDERS_STORE, "readwrite")
      const foldersStore = foldersTransaction.objectStore(FOLDERS_STORE)

      return new Promise((resolve) => {
        const request = foldersStore.delete(id)

        request.onsuccess = () => {
          setFolders((prev) => prev.filter((f) => f.id !== id))
          setFlashcards((prev) => prev.map(card => 
            card.folderId === id ? { ...card, folderId: null } : card
          ))
          if (selectedFolderId === id) {
            setSelectedFolderId(null)
          }
          notifyFlashcardsUpdated()
          resolve(true)
        }

        request.onerror = () => {
          console.error("Error deleting folder:", request.error)
          resolve(false)
        }
      })
    } catch (error) {
      console.error("Error deleting folder:", error)
      return false
    }
  }, [flashcards, selectedFolderId])

  // Flashcard operations
  const addFlashcard = useCallback(
    async (flashcard: Flashcard): Promise<boolean> => {
      try {
        const db = await openDatabase()
        const transaction = db.transaction(FLASHCARDS_STORE, "readwrite")
        const store = transaction.objectStore(FLASHCARDS_STORE)

        const normalizedWord = String(flashcard.word ?? "").trim().toLowerCase()

        const flashcardWithFolder = {
          ...flashcard,
          word: normalizedWord,
          folderId: selectedFolderId,
        }

        return new Promise((resolve) => {
          const index = store.index("word_pos")
          const checkRequest = index.get([flashcardWithFolder.word, flashcardWithFolder.partOfSpeech])

          checkRequest.onsuccess = () => {
            if (checkRequest.result) {
              resolve(false)
              return
            }

            const request = store.add(flashcardWithFolder)

            request.onsuccess = () => {
              setFlashcards((prev) => [flashcardWithFolder, ...prev])
              notifyFlashcardsUpdated()
              resolve(true)
            }

            request.onerror = () => {
              resolve(false)
            }
          }

          checkRequest.onerror = () => resolve(false)
        })
      } catch (error) {
        console.error("Error adding flashcard:", error)
        return false
      }
    },
    [selectedFolderId]
  )

  const deleteFlashcard = useCallback(async (id: string): Promise<boolean> => {
    try {
      const db = await openDatabase()
      const transaction = db.transaction(FLASHCARDS_STORE, "readwrite")
      const store = transaction.objectStore(FLASHCARDS_STORE)

      return new Promise((resolve) => {
        const request = store.delete(id)

        request.onsuccess = () => {
          setFlashcards((prev) => prev.filter((card) => card.id !== id))
          notifyFlashcardsUpdated()
          resolve(true)
        }

        request.onerror = () => {
          console.error("Error deleting flashcard:", request.error)
          resolve(false)
        }
      })
    } catch (error) {
      console.error("Error deleting flashcard:", error)
      return false
    }
  }, [])

  const updateFlashcard = useCallback(async (flashcard: Flashcard): Promise<boolean> => {
    try {
      const db = await openDatabase()
      const transaction = db.transaction(FLASHCARDS_STORE, "readwrite")
      const store = transaction.objectStore(FLASHCARDS_STORE)

      const existingLocal = flashcards.find((c) => c.id === flashcard.id)
      const normalizedUpdate: Flashcard =
        existingLocal && flashcard.folderId === null && existingLocal.folderId !== null
          ? { ...flashcard, folderId: existingLocal.folderId }
          : flashcard

      return new Promise((resolve) => {
        const index = store.index("word_pos")
        const key = [normalizedUpdate.word, normalizedUpdate.partOfSpeech]
        const checkRequest = index.get(key)

        checkRequest.onsuccess = () => {
          const existing = checkRequest.result as Flashcard | undefined
          if (existing && existing.id !== normalizedUpdate.id) {
            resolve(false)
            return
          }

          const request = store.put(normalizedUpdate)

          request.onsuccess = () => {
            setFlashcards((prev) => prev.map((c) => (c.id === normalizedUpdate.id ? normalizedUpdate : c)))
            notifyFlashcardsUpdated()
            resolve(true)
          }

          request.onerror = () => resolve(false)
        }

        checkRequest.onerror = () => resolve(false)
      })
    } catch {
      return false
    }
  }, [flashcards])

  const moveFlashcardToFolder = useCallback(async (flashcardId: string, folderId: string | null): Promise<boolean> => {
    try {
      const db = await openDatabase()
      const transaction = db.transaction(FLASHCARDS_STORE, "readwrite")
      const store = transaction.objectStore(FLASHCARDS_STORE)

      const flashcard = flashcards.find(f => f.id === flashcardId)
      if (!flashcard) return false

      const updatedFlashcard = { ...flashcard, folderId }

      return new Promise((resolve) => {
        const request = store.put(updatedFlashcard)

        request.onsuccess = () => {
          setFlashcards((prev) => prev.map(card => 
            card.id === flashcardId ? updatedFlashcard : card
          ))
          notifyFlashcardsUpdated()
          resolve(true)
        }

        request.onerror = () => {
          console.error("Error moving flashcard:", request.error)
          resolve(false)
        }
      })
    } catch (error) {
      console.error("Error moving flashcard:", error)
      return false
    }
  }, [flashcards])

  const getRandomFlashcards = useCallback(
    (count: number): Flashcard[] => {
      const shuffled = [...flashcards].sort(() => Math.random() - 0.5)
      return shuffled.slice(0, Math.min(count, shuffled.length))
    },
    [flashcards]
  )

  const importAllData = useCallback(async (data: { flashcards: Flashcard[]; folders: Folder[] }): Promise<boolean> => {
    try {
      const db = await openDatabase()
      const tx = db.transaction([FLASHCARDS_STORE, FOLDERS_STORE], "readwrite")
      const flashcardsStore = tx.objectStore(FLASHCARDS_STORE)
      const foldersStore = tx.objectStore(FOLDERS_STORE)

      const safeFolders = (data.folders || [])
        .filter((f) => f && typeof f.id === "string" && typeof f.name === "string")
        .map((f) => ({
          id: f.id,
          name: f.name,
          createdAt: typeof f.createdAt === "number" ? f.createdAt : Date.now(),
        }))

      const folderIds = new Set(safeFolders.map((f) => f.id))

      const dedup = new Map<string, Flashcard>()
      for (const card of data.flashcards || []) {
        if (!card || typeof card.id !== "string") continue
        const word = String(card.word ?? "").toLowerCase()
        const pos = String(card.partOfSpeech ?? "")
        if (!word || !pos) continue

        const createdAt = typeof card.createdAt === "number" ? card.createdAt : Date.now()
        const folderId = card.folderId && folderIds.has(card.folderId) ? card.folderId : null
        const key = `${word}__${pos}`

        const normalized: Flashcard = {
          ...card,
          word,
          folderId,
          createdAt,
        }

        const prev = dedup.get(key)
        if (!prev || (prev.createdAt ?? 0) < createdAt) {
          dedup.set(key, normalized)
        }
      }

      const safeCards = Array.from(dedup.values())

      return await new Promise<boolean>((resolve) => {
        const clearFolders = foldersStore.clear()
        clearFolders.onerror = () => resolve(false)
        clearFolders.onsuccess = () => {
          const clearCards = flashcardsStore.clear()
          clearCards.onerror = () => resolve(false)
          clearCards.onsuccess = () => {
            for (const f of safeFolders) {
              foldersStore.put(f)
            }
            for (const c of safeCards) {
              flashcardsStore.put(c)
            }
          }
        }

        tx.oncomplete = () => {
          safeFolders.sort((a, b) => a.name.localeCompare(b.name))
          safeCards.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
          setFolders(safeFolders)
          setFlashcards(safeCards)
          setSelectedFolderId(null)
          notifyFlashcardsUpdated()
          resolve(true)
        }
        tx.onerror = () => resolve(false)
        tx.onabort = () => resolve(false)
      })
    } catch {
      return false
    }
  }, [])

  const addToReviewFolder = useCallback(
    async (id: string): Promise<boolean> => {
      const card = flashcards.find((f) => f.id === id)
      if (!card || card.isReviewFolder) return false
      return updateFlashcard({ ...card, isReviewFolder: true })
    },
    [flashcards, updateFlashcard]
  )

  const removeFromReviewFolder = useCallback(
    async (id: string): Promise<boolean> => {
      const card = flashcards.find((f) => f.id === id)
      if (!card) return false
      return updateFlashcard({ ...card, isReviewFolder: false })
    },
    [flashcards, updateFlashcard]
  )

  const reviewFlashcards = flashcards.filter((f) => f.isReviewFolder === true)

  const filteredFlashcards = selectedFolderId
    ? flashcards.filter(f => f.folderId === selectedFolderId)
    : flashcards

  return {
    flashcards: filteredFlashcards,
    allFlashcards: flashcards,
    reviewFlashcards,
    folders,
    selectedFolderId,
    setSelectedFolderId,
    isLoading,
    addFlashcard,
    deleteFlashcard,
    updateFlashcard,
    moveFlashcardToFolder,
    addFolder,
    deleteFolder,
    addToReviewFolder,
    removeFromReviewFolder,
    getRandomFlashcards,
    importAllData,
    refresh: loadData,
  }
}
