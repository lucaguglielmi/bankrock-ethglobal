import Image from "next/image";
import Link from "next/link";
import { Term } from "@/components/ui/term";

/**
 * "The physical" — what a Bank Rock is, what the chip inside it does, and what one tap sets in
 * motion. Written for someone who has never held a crypto wallet: every unfamiliar word is a
 * glossary `Term`, and the page claims nothing DEMO-STATE lists as simulated or unavailable.
 *
 * The global header and the page frame (top clearance, side gutters) come from the root layout
 * and `globals.css`; this page does not add its own.
 */

export const metadata = {
  title: "The physical rock — Bank Rock",
  description:
    "What a Bank Rock is made of, what the chip inside it does, and what happens when you tap it.",
};

export default function RockPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-white text-ink">
      <article className="mx-auto flex w-full max-w-6xl flex-col gap-24 pt-12">
        <header className="flex flex-col items-center gap-6 text-center">
          <h1 className="text-h1 font-extrabold">The physical rock</h1>
          <p className="max-w-prose text-lead text-ink-2">
            A real stone you can hold and hand to someone. Tap it with a phone and its page opens.
            The stone identifies itself; it never holds a key and it never holds money.
          </p>
        </header>

        {/* What is inside */}
        <section className="grid grid-cols-1 items-center gap-12 md:grid-cols-2 lg:gap-24">
          <div className="order-2 flex flex-col gap-6 md:order-1">
            <h2 className="text-h2 font-bold">What is inside</h2>
            <div className="flex flex-col gap-4 text-base text-ink-2">
              <p>
                Every <Term k="bankRock" /> is an ordinary river stone with a tiny{" "}
                <Term k="nfcTag" /> set into it under a drop of coloured resin. The chip is an{" "}
                <Term k="ntag424" />. It needs no battery: the phone powers it for the instant of
                the <Term k="tap" />.
              </p>
              <p>
                The chip holds one web link, and nothing else. On every tap it rewrites two parts
                of that link: a <Term k="readCounter" /> that goes up by one, and a{" "}
                <Term k="cmac" /> made with a key that never leaves the chip. Our server checks
                both. If they are right, the page shows the <Term k="verifiedPhysical" /> badge.
              </p>
              <p>
                Because the chip carries no key and no password, a stolen rock does not give
                anyone the money. The rock&rsquo;s tokens live in its own{" "}
                <Term k="rockAccount" />, and only the owner&rsquo;s wallet can move them. The
                stone is <Term k="selfCustody">self-custodial</Term> by construction.
              </p>
            </div>

            <div className="mt-2 rounded-2xl border border-border bg-muted/50 p-6">
              <p className="max-w-prose text-sm font-medium text-ink">
                About the hackathon demo. There is one prototype rock, and rock 3 on this site is
                its real record on <Term k="sepolia" />. Until the chip is programmed, a private
                demo link plays the part of the chip and hands the rest of the flow the same signed
                code a real tap would; everything after that point — the check, the counter, the{" "}
                <Term k="attestation" />, the on-chain awakening — is the real path. Rock 3 was
                awakened through that link with the synthetic tag 04DE3057A11E80; its on-chain
                counter (367523) is minutes since 2026-01-01, not a chip read count. No physical
                chip has been tapped yet. Rock 420 is a
                stage prop: it lives only in your browser, is badged as a demo on every value, and
                touches nothing on chain. The full list of what is still simulated is public in the
                repository&rsquo;s <span className="font-semibold">DEMO-STATE.md</span>.
              </p>
            </div>
          </div>

          <div className="order-1 flex flex-col gap-6 md:order-2">
            <div className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-3xl border border-border bg-muted shadow-xl">
              <Image
                src="/infographics/photo_rock_red_resin.jpg"
                alt="A black rock held in a hand with a red glittery resin drop"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>
            <div className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-3xl border border-border bg-muted shadow-xl">
              <Image
                src="/infographics/photo_finger_nfc.jpg"
                alt="A fingertip holding the NFC chip, for size"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>
          </div>
        </section>

        {/* What one tap does */}
        <section className="grid grid-cols-1 items-center gap-12 md:grid-cols-2 lg:gap-24">
          <div className="order-1 flex justify-center">
            <div className="relative aspect-square w-full max-w-md overflow-hidden rounded-3xl border border-border bg-white shadow-xl">
              <Image
                src="/infographics/activation_flow.jpg"
                alt="From a tap on the rock to an account on the chain, in four steps"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>
          </div>

          <div className="order-2 flex flex-col gap-6">
            <h2 className="text-h2 font-bold">What one tap does</h2>
            <ol className="flex flex-col gap-4 text-base text-ink-2">
              <li className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-background">
                  1
                </span>
                <p>
                  <strong className="font-medium text-ink">The link opens.</strong> Our server
                  checks the chip&rsquo;s signed code and counter. A <Term k="copiedLink" /> fails
                  here, so the badge is something only a real tap can earn.
                </p>
              </li>
              <li className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-background">
                  2
                </span>
                <p>
                  <strong className="font-medium text-ink">You sign in.</strong> <Term k="privy" />{" "}
                  turns an email, a <Term k="passkey" /> or a social login into an{" "}
                  <Term k="embeddedWallet" />. There is no seed phrase and nothing to install.
                </p>
              </li>
              <li className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-background">
                  3
                </span>
                <p>
                  <strong className="font-medium text-ink">The server signs a note.</strong> The{" "}
                  <Term k="attestation" /> says a real tap happened for your wallet, names the rock,
                  and names the account it will open. Its address is{" "}
                  <Term k="counterfactual" /> and follows the chip, so the same rock always opens
                  the same account for you.
                </p>
              </li>
              <li className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-background">
                  4
                </span>
                <p>
                  <strong className="font-medium text-ink">The rock wakes up.</strong> One{" "}
                  <Term k="sponsoredTransaction" /> creates the <Term k="rockAccount" /> and records
                  you as the owner in the <Term k="registry" />. You need no ETH for{" "}
                  <Term k="gas" />: a <Term k="paymaster" /> pays it.
                </p>
              </li>
            </ol>
            <p className="max-w-prose text-base text-ink-2">
              From then on, anyone who taps the rock can see it and trade with it, and only you can
              start or stop its <Term k="strategy">strategies</Term> or give it away. How that
              part works is on{" "}
              <Link href="/learn/defi" className="text-link underline-offset-4 hover:underline">
                the DeFi position
              </Link>{" "}
              page.
            </p>
          </div>
        </section>

        {/* Giving it away */}
        <section className="flex flex-col gap-6 rounded-3xl border border-border bg-muted/50 p-8 md:p-12">
          <h2 className="text-h2 font-bold">Giving it away</h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <p className="max-w-prose text-base text-ink-2">
              A rock is meant to change hands. The owner names who it is for and signs once; that
              opens a <Term k="handover" /> in the registry and pre-signs the change of owner on
              the <Term k="rockAccount" />, because the giver will not be there when the gift is
              collected. Then they hand over the stone.
            </p>
            <p className="max-w-prose text-base text-ink-2">
              The recipient taps it, signs in, and the <Term k="claim" /> goes through with no ETH
              on their side: a <Term k="relayer" /> pays the fee, and the account keeps its address
              and everything in it. Whoever taps a gifted rock without being named for it sees only
              its public page.
            </p>
          </div>
        </section>
      
        {/* A Quirky History Lesson */}
        <section className="grid grid-cols-1 items-center gap-12 pt-8 md:grid-cols-2 lg:gap-24">
          <div className="order-2 flex flex-col gap-6 md:order-1">
            <h2 className="text-h2 font-bold">A short history of liquidity</h2>
            <div className="flex flex-col gap-4 text-base text-ink-2">
              <p>
                In the 15th century, <strong className="font-medium text-ink">Lorenzo de&rsquo; Medici</strong> and his family revolutionised the global banking system right here in Florence. They scaled the use of double-entry bookkeeping, letters of credit, and holding companies — effectively inventing modern finance as we know it.
              </p>
              <p>
                Exactly 530 years later, the very first Bank Rock was gathered from the rocky bed of the Arno river near Florence, ready to launch the next great financial revolution: Decentralised Finance. 
              </p>
              <p>
                We like to think Lorenzo would have appreciated the sheer irony of replacing an entire banking empire with an ordinary river stone.
              </p>
            </div>
          </div>

          <div className="order-1 flex justify-center md:order-2">
            <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-muted shadow-xl">
              <Image
                src="/infographics/medici.jpg"
                alt="Portrait of Lorenzo de' Medici"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
              {/* Comic bubble */}
              <div className="absolute right-4 top-8 -rotate-6 rounded-2xl border-2 border-ink bg-white px-4 py-2 shadow-lg sm:right-8 sm:top-10">
                <p className="text-base font-bold text-ink sm:text-lg">
                  &ldquo;Banks are so 1330&rdquo;
                </p>
                {/* Comic bubble tail */}
                <div className="absolute -bottom-[9px] left-6 h-4 w-4 rotate-45 border-b-2 border-r-2 border-ink bg-white" />
              </div>
            </div>
          </div>
        </section>
      </article>
    </main>
  );
}
