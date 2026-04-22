"use client"

import { useCallback } from "react"
import type { GrammarQuestion, GrammarAnsweredRecord, GrammarFolder, GrammarList } from "@/lib/types"

// Completely separate IndexedDB from the flashcards DB
const DB_NAME = "vocab-lab-grammar-db"
const DB_VERSION = 2
const QUESTIONS_STORE = "questions"
const ANSWERED_STORE = "answered"
const FOLDERS_STORE = "grammarFolders"
const LISTS_STORE = "grammarLists"

function openGrammarDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("IndexedDB not available (SSR)"))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      const oldVersion = event.oldVersion

      // v1 stores (created fresh or kept as-is on upgrade)
      if (oldVersion < 1) {
        const qs = db.createObjectStore(QUESTIONS_STORE, { keyPath: "id" })
        qs.createIndex("topic", "topic", { unique: false })
        db.createObjectStore(ANSWERED_STORE, { keyPath: "questionId" })
      }

      // v2 stores: folders + saved lists
      if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
        db.createObjectStore(FOLDERS_STORE, { keyPath: "id" })
      }
      if (!db.objectStoreNames.contains(LISTS_STORE)) {
        const ls = db.createObjectStore(LISTS_STORE, { keyPath: "id" })
        ls.createIndex("folderId", "folderId", { unique: false })
      }
    }
  })
}

export function useGrammarDB() {
  /** Return all cached questions matching the given topic IDs, excluding already-answered IDs. */
  const getQuestionsForTopics = useCallback(
    async (topics: string[], excludeIds: string[] = []): Promise<GrammarQuestion[]> => {
      if (!topics.length) return []
      const db = await openGrammarDB()
      const results: GrammarQuestion[] = []

      for (const topic of topics) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(QUESTIONS_STORE, "readonly")
          const index = tx.objectStore(QUESTIONS_STORE).index("topic")
          const req = index.getAll(topic)
          req.onsuccess = () => {
            const filtered = (req.result as GrammarQuestion[]).filter(
              (q) => !excludeIds.includes(q.id)
            )
            results.push(...filtered)
            resolve()
          }
          req.onerror = () => reject(req.error)
        })
      }

      return results
    },
    []
  )

  /** Persist a newly generated question to the cache. */
  const saveQuestion = useCallback(async (question: GrammarQuestion): Promise<void> => {
    const db = await openGrammarDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(QUESTIONS_STORE, "readwrite")
      tx.objectStore(QUESTIONS_STORE).put(question)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }, [])

  /** Return all question IDs the user has already answered. */
  const getAnsweredIds = useCallback(async (): Promise<string[]> => {
    const db = await openGrammarDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ANSWERED_STORE, "readonly")
      const req = tx.objectStore(ANSWERED_STORE).getAllKeys()
      req.onsuccess = () => resolve(req.result as string[])
      req.onerror = () => reject(req.error)
    })
  }, [])

  /** Record that the user answered a question. */
  const markAnswered = useCallback(async (record: GrammarAnsweredRecord): Promise<void> => {
    const db = await openGrammarDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ANSWERED_STORE, "readwrite")
      tx.objectStore(ANSWERED_STORE).put(record)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }, [])

  /** Clear all answered records so the user can replay questions. */
  const resetAnsweredHistory = useCallback(async (): Promise<void> => {
    const db = await openGrammarDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ANSWERED_STORE, "readwrite")
      tx.objectStore(ANSWERED_STORE).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }, [])

  // ── Folder CRUD ─────────────────────────────────────────────────────────

  const getFolders = useCallback(async (): Promise<GrammarFolder[]> => {
    const db = await openGrammarDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FOLDERS_STORE, "readonly")
      const req = tx.objectStore(FOLDERS_STORE).getAll()
      req.onsuccess = () => resolve(req.result as GrammarFolder[])
      req.onerror = () => reject(req.error)
    })
  }, [])

  const createFolder = useCallback(async (name: string): Promise<GrammarFolder> => {
    const folder: GrammarFolder = { id: crypto.randomUUID(), name, createdAt: Date.now() }
    const db = await openGrammarDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FOLDERS_STORE, "readwrite")
      tx.objectStore(FOLDERS_STORE).put(folder)
      tx.oncomplete = () => resolve(folder)
      tx.onerror = () => reject(tx.error)
    })
  }, [])

  const deleteFolder = useCallback(async (id: string): Promise<void> => {
    const db = await openGrammarDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FOLDERS_STORE, "readwrite")
      tx.objectStore(FOLDERS_STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }, [])

  // ── Saved lists CRUD ─────────────────────────────────────────────────────

  const getLists = useCallback(async (): Promise<GrammarList[]> => {
    const db = await openGrammarDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LISTS_STORE, "readonly")
      const req = tx.objectStore(LISTS_STORE).getAll()
      req.onsuccess = () => resolve(req.result as GrammarList[])
      req.onerror = () => reject(req.error)
    })
  }, [])

  const saveList = useCallback(async (list: GrammarList): Promise<void> => {
    const db = await openGrammarDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LISTS_STORE, "readwrite")
      tx.objectStore(LISTS_STORE).put(list)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }, [])

  const deleteList = useCallback(async (id: string): Promise<void> => {
    const db = await openGrammarDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LISTS_STORE, "readwrite")
      tx.objectStore(LISTS_STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }, [])

  /** Fetch cached questions by IDs, preserving order. */
  const getQuestionsById = useCallback(async (ids: string[]): Promise<GrammarQuestion[]> => {
    if (!ids.length) return []
    const db = await openGrammarDB()
    const results = await Promise.all(
      ids.map(
        (id) =>
          new Promise<GrammarQuestion | undefined>((resolve, reject) => {
            const tx = db.transaction(QUESTIONS_STORE, "readonly")
            const req = tx.objectStore(QUESTIONS_STORE).get(id)
            req.onsuccess = () => resolve(req.result as GrammarQuestion | undefined)
            req.onerror = () => reject(req.error)
          })
      )
    )
    return results.filter((q): q is GrammarQuestion => q !== undefined)
  }, [])

  return {
    getQuestionsForTopics,
    saveQuestion,
    getAnsweredIds,
    markAnswered,
    resetAnsweredHistory,
    getFolders,
    createFolder,
    deleteFolder,
    getLists,
    saveList,
    deleteList,
    getQuestionsById,
  }
}
