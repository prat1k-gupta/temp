"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface ConversionModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  fromType: string
  toType: string
  reason: string
}

export function ConversionModal({ isOpen, onClose, onConfirm, fromType, toType, reason }: ConversionModalProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Convert Node Type</AlertDialogTitle>
          <AlertDialogDescription>
            <div className="space-y-2">
              <div>
                Converting from <strong>{fromType}</strong> to <strong>{toType}</strong>.
              </div>
              <div className="text-sm text-muted-foreground">{reason}</div>
              <div className="text-sm font-medium">I understand and remember this constraint.</div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Convert</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
