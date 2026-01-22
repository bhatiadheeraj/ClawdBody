'use client'

import { signIn } from 'next-auth/react'
import { motion } from 'framer-motion'
import { Github } from 'lucide-react'

export function LandingPage() {
  return (
    <div className="os1-shell">
      {/* Coral viewport window */}
      <div className="os1-viewport">
        <div className="os1-viewport-content">
          {/* UI layer for content */}
          <div className="viewport-ui-layer">
            <div className="start-content">
              {/* Title */}
              <motion.h1
                className="start-title"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              >
                OS<sup>1</sup>
              </motion.h1>

              {/* Subtitle */}
              <motion.p
                className="start-subtitle"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                An intuitive operating system
              </motion.p>

              {/* Sign In button with GitHub logo */}
              <motion.button
                className="start-button"
                onClick={() => signIn('github')}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Github />
                <span>Sign In</span>
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
