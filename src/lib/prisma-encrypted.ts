/**
 * Prisma helpers with automatic encryption/decryption for sensitive fields
 */

import { prisma } from './prisma'
import { 
  encrypt, 
  decrypt, 
  encryptFields, 
  decryptFields,
  SETUP_STATE_SENSITIVE_FIELDS,
  VM_SENSITIVE_FIELDS,
} from './encryption'
import type { SetupState, VM, Prisma } from '@prisma/client'

// Type for the sensitive fields
type SetupStateSensitiveField = typeof SETUP_STATE_SENSITIVE_FIELDS[number]
type VMSensitiveField = typeof VM_SENSITIVE_FIELDS[number]

/**
 * Encrypt SetupState data before saving
 */
export function encryptSetupStateData<T extends Partial<SetupState>>(data: T): T {
  return encryptFields(data, SETUP_STATE_SENSITIVE_FIELDS as unknown as (keyof T)[])
}

/**
 * Decrypt SetupState data after reading
 */
export function decryptSetupStateData<T extends Partial<SetupState>>(data: T | null): T | null {
  if (!data) return null
  return decryptFields(data, SETUP_STATE_SENSITIVE_FIELDS as unknown as (keyof T)[])
}

/**
 * Encrypt VM data before saving
 */
export function encryptVMData<T extends Partial<VM>>(data: T): T {
  return encryptFields(data, VM_SENSITIVE_FIELDS as unknown as (keyof T)[])
}

/**
 * Decrypt VM data after reading
 */
export function decryptVMData<T extends Partial<VM>>(data: T | null): T | null {
  if (!data) return null
  return decryptFields(data, VM_SENSITIVE_FIELDS as unknown as (keyof T)[])
}

/**
 * Helper to create SetupState with encrypted fields
 */
export async function createSetupStateEncrypted(
  data: Prisma.SetupStateCreateInput
): Promise<SetupState> {
  const encryptedData = encryptSetupStateData(data as Partial<SetupState>)
  const result = await prisma.setupState.create({ data: encryptedData as Prisma.SetupStateCreateInput })
  return decryptSetupStateData(result)!
}

/**
 * Helper to update SetupState with encrypted fields
 */
export async function updateSetupStateEncrypted(
  where: Prisma.SetupStateWhereUniqueInput,
  data: Prisma.SetupStateUpdateInput
): Promise<SetupState> {
  const encryptedData = encryptSetupStateData(data as Partial<SetupState>)
  const result = await prisma.setupState.update({ where, data: encryptedData as Prisma.SetupStateUpdateInput })
  return decryptSetupStateData(result)!
}

/**
 * Helper to upsert SetupState with encrypted fields
 */
export async function upsertSetupStateEncrypted(
  where: Prisma.SetupStateWhereUniqueInput,
  create: Prisma.SetupStateCreateInput,
  update: Prisma.SetupStateUpdateInput
): Promise<SetupState> {
  const encryptedCreate = encryptSetupStateData(create as Partial<SetupState>)
  const encryptedUpdate = encryptSetupStateData(update as Partial<SetupState>)
  const result = await prisma.setupState.upsert({
    where,
    create: encryptedCreate as Prisma.SetupStateCreateInput,
    update: encryptedUpdate as Prisma.SetupStateUpdateInput,
  })
  return decryptSetupStateData(result)!
}

/**
 * Helper to find SetupState and decrypt fields
 */
export async function findSetupStateDecrypted(
  where: Prisma.SetupStateWhereUniqueInput
): Promise<SetupState | null> {
  const result = await prisma.setupState.findUnique({ where })
  return decryptSetupStateData(result)
}

/**
 * Helper to create VM with encrypted fields
 */
export async function createVMEncrypted(
  data: Prisma.VMCreateInput
): Promise<VM> {
  const encryptedData = encryptVMData(data as Partial<VM>)
  const result = await prisma.vM.create({ data: encryptedData as Prisma.VMCreateInput })
  return decryptVMData(result)!
}

/**
 * Helper to update VM with encrypted fields
 */
export async function updateVMEncrypted(
  where: Prisma.VMWhereUniqueInput,
  data: Prisma.VMUpdateInput
): Promise<VM> {
  const encryptedData = encryptVMData(data as Partial<VM>)
  const result = await prisma.vM.update({ where, data: encryptedData as Prisma.VMUpdateInput })
  return decryptVMData(result)!
}

/**
 * Helper to find VM and decrypt fields
 */
export async function findVMDecrypted(
  where: Prisma.VMWhereUniqueInput
): Promise<VM | null> {
  const result = await prisma.vM.findUnique({ where })
  return decryptVMData(result)
}

/**
 * Helper to find first VM and decrypt fields
 */
export async function findFirstVMDecrypted(
  args: Prisma.VMFindFirstArgs
): Promise<VM | null> {
  const result = await prisma.vM.findFirst(args)
  return decryptVMData(result)
}

/**
 * Helper to find many VMs and decrypt fields
 */
export async function findManyVMsDecrypted(
  args?: Prisma.VMFindManyArgs
): Promise<VM[]> {
  const results = await prisma.vM.findMany(args)
  return results.map(vm => decryptVMData(vm)!)
}
