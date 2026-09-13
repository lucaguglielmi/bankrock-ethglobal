"use client";

/**
 * Operator dashboard (spec 15 N-7; spec 17 Part 5 "Admin").
 *
 * It was a `setTimeout` returning $1,254,300 TVL, 42 rocks, 8 Gelato tasks and three invented
 * feed rows. It now reads `GET /api/admin/stats`, which counts what the database holds, and
 * renders the reason when there is nothing to count - a zero TVL would be a measurement claim,
 * so the route returns null for it and this page says so instead.
 *
 * "Contact requests" was a number. It is now the submissions themselves, read from
 * `GET /api/admin/contacts` together with the newsletter sign-ups: the most recent hundred of
 * each, newest first, the message rendered as the text that was typed (React escapes it; nothing
 * is interpreted). On `md` and up each list is a table; below that every row is a card with the
 * column names beside its values, the way the alerts card folds. When a list is empty the page
 * says why rather than showing an empty table.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { formatDateTime } from "@/components/rock/util";
import { cn } from "@/lib/ui/cn";

interface AdminStats {
  state?: string;
  reason?: string;
  rocks?: number;
  events?: number;
  yieldSnapshots?: number;
  subscribers?: number;
  contactRequests?: number;
  tvlUsdc?: number | null;
  tvlMeasuredAt?: string | null;
  generatedAt?: string;
}

interface StatsResult {
  stats?: AdminStats;
  reason?: string;
  needsSignIn?: boolean;
}

interface AdminContact {
  id: string;
  kind: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
}

interface AdminSubscriber {
  email: string;
  topics?: string[];
  source: string | null;
  createdAt: string;
}

interface AdminContacts {
  state?: string;
  reason?: string;
  contacts?: AdminContact[];
  subscribers?: AdminSubscriber[];
  limit?: number;
  generatedAt?: string;
}

interface ContactsResult {
  contacts?: AdminContacts;
  reason?: string;
  needsSignIn?: boolean;
}

const NEEDS_SIGN_IN = "This dashboard needs an operator session.";

async function fetchStats(): Promise<StatsResult> {
  const res = await fetch("/api/admin/stats");
  if (res.status === 401 || res.status === 403) {
    return { reason: NEEDS_SIGN_IN, needsSignIn: true };
  }
  const data = (await res.json()) as AdminStats;
  if (!res.ok || data.state !== "REAL") {
    return { reason: data.reason ?? "The statistics could not be read right now." };
  }
  return { stats: data };
}

async function fetchContacts(): Promise<ContactsResult> {
  const res = await fetch("/api/admin/contacts");
  if (res.status === 401 || res.status === 403) {
    return { reason: NEEDS_SIGN_IN, needsSignIn: true };
  }
  const data = (await res.json()) as AdminContacts;
  if (!res.ok || data.state !== "REAL") {
    return { reason: data.reason ?? "The submissions could not be read right now." };
  }
  return { contacts: data };
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const statsQuery = useQuery({ queryKey: ["admin-stats"], queryFn: fetchStats, retry: false });
  const contactsQuery = useQuery({
    queryKey: ["admin-contacts"],
    queryFn: fetchContacts,
    retry: false,
  });

  const isLoading =
    statsQuery.isPending ||
    statsQuery.isFetching ||
    contactsQuery.isPending ||
    contactsQuery.isFetching;
  const result = statsQuery.data;
  const reason = statsQuery.isError
    ? "The statistics could not be reached right now."
    : (result?.reason ?? null);
  const stats = result?.stats;

  const contactsResult = contactsQuery.data;
  const contactsReason = contactsQuery.isError
    ? "The submissions could not be reached right now."
    : (contactsResult?.reason ?? null);

  const signIn = () => router.push("/admin/login");
  const refresh = () => {
    void statsQuery.refetch();
    void contactsQuery.refetch();
  };

  return (
    <main className="flex w-full flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 py-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-h1 font-extrabold text-ink">Operations</h1>
            <p className="max-w-prose text-sm text-ink-2">
              What the application database currently holds.
            </p>
          </div>
          <Button variant="outline" onClick={refresh} disabled={isLoading}>
            <RefreshCw className={isLoading ? "motion-safe:animate-spin" : ""} />
            Refresh
          </Button>
        </header>

        {isLoading && !result ? (
          <p className="text-base text-ink-3">Reading the database…</p>
        ) : reason ? (
          <UnavailableState
            reason={reason}
            action={result?.needsSignIn ? { label: "Sign in", onClick: signIn } : undefined}
          />
        ) : stats ? (
          <>
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Rocks" value={stats.rocks ?? 0} />
              <StatCard label="Recorded events" value={stats.events ?? 0} />
              <StatCard label="Snapshots" value={stats.yieldSnapshots ?? 0} />
              <StatCard label="Subscribers" value={stats.subscribers ?? 0} />
            </section>

            <section className="flex flex-col gap-2 rounded-2xl border border-border p-4 sm:p-6">
              <h2 className="text-label text-ink-3">Reserve across all rocks</h2>
              {typeof stats.tvlUsdc === "number" ? (
                <>
                  <Amount size="lg" value={stats.tvlUsdc} symbol="USDC" />
                  <p className="text-sm text-ink-3">
                    Measured {formatDateTime(stats.tvlMeasuredAt) ?? "at an unknown time"}.
                  </p>
                </>
              ) : (
                <UnavailableState reason="Nothing has been snapshotted yet, so there is no figure to show." />
              )}
            </section>

            {!contactsResult && (contactsQuery.isPending || contactsQuery.isFetching) ? (
              <Panel title="Contact requests">
                <p className="text-base text-ink-3">Reading the submissions…</p>
              </Panel>
            ) : contactsReason ? (
              <Panel title="Contact requests">
                <UnavailableState
                  reason={contactsReason}
                  action={
                    contactsResult?.needsSignIn ? { label: "Sign in", onClick: signIn } : undefined
                  }
                />
              </Panel>
            ) : contactsResult?.contacts ? (
              <>
                <ContactRequestsPanel
                  contacts={contactsResult.contacts.contacts ?? []}
                  total={stats.contactRequests}
                  generatedAt={contactsResult.contacts.generatedAt}
                />
                <SubscribersPanel
                  subscribers={contactsResult.contacts.subscribers ?? []}
                  total={stats.subscribers}
                  generatedAt={contactsResult.contacts.generatedAt}
                />
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border p-4">
      <span className="text-label text-ink-3">{label}</span>
      <Amount size="lg" value={value} maxFractionDigits={0} />
    </div>
  );
}

/** A bordered section with a `text-label` heading and, when there is one, a count beside it. */
function Panel({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border p-4 sm:p-6">
      <h2 className="flex flex-wrap items-center gap-2 text-label text-ink-3">
        {title}
        {typeof count === "number" ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-label text-ink">
            {count.toLocaleString("en-GB")}
          </span>
        ) : null}
      </h2>
      {children}
    </section>
  );
}

