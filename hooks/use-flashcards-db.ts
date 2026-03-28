"use client"

import { useState, useEffect, useCallback } from "react"
import type { Flashcard, Folder } from "@/lib/types"

const DB_NAME = "vocab-lab-db"
const DB_VERSION = 2
const FLASHCARDS_STORE = "flashcards"
const FOLDERS_STORE = "folders"

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      
      if (!db.objectStoreNames.contains(FLASHCARDS_STORE)) {
        const flashcardsStore = db.createObjectStore(FLASHCARDS_STORE, { keyPath: "id" })
        flashcardsStore.createIndex("word", "word", { unique: true })
        flashcardsStore.createIndex("createdAt", "createdAt", { unique: false })
        flashcardsStore.createIndex("folderId", "folderId", { unique: false })
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

        const flashcardWithFolder = {
          ...flashcard,
          folderId: selectedFolderId,
        }

        return new Promise((resolve) => {
          const request = store.add(flashcardWithFolder)

          request.onsuccess = () => {
            setFlashcards((prev) => [flashcardWithFolder, ...prev])
            resolve(true)
          }

          request.onerror = () => {
            console.error("Error adding flashcard:", request.error)
            resolve(false)
          }
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

  const filteredFlashcards = selectedFolderId
    ? flashcards.filter(f => f.folderId === selectedFolderId)
    : flashcards

  return {
    flashcards: filteredFlashcards,
    allFlashcards: flashcards,
    folders,
    selectedFolderId,
    setSelectedFolderId,
    isLoading,
    addFlashcard,
    deleteFlashcard,
    moveFlashcardToFolder,
    addFolder,
    deleteFolder,
    getRandomFlashcards,
    refresh: loadData,
  }
}
