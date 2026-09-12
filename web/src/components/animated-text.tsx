"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { createElement } from "react";

/** Heading tags this component knows how to animate. */
type HeadingTag = "h1" | "h2" | "h3" | "p" | "span";

interface AnimatedTextProps {
  text: string;
  className?: string;
  delay?: number;
  /** The rendered heading element. @default "h1" */
  as?: HeadingTag;
}

const MOTION_TAGS: Record<HeadingTag, typeof motion.h1> = {
  h1: motion.h1,
  h2: motion.h2 as typeof motion.h1,
  h3: motion.h3 as typeof motion.h1,
  p: motion.p as typeof motion.h1,
  span: motion.span as typeof motion.h1,
};

/**
 * Animates a heading per word (spec 17 §4.7, T-11): each word is an
 * `inline-block` with `white-space: nowrap` so it never breaks mid-word,
 * spaces between words are preserved as ordinary text nodes, and the
 * heading itself has no `overflow: hidden` so descenders and the blur-in
 * are never clipped. Entirely `motion-safe`: under `prefers-reduced-motion`
 * the text renders statically, with no animation at all.
 */
export function AnimatedText({ text, className = "", delay = 0, as = "h1" }: AnimatedTextProps) {
  const words = text.split(" ");
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return createElement(as, { className }, text);
  }

  const container = {
    hidden: { opacity: 0 },
    visible: (i: number = 1) => ({
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: delay * i },
    }),
  };

  const child: Variants = {
    visible: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: {
        type: "spring",
        damping: 12,
        stiffness: 100,
      },
    },
    hidden: {
      opacity: 0,
      y: 10,
      filter: "blur(4px)",
      transition: {
        type: "spring",
        damping: 12,
        stiffness: 100,
      },
    },
  };

  const MotionTag = MOTION_TAGS[as];

  return (
    <MotionTag
      style={{ display: "flex", flexWrap: "wrap" }}
      variants={container}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {words.map((word, index) => (
        <motion.span
          key={index}
          variants={child}
          style={{ display: "inline-block", whiteSpace: "nowrap" }}
        >
          {word}
          {index < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </MotionTag>
  );
}