/** "Read 12 Sept 2026, 10:14. Showing the most recent 100 of 132." */
function ReadNote({
  generatedAt,
  shown,
  total,
}: {
  generatedAt?: string;
  shown: number;
  total: number;
}) {
  return (
    <p className="text-sm text-ink-3">
      Read {formatDateTime(generatedAt) ?? "just now"}.
      {total > shown ? ` Showing the most recent ${shown} of ${total}.` : null}
    </p>
  );
}

/**
 * One cell of a folded table: its column name, then the value. The name is visible only while
 * the row is a card; on `md` and up the header row carries it and the name stays for screen
 * readers, so a row reads the same at every width.
 */
function Cell({
  label,
  labelClassName = "md:sr-only",
  className,
  children,
}: {
  label: string;
  labelClassName?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <span className={cn("text-label text-ink-3", labelClassName)}>{label}</span>
      {children}
    </div>
  );
}

/**
 * A text-styled action that is still a 44 px target (spec 17 §4.5). `-my-3` takes the box's
 * extra height back out of the row so its text lines up with the cells beside it.
 */
const TEXT_ACTION =
  "inline-flex min-h-11 min-w-11 items-center rounded-lg text-sm font-medium text-link underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * What may become a `mailto:` link. Anything else is shown as the text it is: the address was
 * validated on the way in, but a link is built from it, so the page checks again rather than
 * trusting the row.
 */
const SIMPLE_EMAIL = /^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function EmailValue({ email }: { email: string }) {
  if (!SIMPLE_EMAIL.test(email)) {
    return <span className="break-all text-sm text-ink">{email}</span>;
  }
  return (
    <a href={`mailto:${email}`} className={cn(TEXT_ACTION, "-my-3 max-w-full break-all")}>
      {email}
    </a>
  );
}

function formLabel(kind: string): string {
  if (kind === "og_rock") return "Testnet rock";
  if (kind === "sponsor") return "Sponsor";
  return kind;
}

/**
 * Received | Form | Name | Email on `md`, with the message on its own line beneath so it has the
 * full width; on `lg` the message becomes the fifth column. Below `md` every row is a card.
 */
const CONTACT_GRID =
  "grid grid-cols-1 gap-x-4 gap-y-2 md:grid-cols-[8.5rem_6.5rem_minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[8.5rem_6.5rem_minmax(0,9rem)_minmax(0,13rem)_minmax(0,1fr)]";

/** Past this, a message starts folded behind a "Show more" toggle. Nothing is ever cut. */
const LONG_MESSAGE_CHARS = 280;
const LONG_MESSAGE_LINES = 4;

