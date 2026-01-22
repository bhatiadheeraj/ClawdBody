'use client'

import { ModalityIcon } from './ModalityIcon'

const MODALITIES = [
  { id: 'computer', name: 'Computer Use', shape: 'computer' as const },
  { id: 'browser', name: 'Browser Agent', shape: 'browser' as const },
  { id: 'tools', name: 'Tools', shape: 'tools' as const },
  { id: 'knowledge', name: 'Knowledge Base', shape: 'knowledge' as const },
  { id: 'sync', name: 'Sync', shape: 'sync' as const },
]

interface ModalityDockProps {
  onIconClick?: (modalityId: string) => void
}

export function ModalityDock({ onIconClick }: ModalityDockProps) {
  const offsetX = 28
  const offsetY = 32

  const handleIconClick = (modalityId: string) => {
    onIconClick?.(modalityId)
  }

  return (
    <div className="modality-dock">
      {MODALITIES.map((modality, index) => (
        <ModalityIcon
          key={modality.id}
          id={modality.id}
          name={modality.name}
          shape={modality.shape}
          onClick={handleIconClick}
          x={index * offsetX}
          y={index * offsetY}
          index={index}
        />
      ))}
    </div>
  )
}

