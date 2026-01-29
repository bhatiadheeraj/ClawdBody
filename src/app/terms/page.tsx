'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function TermsPage() {
  const lastUpdated = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })

  return (
    <div className="min-h-screen relative overflow-hidden bg-sam-bg">
      {/* Background effects */}
      <div className="landing-nebula" />
      <div className="landing-stars" />

      <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* Back button */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Link 
            href="/"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </motion.div>

        {/* Content */}
        <motion.div
          className="max-w-4xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <article className="prose prose-invert prose-lg max-w-none">
            <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-rose-500 via-slate-400 to-teal-400 bg-clip-text text-transparent mb-4">
              ClawdBody – Terms and Conditions
            </h1>
            
            <p className="text-gray-400 text-sm mb-8">
              <strong>Last Updated:</strong> {lastUpdated}
            </p>

            <p className="text-gray-300 leading-relaxed">
              Welcome to <strong>ClawdBody</strong> ("ClawdBody", "we", "our", or "us"). These Terms and Conditions ("Terms") govern your access to and use of the ClawdBody platform, services, software, and website (collectively, the "Service").
            </p>

            <p className="text-gray-300 leading-relaxed">
              By accessing or using ClawdBody, you agree to be bound by these Terms. If you do not agree, you may not use the Service.
            </p>

            <hr className="border-white/10 my-8" />

            <Section number="1" title="Description of Service">
              <p>
                ClawdBody provides tools to deploy, manage, and operate automation agents ("ClawdBots") across cloud-based virtual machines and infrastructure using third-party services and APIs.
              </p>
              <p>
                ClawdBody does <strong>not</strong> provide cloud infrastructure, API services, or credentials itself. The Service relies on integrations with third-party providers selected and configured by the user.
              </p>
            </Section>

            <Section number="2" title="User Responsibilities">
              <p>You are solely responsible for:</p>
              <ul>
                <li>All actions performed using your ClawdBody account</li>
                <li>Any infrastructure, cloud resources, or third-party services you connect to the Service</li>
                <li>Compliance with all applicable laws, provider terms, and usage policies</li>
              </ul>
              <p>You agree not to use ClawdBody for unlawful, abusive, or malicious purposes.</p>
            </Section>

            <Section number="3" title="API Keys, Credentials, and Secrets">
              <h4 className="text-white font-semibold mt-6 mb-3">3.1 Ownership and Responsibility</h4>
              <p>You acknowledge and agree that:</p>
              <ul>
                <li>Any API keys, access tokens, credentials, or secrets ("API Keys") you provide remain <strong>your sole property</strong></li>
                <li>You are fully responsible for the security, rotation, revocation, and proper usage of all API Keys</li>
                <li>You are responsible for ensuring that your use of API Keys complies with the terms of the relevant third-party providers</li>
              </ul>

              <h4 className="text-white font-semibold mt-6 mb-3">3.2 Storage and Handling</h4>
              <p>While ClawdBody may temporarily store API Keys to enable functionality:</p>
              <ul>
                <li>ClawdBody does <strong>not</strong> assume ownership or liability for any API Keys</li>
                <li>ClawdBody makes no guarantees regarding the suitability of API Keys for any particular use</li>
                <li>You acknowledge that storing credentials always carries inherent risk</li>
              </ul>

              <h4 className="text-white font-semibold mt-6 mb-3">3.3 Limitation of Liability for API Keys</h4>
              <p>ClawdBody shall <strong>not</strong> be responsible or liable for:</p>
              <ul>
                <li>Unauthorized access to your API Keys</li>
                <li>Misuse, overuse, or abuse of third-party services using your API Keys</li>
                <li>Charges, costs, rate limits, suspensions, or bans imposed by third-party providers</li>
                <li>Data loss, service disruption, or security incidents caused by compromised credentials</li>
              </ul>
              <p>You assume <strong>full responsibility</strong> for any consequences arising from the use of your API Keys.</p>
            </Section>

            <Section number="4" title="Third-Party Services">
              <p>ClawdBody integrates with third-party services (e.g., cloud providers, APIs, infrastructure platforms).</p>
              <ul>
                <li>We do not control or endorse third-party services</li>
                <li>We are not responsible for outages, changes, pricing, or policy updates of third-party providers</li>
                <li>Your use of third-party services is governed by their respective terms and conditions</li>
              </ul>
            </Section>

            <Section number="5" title="Security Disclaimer">
              <p>While we take reasonable measures to protect the Service:</p>
              <ul>
                <li>No system is completely secure</li>
                <li>You acknowledge and accept the inherent risks of cloud-based software and credential usage</li>
                <li>You are encouraged to use least-privilege access, rotate keys regularly, and monitor usage</li>
              </ul>
            </Section>

            <Section number="6" title="Data and Logs">
              <p>ClawdBody may collect operational logs, metadata, and usage metrics for:</p>
              <ul>
                <li>Service functionality</li>
                <li>Debugging and performance optimization</li>
                <li>Security monitoring</li>
              </ul>
              <p>We do <strong>not</strong> claim ownership over your data or credentials.</p>
            </Section>

            <Section number="7" title="Service Availability">
              <p>The Service is provided on an <strong>"as is"</strong> and <strong>"as available"</strong> basis.</p>
              <p>We do not guarantee:</p>
              <ul>
                <li>Continuous availability</li>
                <li>Error-free operation</li>
                <li>Compatibility with all third-party services</li>
              </ul>
            </Section>

            <Section number="8" title="Limitation of Liability">
              <p>To the maximum extent permitted by law, ClawdBody shall not be liable for:</p>
              <ul>
                <li>Indirect, incidental, special, or consequential damages</li>
                <li>Loss of data, revenue, profits, or business opportunities</li>
                <li>Costs incurred due to third-party services or infrastructure usage</li>
              </ul>
              <p>Our total liability shall not exceed the amount paid by you to ClawdBody in the preceding 12 months, or zero if no fees were paid.</p>
            </Section>

            <Section number="9" title="Indemnification">
              <p>You agree to indemnify and hold harmless ClawdBody, its founders, employees, and affiliates from any claims, damages, or liabilities arising from:</p>
              <ul>
                <li>Your use of the Service</li>
                <li>Your API Keys or third-party integrations</li>
                <li>Your violation of these Terms or applicable laws</li>
              </ul>
            </Section>

            <Section number="10" title="Termination">
              <p>We reserve the right to suspend or terminate access to the Service at any time for:</p>
              <ul>
                <li>Violations of these Terms</li>
                <li>Security risks</li>
                <li>Abuse or misuse of the Service</li>
              </ul>
              <p>You may stop using the Service at any time.</p>
            </Section>

            <Section number="11" title="Changes to These Terms">
              <p>We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance of the updated Terms.</p>
            </Section>

            <Section number="12" title="Contact">
              <p>If you have questions about these Terms, contact us on Discord:</p>
              <p>
                <a 
                  href="https://discord.gg/26Hcy7V9" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-teal-400 hover:text-teal-300"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                  Join our Discord
                </a>
              </p>
              <p><strong>Company:</strong> ClawdBody</p>
            </Section>

            {/* Development Notice */}
            <div className="mt-12 p-6 bg-amber-500/10 border border-amber-500/30 rounded-xl">
              <p className="text-amber-400 text-sm flex items-start gap-2">
                <span className="text-lg">⚠️</span>
                <span>
                  <strong>Notice:</strong> This Service is currently in active development. Users should assume responsibility for validating outputs, monitoring activity, and safeguarding credentials.
                </span>
              </p>
            </div>
          </article>
        </motion.div>

        {/* Footer */}
        <motion.footer
          className="mt-16 pt-8 border-t border-white/10 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <p className="text-gray-500 text-sm">
            © {new Date().getFullYear()} ClawdBody. All rights reserved.
          </p>
        </motion.footer>
      </div>
    </div>
  )
}

function Section({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <section className="my-8">
      <h2 className="text-2xl font-bold text-white mb-4">
        {number}. {title}
      </h2>
      <div className="text-gray-300 leading-relaxed space-y-4">
        {children}
      </div>
    </section>
  )
}
