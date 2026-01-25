'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Loader2, ArrowRight, CheckCircle2, LogOut } from 'lucide-react'

type VMProvider = 'orgo' | 'e2b' | 'flyio' | 'aws' | 'railway' | 'digitalocean' | 'hetzner' | 'modal'

interface VMOption {
  id: VMProvider
  name: string
  description: string
  icon: React.ReactNode
  available: boolean
  comingSoon?: boolean
  url: string
}

const vmOptions: VMOption[] = [
  {
    id: 'orgo',
    name: 'Orgo',
    description: 'Fast, reliable virtual machines optimized for AI workloads.',
    icon: <img src="/logos/orgo.png" alt="Orgo" className="w-12 h-12 object-contain" />,
    available: true,
    url: 'https://orgo.ai',
  },
  {
    id: 'e2b',
    name: 'E2B',
    description: 'Sandboxed cloud environments built for AI agents.',
    icon: <img src="/logos/e2b.png" alt="E2B" className="w-12 h-12 object-contain" />,
    available: false,
    comingSoon: true,
    url: 'https://e2b.dev',
  },
  {
    id: 'flyio',
    name: 'Fly.io',
    description: 'Global edge computing platform with low latency worldwide.',
    icon: <img src="/logos/flyio.png" alt="Fly.io" className="w-12 h-12 object-contain" />,
    available: false,
    comingSoon: true,
    url: 'https://fly.io',
  },
  {
    id: 'aws',
    name: 'AWS',
    description: 'Enterprise-grade cloud infrastructure with extensive services.',
    icon: <img src="/logos/aws.png" alt="AWS" className="w-12 h-12 object-contain" />,
    available: false,
    comingSoon: true,
    url: 'https://aws.amazon.com',
  },
  {
    id: 'railway',
    name: 'Railway',
    description: 'Simple deployment platform loved by indie hackers.',
    icon: <img src="/logos/railway.png" alt="Railway" className="w-12 h-12 object-contain" />,
    available: false,
    comingSoon: true,
    url: 'https://railway.app',
  },
  {
    id: 'digitalocean',
    name: 'DigitalOcean',
    description: 'Developer-friendly cloud with simple, predictable pricing.',
    icon: <img src="/logos/digitalocean.png" alt="DigitalOcean" className="w-12 h-12 object-contain" />,
    available: false,
    comingSoon: true,
    url: 'https://www.digitalocean.com',
  },
  {
    id: 'hetzner',
    name: 'Hetzner',
    description: 'High-performance European cloud at unbeatable prices.',
    icon: <img src="/logos/hetzner.svg" alt="Hetzner" className="w-12 h-12 object-contain" />,
    available: false,
    comingSoon: true,
    url: 'https://www.hetzner.com',
  },
  {
    id: 'modal',
    name: 'Modal',
    description: 'Serverless compute platform optimized for AI workloads.',
    icon: <img src="/logos/modal.svg" alt="Modal" className="w-12 h-12 object-contain" />,
    available: false,
    comingSoon: true,
    url: 'https://modal.com',
  },
]

export default function SelectVMPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [selectedProvider, setSelectedProvider] = useState<VMProvider | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/')
    }
  }, [status, router])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sam-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-sam-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sam-text-dim font-mono text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return null
  }

  const handleSelect = async (provider: VMProvider) => {
    if (!vmOptions.find(opt => opt.id === provider)?.available) {
      return // Don't allow selection of unavailable options
    }

    setSelectedProvider(provider)
    setError(null)
    setIsSubmitting(true)

    try {
      const res = await fetch('/api/setup/select-vm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vmProvider: provider }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save VM provider selection')
      }

      // Redirect to learning sources page
      router.push('/learning-sources')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setIsSubmitting(false)
      setSelectedProvider(null)
    }
  }

  return (
    <div className="min-h-screen bg-sam-bg">
      <div className="max-w-6xl mx-auto px-6 py-16">
        {/* Top Navigation Bar */}
        <div className="flex items-center justify-between mb-12">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-rose-500 via-slate-400 to-teal-400 bg-clip-text text-transparent">
              ClawdBrain
            </span>
          </motion.div>
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            onClick={() => signOut({ callbackUrl: '/' })}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-sam-border hover:border-sam-error/50 text-sam-text-dim hover:text-sam-error transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm font-mono">Sign out</span>
          </motion.button>
        </div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center"
        >
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-4 text-sam-text leading-tight">
            Choose your VM provider
          </h1>
          <p className="text-lg text-sam-text-dim max-w-2xl mx-auto font-body leading-relaxed">
            Select a virtual machine provider to host your AI agent executing tasks 24/7 with persistant memory.
          </p>
        </motion.div>

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-6 p-4 rounded-lg bg-sam-error/10 border border-sam-error/30 flex items-start gap-3"
          >
            <p className="text-sam-error text-sm">{error}</p>
          </motion.div>
        )}

        {/* VM Options Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        >
          {vmOptions.map((option, index) => {
            const isSelected = selectedProvider === option.id
            const isDisabled = !option.available || isSubmitting

            return (
              <motion.button
                key={option.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 * index }}
                onClick={() => handleSelect(option.id)}
                disabled={isDisabled}
                className={`relative p-5 rounded-xl border transition-all duration-300 text-left ${
                  isSelected
                    ? 'border-sam-accent bg-sam-accent/10 shadow-lg shadow-sam-accent/20'
                    : isDisabled
                    ? 'border-sam-border bg-sam-surface/30 opacity-60 cursor-not-allowed'
                    : 'border-sam-border bg-sam-surface/30 hover:border-sam-accent/50 hover:bg-sam-surface/40 cursor-pointer'
                }`}
              >
                {/* Icon */}
                <div className="flex items-center justify-center mb-4 h-14">
                  {option.icon}
                </div>

                {/* Name and Badge */}
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-display font-semibold text-sam-text">
                    {option.name}
                  </h3>
                  {isSelected && (
                    <CheckCircle2 className="w-5 h-5 text-sam-accent" />
                  )}
                </div>
                {option.comingSoon && (
                  <span className="inline-block text-xs font-mono text-sam-text-dim bg-sam-surface px-2 py-0.5 rounded mb-2">
                    Coming Soon
                  </span>
                )}
                {option.available && (
                  <span className="inline-block text-xs font-mono text-green-400 bg-green-400/10 px-2 py-0.5 rounded mb-2">
                    Available
                  </span>
                )}

                {/* Description */}
                <p className="text-sm text-sam-text-dim font-body leading-relaxed mb-3">
                  {option.description}
                </p>

                {/* Learn More Link */}
                <a
                  href={option.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-sm text-sam-accent hover:text-sam-accent/80 transition-colors font-mono"
                >
                  Learn more
                  <ArrowRight className="w-3 h-3" />
                </a>

                {/* Selection Indicator */}
                {isSelected && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute top-4 right-4"
                  >
                    <div className="w-6 h-6 rounded-full bg-sam-accent flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-sam-bg" />
                    </div>
                  </motion.div>
                )}
              </motion.button>
            )
          })}
        </motion.div>

        {/* Continue Button (only show if Orgo is selected) */}
        {selectedProvider === 'orgo' && isSubmitting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center gap-3 text-sam-text-dim"
          >
            <Loader2 className="w-5 h-5 animate-spin text-sam-accent" />
            <span className="font-mono text-sm">Setting up...</span>
          </motion.div>
        )}
      </div>
    </div>
  )
}
