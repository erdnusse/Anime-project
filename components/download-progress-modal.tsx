"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Check, X, Download, AlertCircle, Loader2 } from "lucide-react"
import type { DownloadProgress } from "@/lib/download-manager"

interface DownloadProgressModalProps {
  isOpen: boolean
  onClose: () => void
  progress: DownloadProgress | null
  onCancel: () => void
  onDownloadZip: () => void
}

export default function DownloadProgressModal({
  isOpen,
  onClose,
  progress,
  onCancel,
  onDownloadZip,
}: DownloadProgressModalProps) {
  const [canClose, setCanClose] = useState(false)

  useEffect(() => {
    if (progress?.isComplete || progress?.error) {
      setCanClose(true)
    }
  }, [progress])

  if (!progress) return null

  const overallProgressPercent = Math.round(progress.overallProgress * 100)
  const currentChapterProgress = progress.currentChapter
    ? Math.round((progress.currentChapter.progress / Math.max(1, progress.currentChapter.total)) * 100)
    : 0

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && canClose) {
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Downloading {progress.mangaTitle}</DialogTitle>
          <DialogDescription>
            {progress.error
              ? "An error occurred during download."
              : progress.isComplete
                ? "Download completed successfully!"
                : `Downloading ${progress.completedChapters} of ${progress.totalChapters} chapters`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Overall progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Overall progress</span>
              <span>{overallProgressPercent}%</span>
            </div>
            <Progress value={overallProgressPercent} className="h-2" />
          </div>

          {/* Current chapter progress */}
          {progress.currentChapter && !progress.isComplete && !progress.error && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>
                  {progress.currentChapter.title} ({progress.currentChapter.progress} of {progress.currentChapter.total}{" "}
                  pages)
                </span>
                <span>{currentChapterProgress}%</span>
              </div>
              <Progress value={currentChapterProgress} className="h-2" />
            </div>
          )}

          {/* Chapter list */}
          <div className="mt-4 max-h-60 overflow-y-auto border rounded-md">
            <div className="p-2 bg-muted font-medium text-sm">Chapters</div>
            <div className="divide-y">
              {progress.currentChapter && (
                <div className="p-2 flex items-center justify-between">
                  <span className="text-sm truncate flex-1">{progress.currentChapter.title}</span>
                  <span className="flex items-center">
                    {progress.currentChapter.error ? (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    ) : progress.currentChapter.completed ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Error message */}
          {progress.error && (
            <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">{progress.error}</div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          {!progress.isComplete && !progress.error && (
            <Button variant="outline" onClick={onCancel}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          )}

          {progress.isComplete && (
            <Button onClick={onDownloadZip}>
              <Download className="mr-2 h-4 w-4" />
              Save Zip File
            </Button>
          )}

          {(progress.isComplete || progress.error) && (
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

