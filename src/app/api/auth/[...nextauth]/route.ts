import NextAuth, { NextAuthOptions } from 'next-auth'
import GithubProvider from 'next-auth/providers/github'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/prisma'
import { GitHubClient } from '@/lib/github'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: {
          // Request scopes for creating repos and managing webhooks
          scope: 'read:user user:email repo admin:repo_hook',
        },
      },
    }),
  ],
  callbacks: {
    async redirect({ url, baseUrl }) {
      // Redirect to learning-sources after sign-in
      if (url.startsWith(baseUrl)) {
        return `${baseUrl}/learning-sources`
      }
      // Allow relative callback URLs
      if (url.startsWith('/')) {
        return `${baseUrl}${url}`
      }
      return baseUrl
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id
      }
      return session
    },
    async jwt({ token, account }) {
      // Persist the OAuth access_token to the token right after signin
      if (account) {
        token.accessToken = account.access_token
      }
      return token
    },
    async signIn({ user, account }) {
      // Only process GitHub authentication
      if (account?.provider !== 'github' || !account.access_token) {
        return true
      }

      try {
        // Get or create SetupState for the user
        let setupState = await prisma.setupState.findUnique({
          where: { userId: user.id },
        })

        if (!setupState) {
          setupState = await prisma.setupState.create({
            data: {
              userId: user.id,
              status: 'pending',
            },
          })
        }

        // Check if vaultRepoName exists in SetupState
        if (setupState.vaultRepoName) {
          // Verify the repo still exists on GitHub
          const githubClient = new GitHubClient(account.access_token)
          const repoExists = await githubClient.repoExists(setupState.vaultRepoName)
          
          if (repoExists) {
            // Vault already set up, no action needed
            return true
          }
          
          // Repo doesn't exist, create new vault
          const vaultRepoName = `samantha-vault-${Date.now().toString(36)}`
          const vaultRepo = await githubClient.createVaultRepo(vaultRepoName)
          
          await prisma.setupState.update({
            where: { userId: user.id },
            data: {
              vaultRepoName: vaultRepo.name,
              vaultRepoUrl: vaultRepo.url,
              repoCreated: true,
            },
          })
        } else {
          // No vaultRepoName in DB, create new vault
          const githubClient = new GitHubClient(account.access_token)
          const vaultRepoName = `samantha-vault-${Date.now().toString(36)}`
          const vaultRepo = await githubClient.createVaultRepo(vaultRepoName)
          
          await prisma.setupState.update({
            where: { userId: user.id },
            data: {
              vaultRepoName: vaultRepo.name,
              vaultRepoUrl: vaultRepo.url,
              repoCreated: true,
            },
          })
        }
      } catch (error) {
        // Don't block authentication if vault creation fails
        console.error('Failed to create/verify vault during sign in:', error)
      }

      return true
    },
  },
  pages: {
    signIn: '/',
    error: '/',
  },
  session: {
    strategy: 'database',
  },
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }


