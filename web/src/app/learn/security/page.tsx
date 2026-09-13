import Link from "next/link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Term } from "@/components/ui/term";

/**
 * "Security" - what protects a rock and its owner, in the words the threat model uses
 * (spec 06, spec 03 trust boundaries, DEMO-STATE §7), with no claim the code does not back.
 *
 * What this page no longer has: a three-button poll that recorded nothing and a feedback form
 * whose submit handler only prevented the default - both were surfaces that looked like they
 * worked and did not. Feedback goes to the security address the contracts publish.
 *
 * The global header and the page frame come from the root layout and `globals.css`.
 */

export const metadata = {
  title: "Security - Bank Rock",
  description:
    "What protects a Bank Rock and its owner: the chip, the signed tap, the account, the registry and what none of them can do.",
};

const SECURITY_CONTACT = "security@bank-rock.com";

export default function SecurityPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-white text-ink">
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-16 pt-12">
        <header className="flex flex-col items-center gap-6 text-center">
          <h1 className="text-h1 font-extrabold">Security</h1>
          <p className="max-w-prose text-lead text-ink-2">
            The stone proves it was tapped. Your wallet proves it is you. Neither the chip nor our
            servers can move the rock&rsquo;s money.
          </p>
        </header>

        <section className="flex flex-col gap-6">
          <h2 className="text-h2 font-bold">What protects you</h2>

          <Accordion className="w-full">
            <AccordionItem value="chip">
              <AccordionTrigger className="min-h-12 text-base font-semibold">
                The chip holds no key
              </AccordionTrigger>
              <AccordionContent className="max-w-prose text-base text-ink-2">
                The <Term k="nfcTag" /> inside a rock is passive and holds one web link. It never
                stores a private key, a password or anything that could spend. Someone who steals
                the stone can open its public page and nothing more: the money is in the{" "}
                <Term k="rockAccount" />, and only the owner&rsquo;s wallet can move it.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="copy">
              <AccordionTrigger className="min-h-12 text-base font-semibold">
                A copied link proves nothing
              </AccordionTrigger>
              <AccordionContent className="max-w-prose text-base text-ink-2">
                On every tap the <Term k="ntag424" /> chip writes a fresh <Term k="cmac" /> and a{" "}
                <Term k="readCounter" /> into its link. Our server checks the code with the
                tag&rsquo;s key and accepts a counter only if it is higher than the last one it
                stored. A <Term k="copiedLink" /> therefore fails, and the{" "}
                <Term k="verifiedPhysical" /> badge cannot be painted by anything running in a
                browser. The check runs on the server only, in one place.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="attestation">
              <AccordionTrigger className="min-h-12 text-base font-semibold">
                The tap is turned into a signed note, not a permission
              </AccordionTrigger>
              <AccordionContent className="max-w-prose text-base text-ink-2">
                After a good tap the server signs an <Term k="attestation" />: a{" "}
                <Term k="eip712" /> naming the rock, the chip, the counter, a short deadline, the
                wallet it is for and the account it opens. The <Term k="registry" /> accepts it
                for exactly two things - awakening a rock and claiming a gift. It can never spend,
                and the key that signs it holds no funds.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="custody">
              <AccordionTrigger className="min-h-12 text-base font-semibold">
                Self-custody, in the plain sense
              </AccordionTrigger>
              <AccordionContent className="max-w-prose text-base text-ink-2">
                The Rock Account is a <Term k="safe" /> with one owner: your <Term k="embeddedWallet" />{" "}
                from <Term k="privy" />. Every action it takes is a <Term k="userOperation" /> that
                your wallet signed. Bank Rock&rsquo;s servers prepare screens and pay{" "}
                <Term k="gas" />; they hold no key that can sign for the account. The registry
                itself holds no tokens and has no function that takes an approval.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="gift">
              <AccordionTrigger className="min-h-12 text-base font-semibold">
                A gift cannot be redirected
              </AccordionTrigger>
              <AccordionContent className="max-w-prose text-base text-ink-2">
                A <Term k="handover" /> names its recipient on the chain. The <Term k="claim" /> is
                paid for by a <Term k="relayer" /> because the recipient has no ETH, but the
                registry credits the wallet named inside the signed attestation, so the relayer
                cannot send the rock elsewhere. The change of owner on the Rock Account is signed
                by the giver when the gift is opened, checked by the bundler before it is stored,
                and lands before the registry claim; if it does not land, nothing changes.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="mcp">
              <AccordionTrigger className="min-h-12 text-base font-semibold">
                The AI endpoint only reads
              </AccordionTrigger>
              <AccordionContent className="max-w-prose text-base text-ink-2">
                The <Term k="mcp" /> server can read a rock&rsquo;s owner, balances and fees from
                the chain and explain them to an <Term k="agent" />. It holds no key of any kind
                and cannot sign, so it cannot move, start or stop anything. Server logs it relays
                are labelled as untrusted text before an agent sees them.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="honest">
              <AccordionTrigger className="min-h-12 text-base font-semibold">
                Nothing is shown that was not read
              </AccordionTrigger>
              <AccordionContent className="max-w-prose text-base text-ink-2">
                Every number on a rock page is either read live from the chain or shown as
                unavailable with the reason. There is no fallback value, no invented transaction
                hash, and no rate of return anywhere. A transaction counts as done only when its
                receipt says it succeeded.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        <section className="flex flex-col gap-6 rounded-3xl border border-border bg-muted/50 p-6 sm:p-8">
          <h2 className="text-h2 font-bold">What it does not protect against yet</h2>
          <p className="max-w-prose text-base text-ink-2">
            This is a testnet build on <Term k="sepolia" />, and some things are deliberately left
            for a network where a rock is worth something. They are written down so that
            &ldquo;we decided to wait&rdquo; and &ldquo;we forgot&rdquo; never look the same.
          </p>
          <ul className="flex flex-col gap-3 text-base text-ink-2">
            <li>
              <strong className="font-medium text-ink">Your sign-in is the key.</strong> Someone
              who takes over your Privy login can act as your wallet without holding the rock.
              Making the rock a required second factor for large moves is the first roadmap item.
            </li>
            <li>
              <strong className="font-medium text-ink">One attestation signer.</strong> A single
              server key states that taps happened. Splitting it across independent signers is
              required before real value.
            </li>
            <li>
              <strong className="font-medium text-ink">The <Term k="lostFlag" /> freezes nothing.</strong>{" "}
              It is a warning to visitors. Holding the rock was never what controlled the money, so
              losing it does not put the money at risk either.
            </li>
            <li>
              <strong className="font-medium text-ink">Retiring is final.</strong> A retired rock
              cannot be revived. Its account and history stay readable, and the chip can start a
              new rock.
            </li>
            <li>
              <strong className="font-medium text-ink">Tokens sent to the trade router are lost.</strong>{" "}
              <Term k="xycSwapTaker" /> has no owner and no rescue function on purpose; you approve
              it, you never send to it.
            </li>
          </ul>

        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-h2 font-bold">Found a flaw?</h2>
          <p className="max-w-prose text-base text-ink-2">
            Tell us. The contracts publish the same address:{" "}
            <a
              href={`mailto:${SECURITY_CONTACT}`}
              className="text-link underline-offset-4 hover:underline"
            >
              {SECURITY_CONTACT}
            </a>
            . Everything the site does is open source, and the addresses of every contract a rock
            touches are on its Contracts tab and on{" "}
            <Term k="etherscan" />. If security is your thing and you want to help, we would like
            to hear from you.
          </p>
          <p className="max-w-prose text-sm text-ink-3">
            For how the pieces fit together, see{" "}
            <Link href="/learn/rock" className="text-link underline-offset-4 hover:underline">
              the physical rock
            </Link>{" "}
            and{" "}
            <Link href="/learn/defi" className="text-link underline-offset-4 hover:underline">
              the DeFi position
            </Link>
            .
          </p>
        </section>
      </article>
    </main>
  );
}
