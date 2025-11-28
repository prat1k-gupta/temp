import { ReactFlowProvider } from '@xyflow/react'

export default function FlowEditorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ReactFlowProvider>
      {children}
    </ReactFlowProvider>
  )
}