function isLongMessage(message: string): boolean {
  return message.length > LONG_MESSAGE_CHARS || message.split("\n").length > LONG_MESSAGE_LINES;
}

function ContactRequestsPanel({
  contacts,
  total,
  generatedAt,
}: {
  contacts: AdminContact[];
  total?: number;
  generatedAt?: string;
}) {
  const shown = contacts.length;
  const count = Math.max(total ?? shown, shown);

  return (
    <Panel title="Contact requests" count={count}>
      {shown === 0 ? (
        <UnavailableState reason="No contact request has been stored yet, so there is nothing to list." />
      ) : (
        <div className="flex flex-col">
          <div
            aria-hidden
            className={cn(CONTACT_GRID, "hidden border-b border-border pb-2 md:grid")}
          >
            <span className="text-label text-ink-3">Received</span>
            <span className="text-label text-ink-3">Form</span>
            <span className="text-label text-ink-3">Name</span>
            <span className="text-label text-ink-3">Email</span>
            <span className="hidden text-label text-ink-3 lg:block">Message</span>
          </div>
          <ul className="flex flex-col">
            {contacts.map((contact) => (
              <ContactRow key={contact.id} contact={contact} />
            ))}
          </ul>
        </div>
      )}
      <ReadNote generatedAt={generatedAt} shown={shown} total={count} />
    </Panel>
  );
}

function ContactRow({ contact }: { contact: AdminContact }) {
  const [expanded, setExpanded] = useState(false);
  const long = isLongMessage(contact.message);
  const messageId = `contact-message-${contact.id}`;

  return (
    <li className={cn(CONTACT_GRID, "border-b border-border py-3 last:border-b-0")}>
      <Cell label="Received">
        <span className="text-sm text-ink-2">
          {formatDateTime(contact.createdAt) ?? "at an unknown time"}
        </span>
      </Cell>
      <Cell label="Form">
        <span className="text-sm text-ink">{formLabel(contact.kind)}</span>
      </Cell>
      <Cell label="Name">
        <span className="text-sm font-semibold text-ink">{contact.name}</span>
      </Cell>
      <Cell label="Email">
        <EmailValue email={contact.email} />
      </Cell>
      <Cell label="Message" labelClassName="lg:sr-only" className="md:col-span-4 lg:col-span-1">
        <p
          id={messageId}
          className={cn(
            "whitespace-pre-wrap wrap-break-word text-sm text-ink",
            long && !expanded ? "line-clamp-4" : null,
          )}
        >
          {contact.message}
        </p>
        {long ? (
          <button
            type="button"
            className={cn(TEXT_ACTION, "self-start")}
            aria-expanded={expanded}
            aria-controls={messageId}
            onClick={() => setExpanded((previous) => !previous)}
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        ) : null}
      </Cell>
    </li>
  );
}

const SUBSCRIBER_GRID =
  "grid grid-cols-1 gap-x-4 gap-y-2 md:grid-cols-[8.5rem_minmax(0,1fr)_minmax(0,1fr)]";

function SubscribersPanel({
  subscribers,
  total,
  generatedAt,
}: {
  subscribers: AdminSubscriber[];
  total?: number;
  generatedAt?: string;
}) {
  const shown = subscribers.length;
  const count = Math.max(total ?? shown, shown);

  return (
    <Panel title="Subscribers" count={count}>
      {shown === 0 ? (
        <UnavailableState reason="No subscriber has been stored yet, so there is nothing to list." />
      ) : (
        <div className="flex flex-col">
          <div
            aria-hidden
            className={cn(SUBSCRIBER_GRID, "hidden border-b border-border pb-2 md:grid")}
          >
            <span className="text-label text-ink-3">Received</span>
            <span className="text-label text-ink-3">Email</span>
            <span className="text-label text-ink-3">Source</span>
          </div>
          <ul className="flex flex-col">
            {subscribers.map((subscriber) => (
              <li
                key={subscriber.email}
                className={cn(SUBSCRIBER_GRID, "border-b border-border py-3 last:border-b-0")}
              >
                <Cell label="Received">
                  <span className="text-sm text-ink-2">
                    {formatDateTime(subscriber.createdAt) ?? "at an unknown time"}
                  </span>
                </Cell>
                <Cell label="Email">
                  <EmailValue email={subscriber.email} />
                </Cell>
                <Cell label="Source">
                  {subscriber.source ? (
                    <span className="break-all text-sm text-ink">{subscriber.source}</span>
                  ) : (
                    <span className="text-sm text-ink-3">Not recorded</span>
                  )}
                </Cell>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ReadNote generatedAt={generatedAt} shown={shown} total={count} />
    </Panel>
  );
}
