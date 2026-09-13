import Image from "next/image";
import Link from "next/link";
import { Term } from "@/components/ui/term";

/**
 * "The DeFi position" - how a rock's money is offered for trading without ever leaving the rock.
 *
 * The facts here are the ones the code enforces (spec 04, `contracts/contracts/aqua/NOTES.md`):
 * Aqua holds nothing; starting a strategy moves no tokens; three fee tiers; several strategies
 * over one reserve; the fee stays inside the rock's own account; a visitor trades through our
 * small taker contract; stopping a strategy is the withdrawal and is final. Nothing here is a
 * yield or a rate of return (D-004).
 *
 * The global header and the page frame come from the root layout and `globals.css`.
 */

export const metadata = {
  title: "The DeFi position - Bank Rock",
  description:
    "How a rock offers its tokens for trading through 1inch Aqua while the tokens stay in the rock's own account.",
};

const TIERS = [
  {
    name: "Tight",
    fee: "0.05%",
    line: "Trades most often and keeps a little each time; for a rock that likes to be busy.",
  },
  {
    name: "Wide",
    fee: "0.30%",
    line: "Trades steadily and keeps a fair slice of each one; the middle of the road.",
  },
  {
    name: "Patient",
    fee: "1.00%",
    line: "Trades rarely and keeps the most each time; for a rock content to wait.",
  },
] as const;

