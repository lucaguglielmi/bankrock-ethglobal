import { describe, expect, it } from "vitest";
import {
  ALERT_TOPIC_IDS,
  DEFAULT_ALERT_TOPICS,
  coerceTopics,
  parseTopicsInput,
} from "./alerts";

describe("coerceTopics", () => {
  it("returns the defaults for an empty or malformed column", () => {
    expect(coerceTopics(null)).toEqual(DEFAULT_ALERT_TOPICS);
    expect(coerceTopics(undefined)).toEqual(DEFAULT_ALERT_TOPICS);
    expect(coerceTopics({})).toEqual(DEFAULT_ALERT_TOPICS);
    expect(coerceTopics("nonsense")).toEqual(DEFAULT_ALERT_TOPICS);
    expect(coerceTopics([true, false])).toEqual(DEFAULT_ALERT_TOPICS);
  });

  it("does not hand back the shared default objects", () => {
    const result = coerceTopics(null);
    result.loss_warning.push = false;
    expect(DEFAULT_ALERT_TOPICS.loss_warning.push).toBe(true);
  });

  it("maps an old one-boolean row onto both channels", () => {
    const result = coerceTopics({
      loss_warning: true,
      dangerous_trade: false,
      gas_depletion: true,
    });
    expect(result.loss_warning).toEqual({ push: true, email: true });
    expect(result.dangerous_trade).toEqual({ push: false, email: false });
    // A topic the old row turned on that the defaults leave off follows the row, not the default.
    expect(result.gas_depletion).toEqual({ push: true, email: true });
    // Topics the old row never mentioned take their default.
    expect(result.profit_milestone).toEqual(DEFAULT_ALERT_TOPICS.profit_milestone);
    expect(result.custody_transfer).toEqual(DEFAULT_ALERT_TOPICS.custody_transfer);
    expect(result.genesis_drop).toEqual(DEFAULT_ALERT_TOPICS.genesis_drop);
  });

  it("keeps a two-channel row as written and fills a missing channel from the default", () => {
    const result = coerceTopics({
      loss_warning: { push: false, email: true },
      gas_depletion: { email: true },
      genesis_drop: { push: "yes", email: false },
    });
    expect(result.loss_warning).toEqual({ push: false, email: true });
    expect(result.gas_depletion).toEqual({ push: false, email: true });
    expect(result.genesis_drop).toEqual({ push: true, email: false });
  });

  it("drops unknown keys and always yields every known topic", () => {
    const result = coerceTopics({ weather: true, loss_warning: false }) as Record<string, unknown>;
    expect(Object.keys(result).sort()).toEqual([...ALERT_TOPIC_IDS].sort());
    expect(result.weather).toBeUndefined();
  });
});

describe("parseTopicsInput", () => {
  it("treats an absent field as no change", () => {
    expect(parseTopicsInput(undefined)).toEqual({ ok: true, topics: {} });
    expect(parseTopicsInput(null)).toEqual({ ok: true, topics: {} });
  });

  it("accepts a partial set of well-formed topics and ignores unknown keys", () => {
    const result = parseTopicsInput({
      loss_warning: { push: true, email: false, extra: 1 },
      weather: { push: true, email: true },
    });
    expect(result).toEqual({
      ok: true,
      topics: { loss_warning: { push: true, email: false } },
    });
  });

  it("refuses the old boolean form and any non-boolean channel", () => {
    expect(parseTopicsInput({ loss_warning: true }).ok).toBe(false);
    expect(parseTopicsInput({ loss_warning: { push: 1, email: true } }).ok).toBe(false);
    expect(parseTopicsInput({ loss_warning: { push: true } }).ok).toBe(false);
    expect(parseTopicsInput("all").ok).toBe(false);
    expect(parseTopicsInput([]).ok).toBe(false);
  });
});
