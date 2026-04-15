interface PageHeaderProps {
  title: string
  leading?: React.ReactNode
  children?: React.ReactNode
}

export function PageHeader({ title, leading, children }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6 pb-3 border-b border-border -mx-6 px-6">
      <div className="flex items-center gap-3 min-w-0">
        {leading}
        <h1 className="text-2xl font-bold truncate">{title}</h1>
      </div>
      {children}
    </div>
  )
}
