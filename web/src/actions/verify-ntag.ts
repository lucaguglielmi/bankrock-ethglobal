"use server";

import crypto from "crypto";

export interface VerifyNtagParams {
  uid?: string;
  ctr?: string;
  c?: string; // CMAC
  e?: string; // Encrypted data
}

export interface VerifyResult {
  success: boolean;
  isAuthentic: boolean;
  uid?: string;
  readCount?: number;
  message?: string;
}

// In a real application, you would store the NTAG 424 DNA master keys securely.
// This is a placeholder for the MVP / Hackathon to demonstrate the architecture.
const MOCK_SECRET_KEY = process.env.NTAG_SECRET_KEY || "00000000000000000000000000000000";

export async function verifyNtagSignature(params: VerifyNtagParams): Promise<VerifyResult> {
  try {
    // 1. In a production scenario, you would decode the hex params (e, c) 
    //    and use AES-128-CMAC to verify the SDM MAC.
    // 2. You would decrypt the encrypted file data (e) to get the real UID and Counter (ctr).
    // 3. For the MVP, we simulate a successful verification if the CMAC parameter is present.
    
    if (!params.c && !params.e) {
      return {
        success: false,
        isAuthentic: false,
        message: "No signature parameters provided.",
      };
    }

    // Simulate verification delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Mock validation logic
    const isValid = params.c !== "invalid_signature";

    if (isValid) {
      return {
        success: true,
        isAuthentic: true,
        // Mock parsed values
        uid: params.uid || "04X...XXXX",
        readCount: params.ctr ? parseInt(params.ctr, 16) : 42,
      };
    } else {
      return {
        success: true,
        isAuthentic: false,
        message: "Invalid CMAC signature.",
      };
    }
  } catch (error: any) {
    console.error("NTAG Verification Error:", error);
    return {
      success: false,
      isAuthentic: false,
      message: "Internal server error during verification.",
    };
  }
}
