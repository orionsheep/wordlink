'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

export default function AboutSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section id="about" className="relative overflow-hidden bg-black px-6 pb-10 pt-32 md:pb-14 md:pt-44">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.03)_0%,_transparent_70%)]" />

      <div ref={ref} className="relative mx-auto max-w-6xl">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-6 text-sm uppercase tracking-widest text-white/40"
        >
          关于 Lexiverse 语宙
        </motion.p>

        <motion.h2
          initial={{ opacity: 0, y: 40 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="font-serif-display text-4xl leading-[1.1] tracking-tight text-white md:text-6xl lg:text-7xl"
        >
          为每一个认真记词的学习者,
          <br className="hidden md:block" />{' '}
          <span className="font-serif-display italic text-white/60">
            把孤立的单词,连成一片认知星图。
          </span>
        </motion.h2>
      </div>
    </section>
  );
}
