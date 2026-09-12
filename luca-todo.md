# BankRock Hackathon - Luca's Todo List 📝

Here is the compiled list of the remaining manual actions and API keys you need to handle to get the fully integrated system running flawlessly on Base Sepolia. The subagents have pushed all the code, but you'll need to drop these secrets into your environment:

## 1. Cloudflare Pages / Vercel Environment Variables (`.env.local`)
Please add these keys to your local and production environments:

- `RESEND_API_KEY`: Required to dispatch the automated alert emails via the Resend SDK. (Must start with `re_...`).
- `NEXT_PUBLIC_PIMLICO_API_KEY`: Required by the frontend's Pimlico smart account connector to sponsor ERC-4337 UserOperations. Without this, the real gas sponsorships in the Trade and Transfer modals will fail.
- `NXP_MASTER_KEY`: A 16-byte hex string representing your master symmetric key required to verify the NFC SDM CMAC signatures (defaults to 32 zeros `0000...` if unset).
- `CRON_SECRET`: Required to securely trigger the yield snapshot endpoint `GET /api/cron/snapshot?token=<SECRET>` in production so random people can't spoof your cron.
- `RPC_URL` (Optional): A dedicated Alchemy or Infura Base Sepolia endpoint so your cron workers and frontend hooks don't get rate-limited by the public `https://sepolia.base.org`.
- `SIGNER_PRIVATE_KEY` (Optional): Required if you are using the mocked EIP-712 payload signer in the keeper network to interact with the `BankRockRegistry`.

## 2. Push Notification Infrastructure
The UI instructions for iOS PWA installation and Push Notifications are now beautifully rendered in the new `/alerts` dashboard. However, to actually push Web API notifications to users:
- **Service Worker**: You will need to implement a basic `sw.js` (Service Worker) to listen for the `push` event.
- **VAPID Keys**: You need to generate and configure VAPID keys on your backend to securely authenticate your server to the Apple/Google push services.

## 3. PWA Manifest Icons
- Ensure you have proper high-resolution icons defined in `web/public/manifest.webmanifest` (e.g., `512x512.png` and `192x192.png`) to provide the best native-like experience when users add the site to their iOS or Android home screens, as directed by the Alerts page.

---
*All other tasks, including wiring up the real smart contract interactions, the Viem cron indexer, the AES-128 CMAC decryption, and the Resend SDK, have been fully implemented in the codebase!*
