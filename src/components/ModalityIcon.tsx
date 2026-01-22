'use client'

import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

const MODALITY_SHAPES = {
  computer: 'computer',
  browser: 'browser',
  tools: 'tools',
  knowledge: 'knowledge',
  sync: 'sync',
} as const

const SVG_PATHS = {
  computer: (
    <>
      <rect x="6" y="8" width="32" height="22" rx="2" fill="none" />
      <line x1="22" y1="30" x2="22" y2="36" />
      <line x1="14" y1="36" x2="30" y2="36" />
    </>
  ),
  browser: (
    <>
      <circle cx="22" cy="22" r="16" fill="none" />
      <ellipse cx="22" cy="22" rx="8" ry="16" fill="none" />
      <line x1="6" y1="22" x2="38" y2="22" />
      <path d="M8,14 Q22,18 36,14" fill="none" />
      <path d="M8,30 Q22,26 36,30" fill="none" />
    </>
  ),
  tools: (
    <>
      <line x1="8" y1="12" x2="36" y2="12" />
      <circle cx="28" cy="12" r="3" />
      <line x1="8" y1="22" x2="36" y2="22" />
      <circle cx="16" cy="22" r="3" />
      <line x1="8" y1="32" x2="36" y2="32" />
      <circle cx="24" cy="32" r="3" />
    </>
  ),
  knowledge: (
    <>
      <circle cx="22" cy="12" r="5" fill="none" />
      <circle cx="12" cy="32" r="5" fill="none" />
      <circle cx="32" cy="32" r="5" fill="none" />
      <line x1="22" y1="17" x2="14" y2="28" />
      <line x1="22" y1="17" x2="30" y2="28" />
      <line x1="17" y1="32" x2="27" y2="32" />
    </>
  ),
  sync: (
    <>
      <path d="M22,8 A14,14 0 0,1 36,22" fill="none" />
      <path d="M22,36 A14,14 0 0,1 8,22" fill="none" />
      <polygon points="36,18 36,26 30,22" fill="currentColor" stroke="none" />
      <polygon points="8,18 8,26 14,22" fill="currentColor" stroke="none" />
    </>
  ),
}

interface ModalityIconProps {
  id: string
  name: string
  shape: keyof typeof MODALITY_SHAPES
  onClick?: (id: string) => void
  x: number
  y: number
  index: number
}

export function ModalityIcon({ id, name, shape, onClick, x, y, index }: ModalityIconProps) {
  const [isActive, setIsActive] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const strokeColor = id === 'computer' 
    ? '#c65a43' 
    : id === 'browser'
    ? 'rgba(180, 145, 120, 0.85)'
    : 'rgba(165, 135, 115, 0.8)'

  const hoverStrokeColor = id === 'computer'
    ? 'rgba(198, 90, 67, 0.9)'
    : 'rgba(140, 100, 80, 1)'

  const activeStrokeColor = '#c65a43'

  return (
    <motion.div
      className="modality-icon"
      data-modality={id}
      title={name}
      style={{
        position: 'absolute',
        left: `${x}px`,
        bottom: `${y}px`,
        width: '40px',
        height: '40px',
        cursor: 'pointer',
        zIndex: 100 - index,
      }}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: 0.4,
        delay: 0.3 + index * 0.1,
        ease: [0.34, 1.56, 0.64, 1],
      }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onClick={() => onClick?.(id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.(id)
        }
      }}
      tabIndex={0}
      role="button"
    >
      <svg
        viewBox="0 0 44 44"
        fill="none"
        style={{
          width: '100%',
          height: '100%',
          stroke: isActive ? activeStrokeColor : isHovered ? hoverStrokeColor : strokeColor,
          strokeWidth: isActive ? 2 : id === 'computer' ? 1.8 : 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          transition: 'all 300ms ease',
          color: isActive ? activeStrokeColor : isHovered ? hoverStrokeColor : strokeColor,
        }}
      >
        {SVG_PATHS[shape]}
      </svg>
    </motion.div>
  )
}

