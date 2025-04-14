// Here we export some useful types and functions for interacting with the Anchor program.
import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import AceyIDL from '../target/idl/acey.json'
import type { Acey } from '../target/types/acey'

// Re-export the generated IDL and type
export { Acey, AceyIDL }

// The programId is imported from the program IDL.
export const ACEY_PROGRAM_ID = new PublicKey(AceyIDL.address)

// This is a helper function to get the Acey Anchor program.
export function getAceyProgram(provider: AnchorProvider) {
  return new Program(AceyIDL as Acey, provider)
}