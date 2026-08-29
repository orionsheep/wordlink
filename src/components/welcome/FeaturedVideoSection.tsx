'use client';

import { motion } from 'framer-motion';
import { MEDIA } from '@/lib/welcome-media';
import MediaPlaceholder from './MediaPlaceholder';

export default function FeaturedVideoSection() {
  const hasVideo = MEDIA.featuredVideo !== '';

  return (
    <section className="overflow-hidden bg-black px-6 pb-20 pt-6 md:pb-32 md:pt-10">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.9 }}
          className="relative aspect-video overflow-hidden rounded-3xl"
        >
          {hasVideo ? (
            <>
              <video
                className="h-full w-full object-cover"
                src={MEDIA.featuredVideo}
                muted
                autoPlay
                loop
                playsInline
                preload="auto"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            </>
          ) : (
            <MediaPlaceholder label="核心演示视频" />
          )}

          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-6 p-6 md:flex-row md:items-end md:justify-between md:p-10">
            <div className="liquid-glass max-w-md rounded-2xl p-6 md:p-8">
              <p className="mb-3 text-xs uppercase tracking-widest text-white/50">我们的方法</p>
              <p className="text-sm leading-relaxed text-white md:text-base">
                查词只是开始。Lexiverse 以语境、联想与科学的记忆节奏,
                把每一个生词,变成如母语般自然的直觉。
              </p>
            </div>

            <motion.a
              href="#how"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="liquid-glass shrink-0 self-start rounded-full px-8 py-3 text-sm font-medium text-white md:self-auto"
            >
              了解更多
            </motion.a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
