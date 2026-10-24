'use client';
import { motion, useReducedMotion } from 'motion/react';
import { revealTransition } from '@/lib/motion';
export function Reveal({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={false}
      whileInView={{ opacity: reduced ? 1 : [0.7, 1] }}
      viewport={{ once: true }}
      transition={reduced ? { duration: 0 } : revealTransition}
    >
      {children}
    </motion.div>
  );
}
