import { Skeleton } from '@/components/ui/skeleton'

interface LoadingStateProps {
  message?: string
  variant?: 'default' | 'table'
  columns?: number
  rows?: number
}

export function LoadingState({ message, variant = 'default', columns = 5, rows = 8 }: LoadingStateProps = {}) {
  if (variant === 'table') {
    return (
      <div className="space-y-2">
        {message && (
          <p className="text-sm text-muted-foreground text-center mb-4">{message}</p>
        )}
        {/* Header row */}
        <div className="flex gap-3 px-4 py-2">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
        {/* Data rows */}
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div key={rowIdx} className="flex gap-3 px-4 py-3 border-t">
            {Array.from({ length: columns }).map((_, colIdx) => (
              <Skeleton
                key={colIdx}
                className="h-4 flex-1"
                style={{ opacity: 1 - rowIdx * 0.08 }}
              />
            ))}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {message && (
        <p className="text-sm text-muted-foreground text-center">{message}</p>
      )}
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}
