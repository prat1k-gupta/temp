interface PageHeaderProps {
  title: string
  children?: React.ReactNode
}

export function PageHeader({ title, children }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6 pb-3 border-b border-border -mx-6 px-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      {children}
    </div>
  )
}
