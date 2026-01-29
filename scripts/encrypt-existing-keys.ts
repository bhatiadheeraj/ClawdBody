/**
 * Migration script to encrypt existing unencrypted keys in the database
 * 
 * Usage:
 * 1. Set ENCRYPTION_KEY environment variable (or use a .env file)
 * 2. Run: npx tsx scripts/encrypt-existing-keys.ts
 * 
 * This script will:
 * - Find all SetupState records with unencrypted sensitive fields
 * - Find all VM records with unencrypted awsPrivateKey
 * - Encrypt those fields and update the records
 * 
 * The script is idempotent - already encrypted values will be skipped.
 */

import { PrismaClient } from '@prisma/client'
import { 
  encrypt, 
  isEncrypted,
  generateEncryptionKey,
  SETUP_STATE_SENSITIVE_FIELDS,
  VM_SENSITIVE_FIELDS,
} from '../src/lib/encryption'

const prisma = new PrismaClient()

async function main() {
  console.log('🔐 Starting encryption migration...\n')
  
  // Check if ENCRYPTION_KEY is set
  if (!process.env.ENCRYPTION_KEY && process.env.NODE_ENV !== 'development') {
    console.log('⚠️  ENCRYPTION_KEY not set!')
    console.log('   Generate a new key with:')
    console.log(`   ENCRYPTION_KEY="${generateEncryptionKey()}"`)
    console.log('\n   Add this to your .env file or Railway environment variables.\n')
    
    if (process.env.NODE_ENV !== 'development') {
      process.exit(1)
    }
    console.log('   Running in development mode with default key...\n')
  }
  
  // Process SetupState records
  console.log('📋 Processing SetupState records...')
  const setupStates = await prisma.setupState.findMany()
  let setupStateUpdated = 0
  let setupStateSkipped = 0
  
  for (const state of setupStates) {
    const updates: Record<string, string> = {}
    let hasUpdates = false
    
    for (const field of SETUP_STATE_SENSITIVE_FIELDS) {
      const value = state[field as keyof typeof state] as string | null
      
      if (value && !isEncrypted(value)) {
        updates[field] = encrypt(value)
        hasUpdates = true
        console.log(`   ✓ Encrypting ${field} for user ${state.userId.substring(0, 8)}...`)
      }
    }
    
    if (hasUpdates) {
      await prisma.setupState.update({
        where: { id: state.id },
        data: updates,
      })
      setupStateUpdated++
    } else {
      setupStateSkipped++
    }
  }
  
  console.log(`   ${setupStateUpdated} SetupState records updated`)
  console.log(`   ${setupStateSkipped} SetupState records already encrypted or empty\n`)
  
  // Process VM records
  console.log('🖥️  Processing VM records...')
  const vms = await prisma.vM.findMany()
  let vmUpdated = 0
  let vmSkipped = 0
  
  for (const vm of vms) {
    const updates: Record<string, string> = {}
    let hasUpdates = false
    
    for (const field of VM_SENSITIVE_FIELDS) {
      const value = vm[field as keyof typeof vm] as string | null
      
      if (value && !isEncrypted(value)) {
        updates[field] = encrypt(value)
        hasUpdates = true
        console.log(`   ✓ Encrypting ${field} for VM ${vm.id.substring(0, 8)}...`)
      }
    }
    
    if (hasUpdates) {
      await prisma.vM.update({
        where: { id: vm.id },
        data: updates,
      })
      vmUpdated++
    } else {
      vmSkipped++
    }
  }
  
  console.log(`   ${vmUpdated} VM records updated`)
  console.log(`   ${vmSkipped} VM records already encrypted or empty\n`)
  
  // Summary
  console.log('✅ Migration complete!')
  console.log(`   Total SetupState records: ${setupStates.length}`)
  console.log(`   Total VM records: ${vms.length}`)
  console.log(`   Records encrypted: ${setupStateUpdated + vmUpdated}`)
  
  if (setupStateUpdated > 0 || vmUpdated > 0) {
    console.log('\n⚠️  Important: Make sure ENCRYPTION_KEY is set in production!')
    console.log('   The same key must be used to decrypt the data.')
  }
}

main()
  .catch((error) => {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