export default function DefiPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-white text-ink">
      <article className="mx-auto flex w-full max-w-6xl flex-col gap-24 pt-12">
        <header className="flex flex-col items-center gap-6 text-center">
          <h1 className="text-h1 font-extrabold">The DeFi position</h1>
          <p className="max-w-prose text-lead text-ink-2">
            A rock holds two tokens and offers them for trading. The tokens never leave the rock.
            Every trade leaves a small fee behind, inside the rock.
          </p>
        </header>

        {/* Aqua */}
        <section className="grid grid-cols-1 items-center gap-12 md:grid-cols-2 lg:gap-24">
          <div className="order-2 flex flex-col gap-6 md:order-1">
            <h2 className="text-h2 font-bold">The money stays in the rock</h2>
            <div className="flex flex-col gap-4 text-base text-ink-2">
              <p>
                Normally, to let people trade against your tokens you have to hand them to a pool
                first. Bank Rock uses <Term k="aqua" />, a 1inch protocol that works the other way
                round: the tokens stay in the rock&rsquo;s own <Term k="rockAccount" />, and Aqua
                only keeps count of how much each <Term k="strategy" /> is allowed to trade.
              </p>
              <p>
                In Aqua&rsquo;s words the rock is the <Term k="maker" />: it offers tokens and sets
                the price. A visitor who trades with it is the <Term k="taker" />. When a trade
                happens, the tokens move straight between the two accounts. Aqua itself holds
                nothing, before or after.
              </p>
              <p>
                Because nothing is handed over, one <Term k="reserve" /> can back several
                strategies at once, and each can be started or stopped on its own.
              </p>
            </div>
          </div>
          <div className="order-1 flex justify-center md:order-2">
            <div className="relative aspect-square w-full max-w-md overflow-hidden rounded-3xl border border-border bg-white shadow-xl">
              <Image
                src="/infographics/why_aqua.jpg"
                alt="One balance in the rock's account, offered to several strategies at once"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>
          </div>
        </section>

        {/* Starting a strategy */}
        <section className="grid grid-cols-1 items-center gap-12 md:grid-cols-2 lg:gap-24">
          <div className="order-1 flex justify-center">
            <div className="relative aspect-square w-full max-w-md overflow-hidden rounded-3xl border border-border bg-white shadow-xl">
              <Image
                src="/infographics/aqua_architecture.jpg"
                alt="The Rock Account, Aqua, the pricing contract and the trade router"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>
          </div>
          <div className="order-2 flex flex-col gap-6">
            <h2 className="text-h2 font-bold">Starting a strategy moves nothing</h2>
            <div className="flex flex-col gap-4 text-base text-ink-2">
              <p>
                The owner tops up the rock by sending it <Term k="usdc" /> and <Term k="weth" />,
                then taps <em>Start earning</em>. That one <Term k="sponsoredTransaction" /> gives
                Aqua an <Term k="allowance" /> over the two tokens and starts a strategy. This is
                what Aqua calls <Term k="ship">shipping</Term>, and it is not a deposit: the
                rock&rsquo;s balance is the same before and after.
              </p>
              <p>
                A strategy is one standing offer at one <Term k="feeTier" />, priced by a{" "}
                <Term k="constantProduct" /> in the <Term k="xycSwap" /> contract. Once started it
                cannot be edited. To change the fee you stop it and start another; a rock can run
                all three at once over the same reserve, and Bank Rock calls each live one a{" "}
                <Term k="stream" />.
              </p>
            </div>

            <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border">
              {TIERS.map((tier) => (
                <li key={tier.name} className="flex flex-col gap-1 p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-base font-semibold text-ink">{tier.name}</span>
                    <span className="text-num tabular-nums text-ink">{tier.fee}</span>
                  </div>
                  <p className="text-sm text-ink-2">{tier.line}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* The three numbers */}
        <section className="flex flex-col gap-8 rounded-3xl border border-border bg-muted/50 p-8 md:p-12">
          <div className="mx-auto flex max-w-2xl flex-col gap-4 text-center">
            <h2 className="text-h2 font-bold">Three numbers that are never added up</h2>
            <p className="text-base text-ink-2">
              The dashboard shows a rock&rsquo;s money as three separate figures, because they mean
              three different things.
            </p>
          </div>

          <dl className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-white p-5">
              <dt className="text-h3 font-semibold text-ink">
                <Term k="reserve">Reserve</Term>
              </dt>
              <dd className="text-base text-ink-2">
                What the Rock Account really holds right now. One balance, shared by every stream.
              </dd>
            </div>
            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-white p-5">
              <dt className="text-h3 font-semibold text-ink">
                <Term k="virtualBalance">Virtual balance</Term>
              </dt>
              <dd className="text-base text-ink-2">
                How much one stream is allowed to trade. A limit written down in Aqua, not a
                separate pile of tokens. Two streams&rsquo; limits can add up to more than the rock
                holds, which is why they are never summed.
              </dd>
            </div>
            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-white p-5">
              <dt className="text-h3 font-semibold text-ink">
                <Term k="executable">Available to trade</Term>
              </dt>
              <dd className="text-base text-ink-2">
                What a stream can really settle at this moment: the smallest of its limit, the
                reserve, and what Aqua may spend. A trade on one stream lowers this for the others.
              </dd>
            </div>
          </dl>
        </section>

        {/* Trading and fees */}
        <section className="grid grid-cols-1 items-start gap-12 md:grid-cols-2 lg:gap-24">
          <div className="flex flex-col gap-6">
            <h2 className="text-h2 font-bold">How a trade happens</h2>
            <ol className="flex flex-col gap-4 text-base text-ink-2">
              <li>
                <strong className="font-medium text-ink">1. A quote.</strong> The price comes from
                the same pricing contract the trade will run through, on the same block. There is
                no outside price feed. The page shows the <Term k="priceImpact" /> and{" "}
                <Term k="minimumReceived" /> before you confirm.
              </li>
              <li>
                <strong className="font-medium text-ink">2. One sponsored transaction.</strong> The
                visitor&rsquo;s own <Term k="personalAccount" /> approves the amount and calls{" "}
                <Term k="xycSwapTaker" />. That small Bank Rock contract exists because the pricing
                contract settles by calling back into whoever called it, which a plain wallet cannot
                answer. It holds nothing and has no owner.
              </li>
              <li>
                <strong className="font-medium text-ink">3. Tokens move between the two accounts.</strong>{" "}
                The rock pays out from its own reserve; the visitor&rsquo;s tokens land in the
                rock&rsquo;s reserve. What you received is read back from the chain, never from the
                preview.
              </li>
            </ol>
          </div>

          <div className="flex flex-col gap-6">
            <h2 className="text-h2 font-bold">Where the fee goes</h2>
            <div className="flex flex-col gap-4 text-base text-ink-2">
              <p>
                The <Term k="fee" /> is the slice of every trade the price did not pay out for. It
                stays in the rock&rsquo;s own reserve, so there is nothing to collect and no
                separate pot. The dashboard shows two things about it: the rate, read from the
                strategy, and the total so far, added up from Aqua&rsquo;s own trade records on the
                chain.
              </p>
              <p>
                Bank Rock never shows a rate of return. A rock can also lose value: see the risks
                below.
              </p>
            </div>

            <h2 className="text-h2 font-bold">Stopping is the withdrawal</h2>
            <p className="text-base text-ink-2">
              To <Term k="cashIn">cash in</Term>, the owner stops a stream. Aqua calls this{" "}
              <Term k="dock">docking</Term>. No tokens come back, because none ever left; the
              offer simply closes. A stopped stream can never be restarted - a new one is started
              instead. Sending the tokens somewhere else afterwards is an ordinary transfer from the
              Rock Account, unrelated to Aqua.
            </p>
          </div>
        </section>

        {/* Risks */}
        <section className="flex flex-col gap-6">
          <h2 className="text-h2 font-bold">The risks, plainly</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-border p-5">
              <h3 className="text-h3 font-semibold text-ink">
                <Term k="divergenceLoss">Divergence loss</Term>
              </h3>
              <p className="mt-2 text-base text-ink-2">
                Offering both tokens means you end up holding more of the one that fell. After a
                big price move you can be worse off than if you had simply kept the tokens.
              </p>
            </div>
            <div className="rounded-2xl border border-border p-5">
              <h3 className="text-h3 font-semibold text-ink">
                <Term k="smartContractRisk">Smart-contract risk</Term>
              </h3>
              <p className="mt-2 text-base text-ink-2">
                The rock relies on Aqua, the pricing contract, our trade router and the Safe it is
                built on. A bug or an attack in any of them could put what the rock holds at risk.
              </p>
            </div>
            <div className="rounded-2xl border border-border p-5">
              <h3 className="text-h3 font-semibold text-ink">Test money only</h3>
              <p className="mt-2 text-base text-ink-2">
                Today everything runs on <Term k="sepolia" />, where the tokens are free and worth
                nothing. The mechanics are real; the value is not.
              </p>
            </div>
          </div>
        </section>

        {/* Not yet */}
        <section className="flex flex-col gap-4 rounded-3xl border border-border p-8 md:p-12">
          <h2 className="text-h2 font-bold">What this build does not do</h2>
          <ul className="flex flex-col gap-3 text-base text-ink-2">
            <li>
              It does not earn interest on idle tokens. Routing to a lending protocol is a roadmap
              idea, not something the code does.
            </li>
            <li>
              It has no automated rebalancer and no AI that trades. The{" "}
              <Link href="/mcp" className="text-link underline-offset-4 hover:underline">
                AI Oracle
              </Link>{" "}
              can read a rock and explain it; it cannot move anything.
            </li>
            <li>
              It does not bridge tokens from other networks. A rock is topped up by an ordinary
              transfer to its address on Sepolia.
            </li>
            <li>
              A rock funded with only one of the two tokens must be topped up with the other
              before it can trade in both directions. Converting half inside the start step is
              designed but not built yet.
            </li>
          </ul>
        </section>
      </article>
    </main>
  );
}
