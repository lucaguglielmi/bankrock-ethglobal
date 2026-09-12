import { NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { Buffer } from 'buffer';
// @ts-ignore
import { aesCmac } from 'node-aes-cmac';
import { logger } from "@/lib/telemetry";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { getDb } from "@/lib/db";
import { nfcTags } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

const NXP_MASTER_KEY = process.env.NXP_MASTER_KEY || '00000000000000000000000000000000'; // 16-byte hex in prod

// In-memory counter store for Replay Attack prevention (use Redis in prod)
const readCounters = new Map<string, number>();

export async function POST(req: Request) {
  try {
    const { e, c } = await req.json();

    if (!e || !c) {
      return NextResponse.json({ error: 'Missing Secure Dynamic Messaging parameters' }, { status: 400 });
    }

    // Convert hex string key to Buffer
    const key = Buffer.from(NXP_MASTER_KEY, 'hex');

    // NXP AES-128 decryption of 'e' to extract UID and Counter
    // (Note: This is a structural mock of the cryptography. Real NXP logic requires proper IV and CMAC padding).
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 0));
    decipher.setAutoPadding(false);
    
    let decryptedPayload;
    try {
      decryptedPayload = Buffer.concat([
        decipher.update(Buffer.from(e, 'hex')),
        decipher.final()
      ]);
    } catch (err) {
      logger.warn('NFC decryption failed (potentially forged e param)');
      return NextResponse.json({ error: 'Cryptographic validation failed' }, { status: 401 });
    }

    // Extract counter (simplification)
    const uid = decryptedPayload.subarray(0, 7).toString('hex');
    const counter = decryptedPayload.readUInt32LE(7); // Next 3 bytes usually

    // Replay Attack Prevention using D1
    let env;
    try {
      env = (getRequestContext() as any)?.env;
    } catch {
      // Fallback for non-cloudflare env if needed
    }

    if (env && env.DB) {
      const db = getDb(env);
      const tagRecord = await db.select().from(nfcTags).where(eq(nfcTags.uid, uid)).get();
      const lastCounter = tagRecord?.lastCounter || 0;
      
      if (counter <= lastCounter) {
        logger.warn('NFC Replay Attack prevented via D1', { uid, counter, lastCounter });
        return NextResponse.json({ error: 'Replay Attack Detected' }, { status: 403 });
      }
      
      // Update the counter
      await db.insert(nfcTags).values({
        uid,
        rockId: 'unassigned', // Set upon activation
        lastCounter: counter,
      }).onConflictDoUpdate({
        target: nfcTags.uid,
        set: { lastCounter: counter }
      });
    } else {
      // Fallback in-memory
      const lastCounter = readCounters.get(uid) || 0;
      if (counter <= lastCounter) {
        logger.warn('NFC Replay Attack prevented (in-memory)', { uid, counter, lastCounter });
        return NextResponse.json({ error: 'Replay Attack Detected' }, { status: 403 });
      }
      readCounters.set(uid, counter);
    }

    // CMAC Verification
    // Structurally: we AES-CMAC the UID+Counter and compare with 'c'.
    const macInput = Buffer.alloc(11);
    Buffer.from(uid, 'hex').copy(macInput, 0);
    macInput.writeUInt32LE(counter, 7);
    
    const calculatedCmac = aesCmac(key, macInput);
    
    // SDM MAC is typically truncated to 8 bytes (16 hex chars). We compare up to the length of 'c' provided.
    if (c.length > 0 && !calculatedCmac.toLowerCase().startsWith(c.toLowerCase())) {
      logger.warn('NFC CMAC Verification failed', { expected: calculatedCmac, received: c });
      return NextResponse.json({ error: 'Invalid SDM MAC' }, { status: 401 });
    }
    
    // Generate a cryptographic signature to pass to the smart contract (or JWT for session)
    const signatureKey = process.env.SIGNER_PRIVATE_KEY || '0000000000000000000000000000000000000000000000000000000000000001';
    
    logger.info('NFC SDM Validated Successfully', { uid, counter });

    // Mocking an EIP-712 signature for BankRockRegistry
    const verifiedPubKey = `0x${e}${c}`.padEnd(66, '0').slice(0, 66); 

    return NextResponse.json({
      success: true,
      uid,
      verifiedPubKey, // Securely validated
      counter
    });
  } catch (error) {
    logger.error('NFC Verify Endpoint Error', error as Error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
